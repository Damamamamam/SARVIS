/**
 * JarvisBrain — top-level composition root wiring every subsystem together.
 *
 * This is the file the original spec names `src/agent/brain.ts`. It instantiates
 * the API rotator, device control, audio recorder, vision detector, screen
 * guard, free-tool registry, and the AgentBrain orchestrator, then connects
 * their event streams into a single control surface.
 *
 *   vision (camera) ─┐
 *   audio  (mic)    ─┼─► JarvisBrain ─► AgentBrain ─► APIRotatorService
 *   screen (guard)  ─┘                  │            (8-key failover)
 *                                      └─► DeviceControlService (Android bridge)
 */
import { AgentBrain, type BrainConfig, type BrainResult } from '../services/agent_brain.js';
import { APIRotatorService } from '../services/api_rotator.js';
import { DeviceControlService, type Transport } from '../services/device_control.js';
import { AmbientAudioRecorder } from '../services/audio_recorder.js';
import { OwnerTalkDetector, type FaceLandmarks } from '../services/vision_tracker.js';
import { DoomscrollGuard, type NudgeEvent } from '../services/screen_guard.js';
import { freeTools } from '../tools/free_tools.js';
import type { KeyConfig } from '../services/types.js';

export interface JarvisBrainDeps {
  keys: KeyConfig[];
  /** WebSocket/bridge transport for device commands. Optional in Node. */
  transport?: Transport;
  /** Extra AgentBrain configuration. */
  brainConfig?: Partial<BrainConfig>;
  /** Daily doomscroll threshold in ms (default 2h). */
  screenThresholdMs?: number;
}

export class JarvisBrain {
  readonly brain: AgentBrain;
  readonly rotator: APIRotatorService;
  readonly audio: AmbientAudioRecorder;
  readonly vision: OwnerTalkDetector;
  readonly guard: DoomscrollGuard;
  private device: DeviceControlService | null = null;

  constructor(deps: JarvisBrainDeps) {
    this.rotator = new APIRotatorService(deps.keys);
    this.brain = new AgentBrain({ keys: deps.keys, ...deps.brainConfig });
    this.audio = new AmbientAudioRecorder();
    this.vision = new OwnerTalkDetector();
    this.guard = new DoomscrollGuard({ thresholdMs: deps.screenThresholdMs });

    if (deps.transport) {
      this.device = new DeviceControlService(deps.transport);
    }
  }

  /** Subscribe to screen-time nudge events. */
  onNudge(listener: (e: NudgeEvent) => void): void {
    this.guard.onNudge(listener);
  }

  /** Process a transcribed utterance end-to-end through the brain. */
  async hear(utterance: string): Promise<BrainResult> {
    if (this.rotator.keyCount === 0) {
      return {
        reply: "I'm currently running in degraded mode without API keys. Please configure at least one LLM API key to enable full intelligence.",
        degraded: true
      };
    }
    return this.brain.process(utterance);
  }

  /** Feed a camera frame; updates talk-state in the brain and returns it. */
  see(landmarks: FaceLandmarks | null) {
    const state = this.vision.processFrame(landmarks);
    this.brain.onTalkState(state);
    return state;
  }

  /** Feed an ambient audio chunk for context capture. */
  listen(chunk: Float32Array): void {
    this.audio.pushChunk(chunk);
  }

  /** Report a foreground-app observation to the screen guard. */
  screen(pkg: string, label: string, durationMs: number): NudgeEvent | null {
    return this.guard.observe(pkg, label, durationMs);
  }

  /** Run a registered free web tool by name. */
  async tool(name: string, ...args: unknown[]) {
    const fn = (freeTools as Record<string, (...a: unknown[]) => Promise<unknown>>)[name];
    if (!fn) throw new Error(`unknown tool: ${name}`);
    return fn(...args);
  }

  /** Arm + start the ambient recorder (kill-switch stays available). */
  beginListening(): void {
    this.audio.arm();
    this.audio.start();
  }

  /** Graceful shutdown of all subsystems. */
  dispose(): void {
    this.audio.dispose();
    this.vision.dispose();
    this.device?.dispose();
    this.rotator.dispose();
  }
}
