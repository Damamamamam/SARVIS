/**
 * SARVIS web app server: serves the chat UI over HTTP and exposes a JSON API
 * + WebSocket live channel so SARVIS works as a browser web app (no WPF/Electron needed).
 *
 *   npm run start:web            (SARVIS_BIND=0.0.0.0 SARVIS_PORT=9742)
 *
 * Endpoints:
 *   GET  /api/health          -> { ok, uptime, providers, transport }
 *   GET  /api/status          -> rotator status, reminders, profile, screen guard
 *   POST /api/hear            -> { text } => { reply, degraded, ... }
 *   GET  /api/keys            -> { configured: { PROVIDER_ENV: boolean } }
 *   POST /api/keys            -> { updates: { ENV: value } } => saves to .env, reloads brain
 *   POST /api/command         -> { category, action, ... } => WinControl result
 *   GET  /api/active-window   -> active window info (best effort)
 *   WS   /ws                  -> { type:'hear', id, text } => { type:'reply', id, reply, degraded }
 *                               server pushes { type:'nudge', nudge }
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { JarvisBrain } from '../agent/brain.js';
import { isUsableApiKey, loadDotEnvFile, loadKeysFromEnv, validateKeyFormats } from '../config/load_keys.js';
import { WinControlService } from '../services/win_control.js';
import { WinScreenGuard } from '../services/win_screen_guard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.SARVIS_PORT ?? process.env.SARVIS_WEB_PORT ?? 9742);
const HOST = process.env.SARVIS_BIND ?? '127.0.0.1';

const KEY_ENVS = [
  'SARVIS_GEMINI_API_KEY',
  'SARVIS_GROQ_API_KEY',
  'SARVIS_OPENROUTER_API_KEY',
  'SARVIS_CEREBRAS_API_KEY',
  'SARVIS_MISTRAL_API_KEY',
  'SARVIS_TOGETHER_API_KEY',
  'SARVIS_COHERE_API_KEY',
  'SARVIS_DEEPSEEK_API_KEY',
  'SARVIS_OPENCODE_ZEN_API_KEY',
];

function getEnvFilePath(): string {
  return path.join(process.cwd(), '.env');
}

function updateEnvFile(filePath: string, updates: Record<string, string>): void {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  const lines = content.split('\n');
  const updated = new Set<string>();
  const next = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      if (key in updates) {
        updated.add(key);
        return `${key}=${updates[key]}`;
      }
    }
    return line;
  });
  for (const [k, v] of Object.entries(updates)) {
    if (!updated.has(k)) next.push(`${k}=${v}`);
  }
  fs.writeFileSync(filePath, next.join('\n'), 'utf-8');
  for (const [k, v] of Object.entries(updates)) process.env[k] = v;
}

function uiDir(): string {
  // dist layout: dist/src/server/webapp.js -> dist/src/ui/...
  const distUi = path.join(__dirname, '../ui');
  if (fs.existsSync(path.join(distUi, 'index.html'))) return distUi;
  // dev fallback: src/ui
  return path.join(process.cwd(), 'src/ui');
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

async function main(): Promise<void> {
  const loadedEnvs = loadDotEnvFile();
  for (const w of validateKeyFormats()) console.warn(`SARVIS config: ${w}`);
  if (loadedEnvs.length === 0) {
    console.warn('No SARVIS_*_API_KEY values found (.env or environment) — LLM path will run degraded/local fallback.');
  } else {
    console.log(`SARVIS providers configured: ${loadedEnvs.map((e) => e.replace('SARVIS_', '').replace('_API_KEY', '').toLowerCase()).join(', ')}`);
  }
  let jarvis = new JarvisBrain({ keys: loadKeysFromEnv() });
  const winControl = new WinControlService();
  const winGuard = new WinScreenGuard();
  const startedAt = Date.now();
  const peers = new Set<WebSocket>();

  const broadcast = (msg: unknown) => {
    const text = JSON.stringify(msg);
    for (const ws of peers) {
      if (ws.readyState === 1) ws.send(text);
    }
  };

  try {
    winGuard.onNudge((nudge) => broadcast({ type: 'nudge', nudge, ts: Date.now() }));
    winGuard.start();
  } catch {
    /* screen guard is best-effort on non-Windows */
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const p = url.pathname;

      // ---- API ----
      if (p === '/api/health') {
        return sendJson(res, 200, {
          ok: true,
          uptimeSec: Math.round((Date.now() - startedAt) / 1000),
          providers: jarvis.rotator.keyCount,
          transport: 'web',
        });
      }
      if (p === '/api/status' && req.method === 'GET') {
        return sendJson(res, 200, {
          rotator: jarvis.rotator.status(),
          pendingReminders: jarvis.brain.pendingReminders(),
          profile: jarvis.brain.profileSnapshot,
          screenGuard: winGuard.snapshot(),
        });
      }
      if (p === '/api/hear' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}') as { text?: string };
        const text = (body.text ?? '').trim();
        if (!text) return sendJson(res, 400, { error: 'text is required' });
        const result = await jarvis.hear(text);
        return sendJson(res, 200, result);
      }
      if (p === '/api/keys' && req.method === 'GET') {
        const configured: Record<string, boolean> = {};
        for (const k of KEY_ENVS) configured[k] = isUsableApiKey(process.env[k]);
        return sendJson(res, 200, { configured });
      }
      if (p === '/api/keys' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}') as { updates?: Record<string, string> };
        const updates = body.updates ?? {};
        for (const [k, v] of Object.entries(updates)) {
          if (!KEY_ENVS.includes(k)) return sendJson(res, 400, { error: `unknown key: ${k}` });
          if (typeof v !== 'string' || !v.trim()) return sendJson(res, 400, { error: `empty value for ${k}` });
        }
        updateEnvFile(getEnvFilePath(), updates);
        const old = jarvis;
        jarvis = new JarvisBrain({ keys: loadKeysFromEnv() });
        old.dispose();
        return sendJson(res, 200, { success: true, providers: jarvis.rotator.keyCount });
      }
      if (p === '/api/command' && req.method === 'POST') {
        const cmd = JSON.parse((await readBody(req)) || '{}') as Parameters<WinControlService['executeCommand']>[0];
        try {
          const result = await winControl.executeCommand(cmd);
          return sendJson(res, 200, result);
        } catch (err) {
          return sendJson(res, 500, { success: false, error: (err as Error).message });
        }
      }
      if (p === '/api/active-window' && req.method === 'GET') {
        try {
          const win = await winControl.getActiveWindow();
          return sendJson(res, 200, win ?? { name: null });
        } catch {
          return sendJson(res, 200, { name: null });
        }
      }

      // ---- Static UI ----
      const dir = uiDir();
      let file = p === '/' ? 'index.html' : p.slice(1).split('?')[0];
      if (file.includes('..')) return sendJson(res, 400, { error: 'bad path' });
      const full = path.join(dir, file);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) {
        res.writeHead(200, { 'content-type': MIME[path.extname(full)] ?? 'application/octet-stream' });
        fs.createReadStream(full).pipe(res);
        return;
      }
      if (p.startsWith('/api/') || p === '/ws') return sendJson(res, 404, { error: 'not found' });
      // SPA fallback
      const index = path.join(dir, 'index.html');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      fs.createReadStream(index).pipe(res);
    } catch (err) {
      sendJson(res, 500, { error: (err as Error).message });
    }
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    peers.add(ws);
    ws.on('close', () => peers.delete(ws));
    ws.on('error', () => peers.delete(ws));
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { type?: string; id?: string; text?: string };
        if (msg.type === 'hear' && msg.text?.trim()) {
          const result = await jarvis.hear(msg.text.trim());
          ws.send(JSON.stringify({ type: 'reply', id: msg.id ?? null, reply: result.reply, degraded: result.degraded ?? false, ts: Date.now() }));
          return;
        }
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch {
        /* ignore malformed frames */
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, () => resolve());
  });

  console.log(`SARVIS web app at http://${HOST}:${PORT}`);
  console.log(`API: http://${HOST}:${PORT}/api/health`);

  const shutdown = () => {
    winGuard.stop();
    jarvis.dispose();
    wss.close();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
