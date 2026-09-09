/**
 * WinScreenGuard — Windows active process & screen time watchdog.
 *
 * Monitors active window process names on Windows, tracking daily usage time
 * for flagged apps (social media / distracting desktop apps) and emitting
 * nudge events when thresholds are exceeded.
 */
import { DoomscrollGuard, type NudgeEvent } from './screen_guard.js';
import { WinControlService } from './win_control.js';

export interface WinGuardConfig {
  thresholdMs?: number; // default 2h
  checkIntervalMs?: number; // default 5s polling
  flaggedApps?: string[];
}

const DEFAULT_WINDOWS_FLAGGED = [
  'chrome',
  'msedge',
  'firefox',
  'opera',
  'brave',
  'discord',
  'steam',
  'spotify',
  'telegram',
  'whatsapp',
  'tiktok',
  'instagram',
  'twitter',
];

export class WinScreenGuard {
  private readonly guard: DoomscrollGuard;
  private readonly winControl: WinControlService;
  private readonly checkIntervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastProcName: string = '';

  constructor(config: WinGuardConfig = {}) {
    this.checkIntervalMs = config.checkIntervalMs ?? 5000;
    this.winControl = new WinControlService();
    this.guard = new DoomscrollGuard({
      thresholdMs: config.thresholdMs ?? 2 * 3600 * 1000,
      flaggedApps: config.flaggedApps ?? DEFAULT_WINDOWS_FLAGGED,
    });
  }

  onNudge(listener: (e: NudgeEvent) => void): void {
    this.guard.onNudge(listener);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.checkIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    const active = await this.winControl.getActiveWindow();
    if (!active || !active.name) return;
    const name = active.name.toLowerCase();
    this.guard.observe(name, active.title || active.name, this.checkIntervalMs);
    this.lastProcName = name;
  }

  snapshot() {
    return this.guard.snapshot();
  }

  snooze(): void {
    this.guard.snooze();
  }
}
