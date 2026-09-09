/**
 * JARVIS brain process: WebSocket server + agent loop.
 *
 *   npm start
 *   JARVIS_BIND=0.0.0.0 JARVIS_PORT=9741 npm start
 */
import { JarvisBrain } from '../agent/brain.js';
import { loadKeysFromEnv } from '../config/load_keys.js';
import { pcm16leBase64ToFloat32 } from '../protocol/android_payload.js';
import type { FaceLandmarks } from '../services/vision_tracker.js';
import { BrainBridge, type BridgeMessage } from './bridge.js';

const PORT = Number(process.env.JARVIS_PORT ?? 9741);
const HOST = process.env.JARVIS_BIND ?? '0.0.0.0';

function asLandmarks(payload: Record<string, unknown>): FaceLandmarks | null {
  const lm = payload.landmarks as FaceLandmarks | undefined;
  if (!lm?.upperLip || !lm?.lowerLip || !lm?.mouthLeft || !lm?.mouthRight || !lm?.noseTip) {
    return null;
  }
  return lm;
}

async function main(): Promise<void> {
  const keys = loadKeysFromEnv();
  if (keys.length === 0) {
    console.warn('No JARVIS_*_API_KEY env vars set — LLM path will run degraded/local fallback.');
  }

  const bridge = new BrainBridge(HOST, PORT);
  const jarvis = new JarvisBrain({ keys, transport: bridge });

  bridge.onEvent(async (msg: BridgeMessage) => {
    try {
      if (msg.module === 'audio') {
        if (typeof msg.payload.transcript === 'string' && msg.payload.transcript.trim()) {
          const result = await jarvis.hear(msg.payload.transcript.trim());
          bridge.sendJson({
            id: `tts_${Date.now().toString(36)}`,
            type: 'command',
            module: 'voice',
            payload: { action: 'speak', text: result.reply },
            ts: Date.now(),
          });
          return;
        }
        if (typeof msg.payload.chunk === 'string') {
          try {
            if (jarvis.audio.getState() === 'IDLE') jarvis.beginListening();
          } catch { /* already armed/recording */ }
          jarvis.listen(pcm16leBase64ToFloat32(msg.payload.chunk));
        }
        return;
      }

      if (msg.module === 'vision') {
        const landmarks = asLandmarks(msg.payload);
        if (landmarks) jarvis.see(landmarks);
        return;
      }

      if (msg.module === 'screen') {
        const pkg = String(msg.payload.pkg ?? '');
        const label = String(msg.payload.label ?? pkg);
        const durationMs = Number(msg.payload.durationMs ?? 0);
        if (pkg) jarvis.screen(pkg, label, durationMs);
      }
    } catch (err) {
      console.error('bridge event failed', err);
    }
  });

  await bridge.listen();
  console.log(`JARVIS brain listening on ws://${HOST}:${PORT}`);
  console.log(`Emulator URL: ws://10.0.2.2:${PORT}`);
  console.log(`Phone on same Wi-Fi: ws://<this-pc-lan-ip>:${PORT}`);

  const shutdown = () => {
    jarvis.dispose();
    bridge.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
