/**
 * DeviceControlService — typed command-dispatch layer (Module B).
 *
 * Sends structured commands over a local WebSocket to the Android
 * Accessibility Service bridge. Commands execute serially; each must
 * be acknowledged (or timeout) before the next is dispatched.
 *
 * Architecture ref: docs/architecture.md §4.2
 */

/* ------------------------------------------------------------------ */
/* Command taxonomy                                                    */
/* ------------------------------------------------------------------ */

export type AppCommand =
  | { action: 'launchApp'; pkg: string }
  | { action: 'closeApp'; pkg: string }
  | { action: 'switchApp'; pkg: string };

export type ScreenCommand =
  | { action: 'tap'; x: number; y: number }
  | { action: 'tapSelector'; selector: string }
  | { action: 'scroll'; direction: 'up' | 'down' | 'left' | 'right'; amount?: number }
  | { action: 'swipe'; fromX: number; fromY: number; toX: number; toY: number; durationMs?: number }
  | { action: 'inputText'; text: string; selector?: string };

export type SystemToggle = 'wifi' | 'bluetooth' | 'flashlight' | 'volume_up' | 'volume_down' | 'volume_mute' | 'brightness_up' | 'brightness_down' | 'dnd' | 'airplane' | 'rotation';

export type SystemCommand =
  | { action: 'toggle'; target: SystemToggle }
  | { action: 'pullNotifications' }
  | { action: 'dismissNotifications' }
  | { action: 'setBrightness'; level: number /* 0-255 */ }
  | { action: 'setVolume'; stream: 'media' | 'ring' | 'alarm'; level: number /* 0-100 */ };

export type CommsCommand =
  | { action: 'dial'; number: string }
  | { action: 'answerCall' }
  | { action: 'rejectCall' }
  | { action: 'endCall' }
  | { action: 'readSms'; count?: number }
  | { action: 'sendSms'; to: string; body: string };

export type DeviceCommand =
  | (AppCommand & { category: 'app' })
  | (ScreenCommand & { category: 'screen' })
  | (SystemCommand & { category: 'system' })
  | (CommsCommand & { category: 'comms' });

/* ------------------------------------------------------------------ */
/* Envelope for WebSocket transport                                    */
/* ------------------------------------------------------------------ */

export interface CommandEnvelope {
  id: string;
  type: 'command';
  module: 'device';
  payload: DeviceCommand;
  ts: number;
}

export interface AckEnvelope {
  id: string;
  type: 'ack' | 'error';
  module: 'device';
  payload: { success: boolean; data?: unknown; code?: string; message?: string };
  ts: number;
}

/* ------------------------------------------------------------------ */
/* Queue entry                                                         */
/* ------------------------------------------------------------------ */

export type CommandStatus = 'QUEUED' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'DEAD';

export interface QueueEntry {
  id: string;
  command: DeviceCommand;
  status: CommandStatus;
  retries: number;
  queuedAt: number;
  startedAt?: number;
  completedAt?: number;
  result?: AckEnvelope['payload'];
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export interface DeviceControlConfig {
  /** WebSocket URL for the Android bridge. Default: ws://127.0.0.1:9741 */
  bridgeUrl?: string;
  /** Command execution timeout in ms. Default: 10_000 */
  commandTimeoutMs?: number;
  /** Max retries per command before marking DEAD. Default: 2 */
  maxRetries?: number;
  /** Custom ID generator (injectable for tests). */
  idGen?: () => string;
  /** Clock (injectable for tests). */
  now?: () => number;
}

const DEFAULT_CONFIG = {
  bridgeUrl: 'ws://127.0.0.1:9741',
  commandTimeoutMs: 10_000,
  maxRetries: 2,
};

/* ------------------------------------------------------------------ */
/* Transport interface (abstracted for testability)                     */
/* ------------------------------------------------------------------ */

export interface Transport {
  send(envelope: CommandEnvelope): void;
  onMessage(handler: (msg: AckEnvelope) => void): void;
  close(): void;
  readonly connected: boolean;
}

/**
 * In-memory mock transport for unit testing.
 * Real production transport wraps a WebSocket client.
 */
export class MockTransport implements Transport {
  private handler: ((msg: AckEnvelope) => void) | null = null;
  public sent: CommandEnvelope[] = [];
  public connected = true;

  /** Configurable auto-reply behavior. Default: ack success after 10ms. */
  autoReply: ((cmd: CommandEnvelope) => AckEnvelope | null) | null = (cmd) => ({
    id: cmd.id,
    type: 'ack',
    module: 'device',
    payload: { success: true },
    ts: Date.now(),
  });

  send(envelope: CommandEnvelope): void {
    this.sent.push(envelope);
    if (this.autoReply && this.handler) {
      const reply = this.autoReply(envelope);
      if (reply) {
        // Simulate async bridge response
        setTimeout(() => this.handler?.(reply), 10);
      }
    }
  }

  onMessage(handler: (msg: AckEnvelope) => void): void {
    this.handler = handler;
  }

  /** Inject a message as if it came from the bridge. */
  injectMessage(msg: AckEnvelope): void {
    this.handler?.(msg);
  }

  close(): void {
    this.connected = false;
  }
}

/* ------------------------------------------------------------------ */
/* DeviceControlService                                                */
/* ------------------------------------------------------------------ */

export type DeviceEventType = 'command_queued' | 'command_started' | 'command_completed' | 'command_failed' | 'command_dead' | 'queue_drained';
export type DeviceEventListener = (event: { type: DeviceEventType; entry: QueueEntry }) => void;

export class DeviceControlService {
  private queue: QueueEntry[] = [];
  private executing = false;
  private transport: Transport;
  private pendingAck: { id: string; resolve: (ack: AckEnvelope['payload']) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private listeners: DeviceEventListener[] = [];
  private toggleStates: Map<SystemToggle, boolean> = new Map();

  private readonly cfg: Required<Pick<DeviceControlConfig, 'commandTimeoutMs' | 'maxRetries'>> & DeviceControlConfig;
  private readonly idGen: () => string;
  private readonly now: () => number;

  constructor(transport: Transport, config?: DeviceControlConfig) {
    this.transport = transport;
    this.cfg = {
      commandTimeoutMs: config?.commandTimeoutMs ?? DEFAULT_CONFIG.commandTimeoutMs,
      maxRetries: config?.maxRetries ?? DEFAULT_CONFIG.maxRetries,
      ...config,
    };
    this.idGen = config?.idGen ?? (() => `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`);
    this.now = config?.now ?? Date.now;

    this.transport.onMessage((msg) => this.handleAck(msg));
  }

  /* ---- Public API ------------------------------------------------ */

  /** Enqueue a device command. Returns the queue entry ID. */
  dispatch(command: DeviceCommand): string {
    const entry: QueueEntry = {
      id: this.idGen(),
      command,
      status: 'QUEUED',
      retries: 0,
      queuedAt: this.now(),
    };
    this.queue.push(entry);
    this.emit('command_queued', entry);
    this.drainQueue();
    return entry.id;
  }

  /** Convenience: dispatch and wait for the result. */
  async exec(command: DeviceCommand): Promise<QueueEntry> {
    const id = this.dispatch(command);
    return this.waitFor(id);
  }

  /** Wait for a specific command to reach a terminal state. */
  waitFor(id: string, timeoutMs = 30_000): Promise<QueueEntry> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const entry = this.queue.find((e) => e.id === id);
        if (!entry) return reject(new Error(`unknown command ${id}`));
        if (entry.status === 'COMPLETED' || entry.status === 'DEAD') {
          return resolve(entry);
        }
      };
      check();

      const listener: DeviceEventListener = (ev) => {
        if (ev.entry.id === id && (ev.type === 'command_completed' || ev.type === 'command_dead')) {
          this.off(listener);
          clearTimeout(timer);
          resolve(ev.entry);
        }
      };
      const timer = setTimeout(() => {
        this.off(listener);
        reject(new Error(`waitFor(${id}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.on(listener);
    });
  }

  /** Snapshot of the current queue. */
  snapshot(): QueueEntry[] {
    return this.queue.map((e) => ({ ...e }));
  }

  /** Current known toggle states (updated on ack). */
  getToggleStates(): Map<SystemToggle, boolean> {
    return new Map(this.toggleStates);
  }

  /** Pending + executing command count. */
  get pendingCount(): number {
    return this.queue.filter((e) => e.status === 'QUEUED' || e.status === 'EXECUTING').length;
  }

  on(listener: DeviceEventListener): void {
    this.listeners.push(listener);
  }

  off(listener: DeviceEventListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /** Convenience dispatchers ---------------------------------------- */

  launchApp(pkg: string): string {
    return this.dispatch({ category: 'app', action: 'launchApp', pkg });
  }

  closeApp(pkg: string): string {
    return this.dispatch({ category: 'app', action: 'closeApp', pkg });
  }

  switchApp(pkg: string): string {
    return this.dispatch({ category: 'app', action: 'switchApp', pkg });
  }

  tap(x: number, y: number): string {
    return this.dispatch({ category: 'screen', action: 'tap', x, y });
  }

  tapSelector(selector: string): string {
    return this.dispatch({ category: 'screen', action: 'tapSelector', selector });
  }

  scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number): string {
    return this.dispatch({ category: 'screen', action: 'scroll', direction, amount });
  }

  swipe(fromX: number, fromY: number, toX: number, toY: number, durationMs?: number): string {
    return this.dispatch({ category: 'screen', action: 'swipe', fromX, fromY, toX, toY, durationMs });
  }

  inputText(text: string, selector?: string): string {
    return this.dispatch({ category: 'screen', action: 'inputText', text, selector });
  }

  toggle(target: SystemToggle): string {
    return this.dispatch({ category: 'system', action: 'toggle', target });
  }

  pullNotifications(): string {
    return this.dispatch({ category: 'system', action: 'pullNotifications' });
  }

  dial(number: string): string {
    return this.dispatch({ category: 'comms', action: 'dial', number });
  }

  readSms(count?: number): string {
    return this.dispatch({ category: 'comms', action: 'readSms', count });
  }

  sendSms(to: string, body: string): string {
    return this.dispatch({ category: 'comms', action: 'sendSms', to, body });
  }

  answerCall(): string {
    return this.dispatch({ category: 'comms', action: 'answerCall' });
  }

  rejectCall(): string {
    return this.dispatch({ category: 'comms', action: 'rejectCall' });
  }

  /** Shutdown: clear queue, close transport. */
  dispose(): void {
    if (this.pendingAck) {
      clearTimeout(this.pendingAck.timer);
      this.pendingAck.reject(new Error('disposed'));
      this.pendingAck = null;
    }
    this.queue = [];
    this.listeners = [];
    this.transport.close();
  }

  /* ---- Internal -------------------------------------------------- */

  private emit(type: DeviceEventType, entry: QueueEntry): void {
    for (const l of this.listeners) {
      try { l({ type, entry }); } catch { /* listener errors must not break dispatch */ }
    }
  }

  private drainQueue(): void {
    if (this.executing) return;
    const next = this.queue.find((e) => e.status === 'QUEUED');
    if (!next) {
      this.emit('queue_drained', { id: '', command: {} as DeviceCommand, status: 'COMPLETED', retries: 0, queuedAt: 0 });
      return;
    }
    this.executeEntry(next);
  }

  private executeEntry(entry: QueueEntry): void {
    this.executing = true;
    entry.status = 'EXECUTING';
    entry.startedAt = this.now();
    this.emit('command_started', entry);

    const envelope: CommandEnvelope = {
      id: entry.id,
      type: 'command',
      module: 'device',
      payload: entry.command,
      ts: this.now(),
    };

    const timeoutTimer = setTimeout(() => {
      if (this.pendingAck?.id === entry.id) {
        const ack = this.pendingAck;
        this.pendingAck = null; // release BEFORE reject so drainQueue's new pendingAck survives
        ack.reject(new Error('timeout'));
      }
    }, this.cfg.commandTimeoutMs);

    this.pendingAck = {
      id: entry.id,
      resolve: (ack) => {
        clearTimeout(timeoutTimer);
        entry.status = 'COMPLETED';
        entry.completedAt = this.now();
        entry.result = ack;
        this.updateToggleState(entry);
        this.emit('command_completed', entry);
        this.executing = false;
        this.pendingAck = null;
        this.drainQueue();
      },
      reject: (err) => {
        clearTimeout(timeoutTimer);
        entry.retries += 1;
        if (entry.retries > this.cfg.maxRetries) {
          entry.status = 'DEAD';
          entry.error = err.message;
          this.emit('command_dead', entry);
        } else {
          entry.status = 'QUEUED'; // re-queue for retry
          entry.error = err.message;
          this.emit('command_failed', entry);
        }
        this.executing = false;
        this.pendingAck = null;
        this.drainQueue();
      },
      timer: timeoutTimer,
    };

    this.transport.send(envelope);
  }

  private handleAck(msg: AckEnvelope): void {
    if (this.pendingAck && this.pendingAck.id === msg.id) {
      // Android often sends type=ack without payload.success; treat that as success.
      const ok = msg.type === 'ack' && msg.payload.success !== false;
      if (ok) {
        this.pendingAck.resolve({ ...msg.payload, success: true });
      } else {
        this.pendingAck.reject(new Error(msg.payload.message ?? msg.payload.code ?? 'bridge error'));
      }
    }
  }

  private updateToggleState(entry: QueueEntry): void {
    const cmd = entry.command;
    if (cmd.category === 'system' && cmd.action === 'toggle') {
      const current = this.toggleStates.get(cmd.target) ?? false;
      this.toggleStates.set(cmd.target, !current);
    }
  }
}
