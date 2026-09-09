/**
 * APIRotatorService — provider-agnostic 8-key failover rotator.
 *
 * Design invariants (see docs/architecture.md §4.1):
 *  - Exactly one key is ACTIVE at a time; all others are IDLE or COOLDOWN.
 *  - Conversation state lives OUTSIDE this class, so switching keys never
 *    drops context (stateless HTTP completions + persisted transcript).
 *  - Failover triggers: HTTP 429, rate-limit/quota bodies, token limits, timeouts.
 *  - Background health checks reinstate keys once their cooldown/reset window clears.
 */
import type { ChatCompletion, KeyConfig, RotatorPolicy, RotatorStats } from './types.js';

export type KeyState = 'IDLE' | 'ACTIVE' | 'COOLDOWN';

export interface ManagedKey extends KeyConfig {
  state: KeyState;
  cooldownUntilMs: number;
  stats: RotatorStats;
}

export interface RotatorResult {
  ok: boolean;
  /** Which key id served the request. */
  keyId: string;
  /** Provider display name. */
  provider: string;
  /** Final completion if a key succeeded. */
  completion?: ChatCompletion;
  /** HTTP status that caused failure, if any. */
  status?: number;
  error?: string;
  /** Total failovers that occurred while serving this request. */
  failovers: number;
  /** True if the rotator fell back to offline mode (all keys exhausted). */
  degraded: boolean;
}

const DEFAULT_POLICY: Required<RotatorPolicy> = {
  failoverOn: ['429', 'rate_limit', 'quota', 'timeout', '5xx'],
  cooldownBaseSec: 30,
  healthCheckIntervalSec: 60,
  timeoutMs: 20_000,
  maxRetries: 8,
};

const RATE_LIMIT_STATUSES = new Set([429]);
const TOKEN_ERRORS = ['token', 'context_length', 'max_tokens', 'input too long', 'prompt too long'];

export interface RotationEntry {
  at: string;
  from: string;
  to: string;
  reason: string;
}

export class APIRotatorService {
  private keys: ManagedKey[];
  private policy: Required<RotatorPolicy>;
  private activeIndex: number;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private rotationLog: RotationEntry[] = [];

  public get keyCount(): number {
    return this.keys.length;
  }

  constructor(
    keys: KeyConfig[],
    policy?: Partial<RotatorPolicy>,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {
    if (keys.length === 0) {
      console.warn('APIRotatorService: no keys provided, running in degraded mode without LLM');
      this.keys = [];
      this.activeIndex = -1;
      this.policy = { ...DEFAULT_POLICY, ...policy };
      return;
    }
    if (keys.length > 8) throw new Error('APIRotatorService: at most 8 keys are supported');
    this.policy = { ...DEFAULT_POLICY, ...policy };
    this.keys = keys.map((k) => ({
      ...k,
      state: 'IDLE' as KeyState,
      cooldownUntilMs: 0,
      stats: { calls: 0, failures: 0, lastUsedMs: 0 },
    }));
    this.activeIndex = this.nextAvailableIndex(-1);
    if (this.activeIndex >= 0) this.keys[this.activeIndex].state = 'ACTIVE';
    this.startHealthChecks();
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  /** Returns the key that will serve the next request. */
  activeKey(): ManagedKey | null {
    return this.activeIndex >= 0 ? this.keys[this.activeIndex] : null;
  }

  /** Snapshot of all keys + policy (for dashboards / tests). */
  status(): { keys: ManagedKey[]; activeIndex: number; rotations: RotationEntry[] } {
    return { keys: this.keys.map((k) => ({ ...k })), activeIndex: this.activeIndex, rotations: [...this.rotationLog] };
  }

  /**
   * Complete a chat request with automatic failover.
   * Keeps trying the next non-cooldown key until success or all keys exhausted.
   */
  async complete(request: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    maxTokens?: number;
  }): Promise<RotatorResult> {
    let failovers = 0;
    let currentIdx = this.activeIndex;
    if (currentIdx < 0) currentIdx = 0;

    for (let attempt = 0; attempt < this.policy.maxRetries; attempt++) {
      const key = this.keys[currentIdx];
      if (key.state === 'COOLDOWN') {
        currentIdx = (currentIdx + 1) % this.keys.length;
        continue;
      }

      try {
        const completion = await this.callProvider(key, request);
        key.stats.calls += 1;
        key.stats.lastUsedMs = this.now();
        this.activateKey(currentIdx);
        return { ok: true, keyId: key.id, provider: key.provider, completion, failovers, degraded: false };
      } catch (err) {
        const failure = normalizeFailure(err);
        key.stats.failures += 1;
        this.sendToCooldown(key, failure.reason);

        const next = this.nextAvailableIndex(currentIdx);
        if (next >= 0) {
          if (this.activeIndex === currentIdx) {
            failovers += 1;
            this.rotationLog.push({
              at: new Date(this.now()).toISOString(),
              from: key.id,
              to: this.keys[next].id,
              reason: failure.reason,
            });
            this.activateKey(next);
          }
          currentIdx = next;
        }

        if (attempt === this.policy.maxRetries - 1 || next < 0) {
          return {
            ok: false,
            keyId: key.id,
            provider: key.provider,
            status: failure.status,
            error: failure.reason,
            failovers,
            degraded: true,
          };
        }
        await this.sleep(150); // tiny backoff between rapid failovers
      }
    }

    return {
      ok: false,
      keyId: '',
      provider: 'none',
      error: 'all providers exhausted',
      failovers,
      degraded: true,
    };
  }

  /** Force the rotator to cycle to the next healthy key (manual override). */
  rotate(force = false): ManagedKey | null {
    if (!force && this.keys.length <= 1) return null;
    const next = this.nextAvailableIndex(this.activeIndex);
    if (next >= 0) this.activateKey(next);
    return this.activeKey();
  }

  /** Stop background health checks (call in shutdown). */
  dispose(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = null;
  }

  /* ------------------------------------------------------------------ */
  /* Internal                                                            */
  /* ------------------------------------------------------------------ */

  private startHealthChecks(): void {
    this.healthTimer = setInterval(() => this.healthCheck(), this.policy.healthCheckIntervalSec * 1000);
    this.healthTimer.unref?.();
  }

  /** Probe every COOLDOWN key; reinstate if its cooldown window has passed. */
  private healthCheck(): void {
    const t = this.now();
    let changed = false;
    for (const key of this.keys) {
      if (key.state === 'COOLDOWN' && t >= key.cooldownUntilMs) {
        key.state = 'IDLE';
        changed = true;
      }
    }
    // If the active slot is empty, promote the first healthy key.
    if ((this.activeIndex < 0 || this.keys[this.activeIndex].state !== 'ACTIVE') && changed) {
      const next = this.nextAvailableIndex(-1);
      if (next >= 0) this.activateKey(next);
    }
  }

  private activateKey(idx: number): void {
    for (const k of this.keys) if (k.state === 'ACTIVE') k.state = 'IDLE';
    this.keys[idx].state = 'ACTIVE';
    this.activeIndex = idx;
  }

  private sendToCooldown(key: ManagedKey, reason: string): void {
    const base = this.policy.cooldownBaseSec * 1000;
    const penalty = Math.min(key.stats.failures, 8) * 5000; // escalating cooldown
    key.cooldownUntilMs = this.now() + base + penalty;
    key.state = 'COOLDOWN';
    this.rotationLog.push({
      at: new Date(this.now()).toISOString(),
      from: key.id,
      to: '',
      reason: `cooldown: ${reason}`,
    });
  }

  private nextAvailableIndex(from: number): number {
    const t = this.now();
    for (let i = 1; i <= this.keys.length; i++) {
      const idx = (from + i) % this.keys.length;
      if (this.keys[idx].state !== 'COOLDOWN' && t >= this.keys[idx].cooldownUntilMs) return idx;
    }
    return -1;
  }

  private async callProvider(
    key: ManagedKey,
    request: { messages: Array<{ role: string; content: string }>; model?: string; maxTokens?: number },
  ): Promise<ChatCompletion> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.policy.timeoutMs);
    try {
      const res = await fetch(key.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key.apiKey}`,
        },
        body: JSON.stringify({
          model: request.model ?? key.models[0],
          messages: request.messages,
          max_tokens: request.maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (res.status === 429) {
        throw new Failure('rate limit', 429);
      }
      if (res.status >= 500) {
        throw new Failure(`server error ${res.status}`, res.status);
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Failure(`HTTP ${res.status}: ${body.slice(0, 200)}`, res.status);
      }

      const data = (await res.json()) as ChatCompletion;
      if (!data?.choices?.length) throw new Failure('empty completion payload');
      return data;
    } catch (err) {
      if (controller.signal.aborted) throw new Failure('timeout', 0);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Failure normalization                                               */
/* ------------------------------------------------------------------ */

export class Failure extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'Failure';
  }
}

function normalizeFailure(err: unknown): { reason: string; status?: number } {
  if (err instanceof Failure) return { reason: err.message, status: err.status };
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    if (m.includes('timeout') || m.includes('abort') || m.includes('fetch failed') || m.includes('network')) {
      return { reason: 'timeout/network' };
    }
    if (TOKEN_ERRORS.some((t) => m.includes(t))) return { reason: 'token limit' };
    return { reason: err.message };
  }
  return { reason: String(err) };
}
