/**
 * Failover test suite — Phase 4 gate.
 * Verifies APIRotatorService switches between 8 mock keys on simulated
 * rate-limit (429) errors without dropping conversation state, and that
 * health checks reinstate keys after their cooldown window.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APIRotatorService, type ManagedKey } from '../src/services/api_rotator.js';
import type { KeyConfig } from '../src/services/types.js';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function mockKeys(n = 8): KeyConfig[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `key-${i + 1}`,
    provider: `provider-${i + 1}`,
    endpoint: `https://mock${i + 1}.example/v1/chat/completions`,
    apiKey: `sk-mock-${i + 1}`,
    models: [`model-${i + 1}`],
  }));
}

/** A stub HTTP layer: each callable returns the next response in its queue. */
function stubFetch(plan: Array<{ status: number; body?: unknown; error?: string }>) {
  let calls = 0;
  return {
    fetch: async () => {
      const step = plan[Math.min(calls, plan.length - 1)];
      calls += 1;
      if (step.error) throw new Error(step.error);
      if (step.status !== 200) {
        return { status: step.status, ok: false, text: async () => '{"error":{"message":"rate limited"}}' } as Response;
      }
      return {
        status: 200,
        ok: true,
        json: async () => step.body ?? { choices: [{ message: { role: 'assistant', content: 'ok' } }] },
      } as unknown as Response;
    },
    calls: () => calls,
  };
}

/** Run a scenario with a controllable clock. */
function makeClock() {
  let t = 1_000_000;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

test('fails over instantly when the active key returns 429', async () => {
  const keys = mockKeys(8);
  // key-1 always 429s; key-2 succeeds on first call.
  const plan = new Map<number, { status: number }>();
  plan.set(1, { status: 429 });

  // Patch global fetch per endpoint by inspecting the URL.
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any) => {
    const n = Number(new URL(String(url)).hostname.match(/mock(\d+)/)![1]);
    return n === 1
      ? { status: 429, ok: false, text: async () => 'rate limited' }
      : { status: 200, ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'served' } }] }) };
  }) as any;

  try {
    const rotator = new APIRotatorService(keys, { healthCheckIntervalSec: 60 });
    const res = await rotator.complete({ messages: [{ role: 'user', content: 'hello' }] });

    assert.equal(res.ok, true);
    assert.equal(res.keyId, 'key-2');
    assert.equal(res.failovers, 1);
    assert.equal(res.degraded, false);
    assert.equal(res.completion?.choices[0].message?.content, 'served');

    const status = rotator.status();
    assert.equal(status.keys[0].state, 'COOLDOWN');
    assert.equal(status.keys[1].state, 'ACTIVE');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('conversation state is never dropped across failovers', async () => {
  const keys = mockKeys(8);
  const transcript: string[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    const body = JSON.parse(init.body);
    body.messages.forEach((msg: any) => transcript.push(msg.content)); // capture what was sent
    const n = Number(new URL(String(url)).hostname.match(/mock(\d+)/)![1]);
    return n <= 3
      ? { status: 429, ok: false, text: async () => 'quota' }
      : { status: 200, ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', content: `reply via ${n}` } }] }) };
  }) as any;

  try {
    const rotator = new APIRotatorService(keys);
    const session = [{ role: 'user' as const, content: 'my name is Bond' }];
    const r1 = await rotator.complete({ messages: [...session] });
    assert.equal(r1.keyId, 'key-4'); // 1,2,3 failed over to 4

    const r2 = await rotator.complete({ messages: [...session, { role: 'assistant' as const, content: r1.completion!.choices[0].message!.content }, { role: 'user' as const, content: 'what is my name?' }] });
    assert.equal(r2.ok, true);

    // The second call must have carried the FULL transcript (assistant reply included).
    assert.ok(transcript.some((m) => m === 'reply via 4'));
    assert.ok(transcript.some((m) => m === 'what is my name?'));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('rotates through ALL keys before degrading', async () => {
  const keys = mockKeys(8);
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ status: 429, ok: false, text: async () => 'rate limited' })) as any;
  try {
    const rotator = new APIRotatorService(keys, { cooldownBaseSec: 3600 }); // long cooldown => full exhaust
    const res = await rotator.complete({ messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(res.ok, false);
    assert.equal(res.degraded, true);
    assert.equal(rotator.status().keys.every((k: ManagedKey) => k.state === 'COOLDOWN'), true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('health check reinstates keys after the cooldown window resets', async () => {
  const clock = makeClock();
  const keys = mockKeys(8);
  const rotator = new APIRotatorService(
    keys,
    { cooldownBaseSec: 30, healthCheckIntervalSec: 60 },
    clock.now,
  );
  rotator.dispose(); // stop the real interval; we drive healthCheck manually below

  // Force all keys into cooldown.
  for (const k of (rotator as any).keys) {
    k.state = 'COOLDOWN';
    k.cooldownUntilMs = clock.now() + 30_000;
  }
  (rotator as any).activeIndex = -1;
  assert.equal(rotator.activeKey(), null);

  // Advance clock past the window, then trigger a health check pass.
  clock.advance(31_000);
  (rotator as any).healthCheck();

  const status = rotator.status();
  assert.equal(status.keys[0].state, 'ACTIVE'); // promoted back
  assert.notEqual(rotator.activeKey(), null);
});

test('manual rotate() forces a switch without any HTTP call', async () => {
  const keys = mockKeys(8);
  const rotator = new APIRotatorService(keys);
  rotator.dispose();
  const before = rotator.activeKey()!.id;
  const after = rotator.rotate(true)!.id;
  assert.notEqual(before, after);
  assert.equal(rotator.status().keys.find((k: ManagedKey) => k.id === after)!.state, 'ACTIVE');
});

test('rejects more than 8 keys', () => {
  assert.throws(() => new APIRotatorService(mockKeys(9)), /at most 8/);
});

test('timeout failure is treated as failover trigger', async () => {
  const keys = mockKeys(8);
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('fetch failed: network unreachable'); }) as any;
  try {
    const rotator = new APIRotatorService(keys, { timeoutMs: 500 });
    const res = await rotator.complete({ messages: [{ role: 'user', content: 'hi' }] });
    // key-1 fails with network error -> failover to key-2, which also fails -> degraded.
    assert.equal(res.ok, false);
    assert.ok(res.failovers >= 1);
    assert.equal(res.degraded, true);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('plan fixture sanity: stubFetch counts calls', async () => {
  const stub = stubFetch([{ status: 200 }]);
  const res = await stub.fetch();
  assert.equal(res.status, 200);
  assert.equal(stub.calls(), 1);
});
