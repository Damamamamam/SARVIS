/**
 * DoomscrollGuard — social-media screen-time watchdog (screen-guard module).
 *
 * On Windows the real tracking uses process monitoring to learn the foreground app.
 * This is the brain-side controller: it consumes foreground-app events and accumulated
 * usage, maintains per-app daily totals, and emits a nudge (voice/toast trigger)
 * when a flagged "doomscroll" app crosses the daily threshold.
 */
import type { ScreenTimeEntry } from './types.js';

export type GuardState = 'IDLE' | 'MONITORING' | 'NUDGE_SENT' | 'SNOOZED';

export interface GuardConfig {
  /** Daily screen-time threshold (ms) before nudging. Default 2h. */
  thresholdMs?: number;
  /** Package names treated as "unnecessary" / doomscroll targets. */
  flaggedApps?: string[];
  now?: () => number;
}

export interface NudgeEvent {
  type: 'screen_time_nudge';
  at: string;
  app: string;
  minutes: number;
  suggestion: string;
}

export type GuardListener = (e: NudgeEvent) => void;

const DEFAULT_FLAGGED = [
  'chrome.exe',
  'msedge.exe',
  'firefox.exe',
  'opera.exe',
  'spotify.exe',
  'discord.exe',
  'slack.exe',
  'teams.exe',
  'zoom.exe',
  'youtube.exe',
];

export class DoomscrollGuard {
  private state: GuardState = 'IDLE';
  private readonly thresholdMs: number;
  private readonly flagged: Set<string>;
  private readonly now: () => number;
  private readonly usage = new Map<string, ScreenTimeEntry>();
  private readonly listeners: GuardListener[] = [];

  constructor(config: GuardConfig = {}) {
    this.thresholdMs = config.thresholdMs ?? 2 * 3_600_000;
    this.flagged = new Set(config.flaggedApps ?? DEFAULT_FLAGGED);
    this.now = config.now ?? Date.now;
  }

  getState(): GuardState {
    return this.state;
  }

  onNudge(listener: GuardListener): void {
    this.listeners.push(listener);
  }

  /** True if the package is in the doomscroll watchlist. */
  isFlagged(pkg: string): boolean {
    return this.flagged.has(pkg);
  }

  /**
   * Feed a foreground-app observation. `durationMs` is how long it stayed
   * foreground since the previous observation. Emits a nudge (once) when a
   * flagged app first crosses the daily threshold.
   */
  observe(pkg: string, label: string, durationMs: number): NudgeEvent | null {
    if (this.state === 'IDLE') this.state = 'MONITORING';
    if (this.state === 'SNOOZED') return null;

    const prev = this.usage.get(pkg) ?? {
      app: pkg,
      label,
      flaggedUnnecessary: this.flagged.has(pkg),
      sessionMs: 0,
      dailyTotalMs: 0,
      nudgeSent: false,
    };
    const updated: ScreenTimeEntry = {
      ...prev,
      label,
      flaggedUnnecessary: this.flagged.has(pkg),
      sessionMs: prev.sessionMs + durationMs,
      dailyTotalMs: prev.dailyTotalMs + durationMs,
    };
    this.usage.set(pkg, updated);

    if (updated.flaggedUnnecessary && !updated.nudgeSent && updated.dailyTotalMs >= this.thresholdMs) {
      updated.nudgeSent = true;
      this.usage.set(pkg, updated);
      this.state = 'NUDGE_SENT';
      const ev: NudgeEvent = {
        type: 'screen_time_nudge',
        at: new Date(this.now()).toISOString(),
        app: updated.label,
        minutes: Math.round(updated.dailyTotalMs / 60_000),
        suggestion: `You've spent ${Math.round(updated.dailyTotalMs / 60_000)} minutes on ${updated.label} today. Perhaps a short break?`,
      };
      for (const l of this.listeners) l(ev);
      return ev;
    }
    return null;
  }

  /** Current per-app usage snapshot. */
  snapshot(): ScreenTimeEntry[] {
    return [...this.usage.values()];
  }

  /** Snooze further nudges for the rest of the session. */
  snooze(): void {
    this.state = 'SNOOZED';
  }

  /** Reset all daily counters (call at local midnight or Space switch). */
  resetDaily(): void {
    this.usage.clear();
    this.state = 'MONITORING';
  }
}
