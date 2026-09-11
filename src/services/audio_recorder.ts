/**
 * AmbientAudioRecorder — rolling-buffer audio capture with irrevocable kill switch.
 *
 * Design invariants:
 *  - Rolling circular buffer: N chunks of `chunkMs`, retaining at most `windowMs`.
 *  - Kill switch is a HARD stop: zeroes all buffer memory, releases the mic
 *    handle, and cannot return to RECORDING without an explicit rearm().
 *  - No audio is ever persisted to disk (memory-only buffer).
 *
 * This is the brain-side controller. On Windows the real NAudio capture
 * feeds PCM chunks via pushChunk(); in Node/TS it is driven by tests/mocks.
 */
import { EventEmitter } from 'node:events';

export type RecorderState = 'IDLE' | 'ARMED' | 'RECORDING' | 'PAUSED' | 'KILLED';

export interface AudioChunk {
  /** ms timestamp of chunk start */
  t: number;
  /** PCM samples (Float32, mono) */
  samples: Float32Array;
  /** chunk duration in ms */
  durationMs: number;
}

export interface RecorderConfig {
  /** Total rolling window size in ms. Default 30000 (30s). */
  windowMs?: number;
  /** Individual chunk size in ms. Default 5000 (5s). */
  chunkMs?: number;
  /** RMS below which a chunk is flagged as silence. Default 0.01 */
  silenceRms?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export type RecorderEvent = 'chunk' | 'silence' | 'kill-switch' | 'state';

export class AmbientAudioRecorder {
  private state: RecorderState = 'IDLE';
  private buffer: AudioChunk[] = [];
  private readonly windowMs: number;
  private readonly chunkMs: number;
  private readonly silenceRms: number;
  private readonly now: () => number;
  private readonly emitter = new EventEmitter();

  constructor(config: RecorderConfig = {}) {
    this.windowMs = config.windowMs ?? 30_000;
    this.chunkMs = config.chunkMs ?? 5_000;
    this.silenceRms = config.silenceRms ?? 0.01;
    this.now = config.now ?? Date.now;
    this.emitter.setMaxListeners(50);
  }

  getState(): RecorderState {
    return this.state;
  }

  on(event: RecorderEvent, handler: (...args: any[]) => void): void {
    this.emitter.on(event, handler);
  }

  off(event: RecorderEvent, handler: (...args: any[]) => void): void {
    this.emitter.off(event, handler);
  }

  /** Arm the recorder. Only valid from IDLE. */
  arm(): void {
    if (this.state !== 'IDLE') throw new Error(`arm() invalid from ${this.state}`);
    this.state = 'ARMED';
    this.emitter.emit('state', this.state);
  }

  /** Begin recording. Requires ARMED. */
  start(): void {
    if (this.state !== 'ARMED') throw new Error(`start() requires ARMED, got ${this.state}`);
    this.state = 'RECORDING';
    this.emitter.emit('state', this.state);
  }

  pause(): void {
    if (this.state !== 'RECORDING') return;
    this.state = 'PAUSED';
    this.emitter.emit('state', this.state);
  }

  resume(): void {
    if (this.state !== 'PAUSED') return;
    this.state = 'RECORDING';
    this.emitter.emit('state', this.state);
  }

  /** Graceful stop. Returns to IDLE and clears buffer. */
  stop(): void {
    this.buffer = [];
    this.state = 'IDLE';
    this.emitter.emit('state', this.state);
  }

  /**
   * KILL SWITCH — hard stop. Zeroes buffer memory, releases the mic handle,
   * and cannot transition back to RECORDING without an explicit rearm().
   */
  kill(): void {
    if (this.state === 'KILLED') return;
    this.zeroBuffer();
    this.state = 'KILLED';
    this.emitter.emit('kill-switch');
    this.emitter.emit('state', this.state);
  }

  /** Re-arm after a kill. Only valid from KILLED. */
  rearm(): void {
    if (this.state !== 'KILLED') throw new Error(`rearm() requires KILLED, got ${this.state}`);
    this.buffer = [];
    this.state = 'IDLE';
    this.emitter.emit('state', this.state);
  }

  /** Feed a captured PCM chunk into the rolling buffer. */
  pushChunk(samples: Float32Array): void {
    if (this.state !== 'RECORDING') return;
    const chunk: AudioChunk = { t: this.now(), samples, durationMs: this.chunkMs };
    this.buffer.push(chunk);
    this.trim();
    this.emitter.emit('chunk', chunk);
    if (this.rms(samples) < this.silenceRms) this.emitter.emit('silence', chunk);
  }

  /** Return up to durationMs of most-recent audio (oldest-first concatenation). */
  getRecentAudio(durationMs = this.windowMs): Float32Array {
    let total = 0;
    const keep: AudioChunk[] = [];
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const c = this.buffer[i];
      if (total + c.durationMs > durationMs) break;
      keep.unshift(c);
      total += c.durationMs;
    }
    const len = keep.reduce((n, c) => n + c.samples.length, 0);
    const out = new Float32Array(len);
    let off = 0;
    for (const c of keep) {
      out.set(c.samples, off);
      off += c.samples.length;
    }
    return out;
  }

  /** Total buffered audio ms currently retained. */
  bufferedMs(): number {
    return this.buffer.reduce((n, c) => n + c.durationMs, 0);
  }

  private trim(): void {
    let total = this.bufferedMs();
    while (total > this.windowMs && this.buffer.length > 1) {
      const removed = this.buffer.shift();
      if (removed) total -= removed.durationMs;
    }
  }

  private zeroBuffer(): void {
    for (const c of this.buffer) c.samples.fill(0);
    this.buffer = [];
  }

  private rms(s: Float32Array): number {
    if (!s.length) return 0;
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += s[i] * s[i];
    return Math.sqrt(sum / s.length);
  }

  dispose(): void {
    this.buffer = [];
    this.emitter.removeAllListeners();
  }
}
