/**
 * Local WebSocket bridge. The brain is the server; the Android app is the client.
 */
import { WebSocketServer, type WebSocket } from 'ws';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AckEnvelope, CommandEnvelope, DeviceCommand, Transport } from '../services/device_control.js';
import { toAndroidDevicePayload } from '../protocol/android_payload.js';

export interface BridgeMessage {
  id: string;
  type: 'command' | 'event' | 'ack' | 'error';
  module: string;
  payload: Record<string, unknown>;
  ts: number;
}

export type EventHandler = (msg: BridgeMessage) => void;

export class BrainBridge implements Transport {
  private wss: WebSocketServer | null = null;
  private http: HttpServer | null = null;
  private clients = new Set<WebSocket>();
  private ackHandler: ((msg: AckEnvelope) => void) | null = null;
  private eventHandler: EventHandler | null = null;

  constructor(
    private readonly host: string,
    private readonly port: number,
  ) {}

  get connected(): boolean {
    return [...this.clients].some((c) => c.readyState === 1);
  }

  async listen(): Promise<void> {
    this.http = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('JARVIS brain bridge\n');
    });
    this.wss = new WebSocketServer({ server: this.http });
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.on('message', (raw) => this.onRaw(String(raw)));
      ws.on('close', () => this.clients.delete(ws));
      ws.on('error', () => this.clients.delete(ws));
    });
    await new Promise<void>((resolve, reject) => {
      this.http!.once('error', reject);
      this.http!.listen(this.port, this.host, () => resolve());
    });
  }

  send(envelope: CommandEnvelope): void {
    const wire = {
      id: envelope.id,
      type: envelope.type,
      module: envelope.module,
      ts: envelope.ts,
      payload: toAndroidDevicePayload(envelope.payload as DeviceCommand),
    };
    const text = JSON.stringify(wire);
    for (const ws of this.clients) {
      if (ws.readyState === 1) ws.send(text);
    }
  }

  sendJson(msg: BridgeMessage): void {
    const text = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === 1) ws.send(text);
    }
  }

  onMessage(handler: (msg: AckEnvelope) => void): void {
    this.ackHandler = handler;
  }

  onEvent(handler: EventHandler): void {
    this.eventHandler = handler;
  }

  close(): void {
    for (const ws of this.clients) {
      try { ws.close(); } catch { /* ignore */ }
    }
    this.clients.clear();
    this.wss?.close();
    this.http?.close();
    this.wss = null;
    this.http = null;
  }

  private onRaw(text: string): void {
    let msg: BridgeMessage;
    try {
      msg = JSON.parse(text) as BridgeMessage;
    } catch {
      return;
    }
    if (msg.type === 'ack' || msg.type === 'error') {
      this.ackHandler?.({
        id: msg.id,
        type: msg.type,
        module: 'device',
        payload: {
          success: msg.type === 'ack' && (msg.payload?.success as boolean | undefined) !== false,
          data: msg.payload,
          code: msg.payload?.code as string | undefined,
          message: msg.payload?.message as string | undefined,
        },
        ts: msg.ts,
      });
      return;
    }
    if (msg.type === 'event') {
      this.eventHandler?.(msg);
    }
  }
}
