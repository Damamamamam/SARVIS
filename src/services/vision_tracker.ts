/**
 * OwnerTalkDetector — front-camera talk-state classifier (Module D).
 *
 * Design invariants:
 *  - Output is one of TalkState: TALKING_TO_SARVIS | ROOM_CONVERSATION | NO_FACE.
 *  - Pipeline: face → gaze(yaw) → lip(MAR) movement → classification.
 *  - MAR = vertical_dist(13,14) / horizontal_dist(61,291); stddev over a
 *    sliding window of frames gates "mouth moving".
 *
 * Landmark inference (MediaPipe FaceMesh) runs on-device in the Windows client
 * layer; this controller accepts normalized landmarks so it is unit-testable
 * via MockFaceMesh fixtures without any native dependency.
 */
import { EventEmitter } from 'node:events';

export type TalkState = 'TALKING_TO_SARVIS' | 'ROOM_CONVERSATION' | 'NO_FACE';

export interface FaceLandmarks {
  /** inner-lip upper point (FaceMesh 13) */
  upperLip: { x: number; y: number };
  /** inner-lip lower point (FaceMesh 14) */
  lowerLip: { x: number; y: number };
  /** mouth left corner (FaceMesh 61) */
  mouthLeft: { x: number; y: number };
  /** mouth right corner (FaceMesh 291) */
  mouthRight: { x: number; y: number };
  /** nose tip (FaceMesh 1) — used for gaze/yaw proxy */
  noseTip: { x: number; y: number };
  /** estimated yaw angle (deg) from camera axis */
  yawDeg: number;
}

export interface DetectorConfig {
  /** MAR threshold for "open". Default 0.3 */
  mouthOpenRatio?: number;
  /** Max yaw (deg) from camera axis to count as facing lens. Default 30 */
  gazeAngleTolerance?: number;
  /** Min stddev of MAR deltas to count as "talking". Default 0.05 */
  movementDeltaThreshold?: number;
  /** Frames in sliding window. Default 10 */
  frameSlidingWindow?: number;
  now?: () => number;
}

export interface FrameResult {
  mar: number;
  mouthMoving: boolean;
  facing: boolean;
  state: TalkState;
  ts: number;
}

export type DetectorEvent = 'state' | 'frame';

export class OwnerTalkDetector {
  private readonly mouthOpenRatio: number;
  private readonly gazeAngleTolerance: number;
  private readonly movementDeltaThreshold: number;
  private readonly window: number;
  private readonly now: () => number;
  private readonly emitter = new EventEmitter();

  private marHistory: number[] = [];
  private lastState: TalkState = 'NO_FACE';

  constructor(config: DetectorConfig = {}) {
    this.mouthOpenRatio = config.mouthOpenRatio ?? 0.3;
    this.gazeAngleTolerance = config.gazeAngleTolerance ?? 30;
    this.movementDeltaThreshold = config.movementDeltaThreshold ?? 0.05;
    this.window = config.frameSlidingWindow ?? 10;
    this.now = config.now ?? Date.now;
    this.emitter.setMaxListeners(50);
  }

  on(event: DetectorEvent, handler: (...args: any[]) => void): void {
    this.emitter.on(event, handler);
  }

  off(event: DetectorEvent, handler: (...args: any[]) => void): void {
    this.emitter.off(event, handler);
  }

  getState(): TalkState {
    return this.lastState;
  }

  /** Feed one frame's landmarks; returns the classified state. */
  processFrame(landmarks: FaceLandmarks | null): TalkState {
    let result: FrameResult;
    if (!landmarks) {
      result = { mar: 0, mouthMoving: false, facing: false, state: 'NO_FACE', ts: this.now() };
    } else {
      const mar = this.mouthAspectRatio(landmarks);
      this.marHistory.push(mar);
      if (this.marHistory.length > this.window) this.marHistory.shift();
      const moving = this.isMoving();
      const facing = Math.abs(landmarks.yawDeg) <= this.gazeAngleTolerance;
      result = { mar, mouthMoving: moving, facing, state: this.classify(mar, moving, facing), ts: this.now() };
    }
    this.lastState = result.state;
    this.emitter.emit('frame', result);
    this.emitter.emit('state', result.state);
    return result.state;
  }

  private classify(mar: number, moving: boolean, facing: boolean): TalkState {
    if (mar === 0 && !moving) return 'NO_FACE';
    if (!facing) return 'ROOM_CONVERSATION';
    if (moving) return 'TALKING_TO_SARVIS';
    if (mar >= this.mouthOpenRatio) return 'TALKING_TO_SARVIS';
    return 'ROOM_CONVERSATION';
  }

  private mouthAspectRatio(l: FaceLandmarks): number {
    const vertical = Math.hypot(l.upperLip.x - l.lowerLip.x, l.upperLip.y - l.lowerLip.y);
    const horizontal = Math.hypot(l.mouthLeft.x - l.mouthRight.x, l.mouthLeft.y - l.mouthRight.y);
    if (horizontal === 0) return 0;
    return vertical / horizontal;
  }

  private isMoving(): boolean {
    if (this.marHistory.length < 2) return false;
    const mean = this.marHistory.reduce((a, b) => a + b, 0) / this.marHistory.length;
    const variance = this.marHistory.reduce((a, b) => a + (b - mean) ** 2, 0) / this.marHistory.length;
    return Math.sqrt(variance) > this.movementDeltaThreshold;
  }

  reset(): void {
    this.marHistory = [];
    this.lastState = 'NO_FACE';
  }

  dispose(): void {
    this.emitter.removeAllListeners();
  }
}

/** Deterministic landmark generator for tests / offline simulation. */
export class MockFaceMesh {
  constructor(private opts: { yawDeg: number; mar: number; moving?: boolean } = { yawDeg: 0, mar: 0.3 }) {}

  frame(overrides: Partial<{ yawDeg: number; mar: number; moving: boolean }> = {}): FaceLandmarks {
    const yaw = overrides.yawDeg ?? this.opts.yawDeg;
    const mar = overrides.mar ?? this.opts.mar;
    const moving = overrides.moving ?? this.opts.moving ?? false;
    // When "moving", produce a clear MAR swing so the stddev gate (>threshold) is crossed.
    const jitter = moving ? (Math.random() < 0.5 ? 0.15 : -0.15) : 0;
    const m = Math.max(0.01, mar + jitter);
    const horiz = 0.2;
    const vert = m * horiz;
    return {
      upperLip: { x: 0.5, y: 0.5 - vert / 2 },
      lowerLip: { x: 0.5, y: 0.5 + vert / 2 },
      mouthLeft: { x: 0.5 - horiz / 2, y: 0.5 },
      mouthRight: { x: 0.5 + horiz / 2, y: 0.5 },
      noseTip: { x: 0.5, y: 0.45 },
      yawDeg: yaw,
    };
  }
}
