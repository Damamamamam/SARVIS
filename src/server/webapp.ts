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
 *   GET  /api/keys            -> masked built-in and custom key metadata
 *   POST /api/keys            -> { keys: [...] } saves the unlimited local key vault
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
import { getAvailableModels, isUsableApiKey, loadCustomKeys, loadDotEnvFile, loadKeysFromEnv, PROVIDERS, saveCustomKeys, validateKeyFormats, type StoredKeyInput } from '../config/load_keys.js';
import { loadSettings, loadUserProfile, saveSettings, saveUserProfile, scanLocalAwareness, type SarvisSettings, type UserProfile } from '../services/user_context.js';
import { GoogleIntegration } from '../services/google_integration.js';
import { WinControlService } from '../services/win_control.js';
import { WinScreenGuard } from '../services/win_screen_guard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.SARVIS_PORT ?? process.env.SARVIS_WEB_PORT ?? 9742);
const HOST = process.env.SARVIS_BIND ?? '127.0.0.1';

const KEY_ENVS = PROVIDERS.map((provider) => provider.env);

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

function buildUserContext(profile: UserProfile): string | undefined {
  if (!profile.setupComplete) return undefined;
  const awareness = profile.awareness;
  const appSummary = awareness?.apps
    ? `Installed app names: ${awareness.apps.installed.slice(0, 80).join(', ') || 'none recorded'}. Running apps at setup: ${awareness.apps.running.slice(0, 40).join(', ') || 'none recorded'}.`
    : 'App inventory was not granted.';
  const fileSummary = awareness?.files
    ? `File metadata summary: ${awareness.files.files} files across ${awareness.files.folders} folders; roots ${awareness.files.roots.map((root) => path.basename(root)).join(', ') || 'none'}; common extensions ${Object.entries(awareness.files.extensions).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([ext, count]) => `${ext} (${count})`).join(', ') || 'none'}.`
    : 'File metadata inventory was not granted.';
  const googleSummary = profile.google
    ? `User-approved Google signals: YouTube channels ${profile.google.youtubeChannels?.join(', ') || 'none'}, YouTube topics ${profile.google.youtubeTopics?.join(', ') || 'none'}, imported search topics ${profile.google.searchTopics?.join(', ') || 'none'}.`
    : 'No Google signals have been connected.';
  return [
    'You are SARVIS, a local computer assistant. This is user-confirmed context, not a license to guess or claim access to private content.',
    `The user${profile.displayName ? ` is ${profile.displayName}` : ''}${profile.role ? ` and describes their role as ${profile.role}` : ''}.`,
    `Their preferred traits are ${profile.traits.join(', ') || 'not specified'} and their preferred tone is ${profile.tone}.`,
    appSummary,
    fileSummary,
    googleSummary,
    'Use this context to tailor suggestions, but ask before taking consequential actions and never infer sensitive traits from app names or file types.',
  ].join(' ');
}

function cookieValue(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

function setGoogleCookie(res: ServerResponse, sessionId: string): void {
  res.setHeader('Set-Cookie', `sarvis_google_session=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
}

function deriveTopics(titles: string[]): string[] {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'you', 'are', 'how', 'what', 'why', 'official', 'video']);
  const counts = new Map<string, number>();
  for (const title of titles) {
    for (const word of title.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []) {
      if (!stop.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([word]) => word);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

async function readBuffer(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function main(): Promise<void> {
  const loadedEnvs = loadDotEnvFile();
  for (const w of validateKeyFormats()) console.warn(`SARVIS config: ${w}`);
  const initialKeys = loadKeysFromEnv();
  if (initialKeys.length === 0) {
    console.warn('No SARVIS_*_API_KEY values found (.env or environment) — LLM path will run degraded/local fallback.');
  } else {
    console.log(`SARVIS keys configured: ${initialKeys.length} (${loadedEnvs.map((e) => e.replace('SARVIS_', '').replace('_API_KEY', '').toLowerCase()).join(', ')})`);
  }
  let userProfile = loadUserProfile();
  let settings = loadSettings();
  const createBrain = () => new JarvisBrain({
    keys: loadKeysFromEnv(),
    brainConfig: {
      ownerName: userProfile.displayName,
      brainModel: settings.brainModel,
      userContext: buildUserContext(userProfile),
      profile: {
        ownerName: userProfile.displayName,
        role: userProfile.role,
        traits: userProfile.traits,
        tone: userProfile.tone,
        setupComplete: userProfile.setupComplete,
        awareness: userProfile.awareness,
      },
    },
  });
  let jarvis = createBrain();
  const winControl = new WinControlService();
  const winGuard = new WinScreenGuard();
  const google = new GoogleIntegration(PORT);
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
          googleConfigured: google.configured,
        });
      }
      if (p === '/api/auth/google/start' || p === '/api/auth/google/youtube/start') {
        const sessionId = cookieValue(req, 'sarvis_google_session') ?? google.createSessionId();
        setGoogleCookie(res, sessionId);
        const youtube = p.endsWith('/youtube/start');
        res.writeHead(302, { Location: google.createAuthorizationUrl(sessionId, youtube) });
        res.end();
        return;
      }
      if (p === '/api/auth/google/callback') {
        const sessionId = cookieValue(req, 'sarvis_google_session');
        const error = url.searchParams.get('error');
        if (error) {
          res.writeHead(302, { Location: `/?google=denied&reason=${encodeURIComponent(error)}` });
          res.end();
          return;
        }
        if (!sessionId || !url.searchParams.get('state') || !url.searchParams.get('code')) throw new Error('Google callback is missing its session, state, or code.');
        await google.completeAuthorization(sessionId, url.searchParams.get('state')!, url.searchParams.get('code')!);
        res.writeHead(302, { Location: '/?google=connected' });
        res.end();
        return;
      }
      if (p === '/api/auth/google/status' && req.method === 'GET') {
        const sessionId = cookieValue(req, 'sarvis_google_session');
        return sendJson(res, 200, { ...google.status(sessionId), profile: userProfile.google ?? null });
      }
      if (p === '/api/auth/google/logout' && (req.method === 'POST' || req.method === 'GET')) {
        google.disconnect(cookieValue(req, 'sarvis_google_session'));
        userProfile = saveUserProfile({ ...userProfile, google: undefined });
        const old = jarvis;
        jarvis = createBrain();
        old.dispose();
        res.setHeader('Set-Cookie', 'sarvis_google_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
        return sendJson(res, 200, { success: true });
      }
      if (p === '/api/integrations/youtube/feed' && req.method === 'GET') {
        const sessionId = cookieValue(req, 'sarvis_google_session');
        if (!sessionId) return sendJson(res, 401, { error: 'Sign in with Google first.' });
        try { return sendJson(res, 200, await google.youtubeSignals(sessionId)); }
        catch (err) { return sendJson(res, 502, { error: (err as Error).message }); }
      }
      if (p === '/api/integrations/youtube/confirm' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}') as { channels?: string[]; topics?: string[] };
        const existing = userProfile.google ?? {};
        userProfile = saveUserProfile({ ...userProfile, google: { ...existing, youtubeChannels: body.channels?.filter((v): v is string => typeof v === 'string'), youtubeTopics: body.topics?.filter((v): v is string => typeof v === 'string'), youtubeConfirmedAt: new Date().toISOString() } });
        const old = jarvis;
        jarvis = createBrain();
        old.dispose();
        return sendJson(res, 200, { success: true, profile: userProfile.google });
      }
      if (p === '/api/integrations/youtube' && req.method === 'DELETE') {
        const existing = userProfile.google ?? {};
        userProfile = saveUserProfile({ ...userProfile, google: { ...existing, youtubeChannels: undefined, youtubeTopics: undefined, youtubeConfirmedAt: undefined } });
        const old = jarvis;
        jarvis = createBrain();
        old.dispose();
        return sendJson(res, 200, { success: true });
      }
      if (p === '/api/integrations/google/search-history' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}') as { consent?: boolean; topics?: string[] };
        if (!body.consent) return sendJson(res, 400, { error: 'Explicit search-history consent is required.' });
        const existing = userProfile.google ?? {};
        userProfile = saveUserProfile({ ...userProfile, google: { ...existing, searchTopics: body.topics?.filter((v): v is string => typeof v === 'string'), searchHistoryConfirmedAt: new Date().toISOString() } });
        const old = jarvis;
        jarvis = createBrain();
        old.dispose();
        return sendJson(res, 200, { success: true, topicCount: userProfile.google?.searchTopics?.length ?? 0 });
      }
      if (p === '/api/integrations/google/search-history' && req.method === 'DELETE') {
        const existing = userProfile.google ?? {};
        userProfile = saveUserProfile({ ...userProfile, google: { ...existing, searchTopics: undefined, searchHistoryConfirmedAt: undefined } });
        const old = jarvis;
        jarvis = createBrain();
        old.dispose();
        return sendJson(res, 200, { success: true });
      }
      if (p === '/api/status' && req.method === 'GET') {
        return sendJson(res, 200, {
          rotator: jarvis.rotator.status(),
          pendingReminders: jarvis.brain.pendingReminders(),
          profile: jarvis.brain.profileSnapshot,
          userProfile,
          settings,
          screenGuard: winGuard.snapshot(),
        });
      }
      if (p === '/api/setup' && req.method === 'GET') {
        return sendJson(res, 200, {
          setupRequired: !userProfile.setupComplete,
          profile: userProfile,
          settings,
          models: getAvailableModels(loadKeysFromEnv()),
        });
      }
      if (p === '/api/setup/scan' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}') as { consent?: { apps?: boolean; files?: boolean } };
        const consent = { apps: Boolean(body.consent?.apps), files: Boolean(body.consent?.files) };
        const awareness = await scanLocalAwareness({ consent });
        userProfile = saveUserProfile({ ...userProfile, awareness });
        return sendJson(res, 200, { success: true, awareness });
      }
      if (p === '/api/setup/profile' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}') as {
          displayName?: string; role?: string; traits?: string[]; tone?: UserProfile['tone']; answers?: UserProfile['answers'];
          brainModel?: string; voiceInputModel?: string;
        };
        const tone = body.tone === 'CHEERFUL' || body.tone === 'FORMAL' ? body.tone : 'CALM';
        userProfile = saveUserProfile({
          ...userProfile,
          setupComplete: true,
          displayName: body.displayName?.trim().slice(0, 80) || undefined,
          role: body.role?.trim().slice(0, 120) || undefined,
          traits: Array.isArray(body.traits) ? body.traits.filter((trait): trait is string => typeof trait === 'string').slice(0, 8) : [],
          tone,
          answers: body.answers,
          confirmedAt: new Date().toISOString(),
        });
        settings = saveSettings({
          brainModel: body.brainModel?.trim() || settings.brainModel,
          voiceInputModel: body.voiceInputModel?.trim() || settings.voiceInputModel,
        });
        const old = jarvis;
        jarvis = createBrain();
        old.dispose();
        return sendJson(res, 200, { success: true, profile: userProfile, settings });
      }
      if (p === '/api/settings' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}') as Partial<SarvisSettings>;
        settings = saveSettings({
          brainModel: typeof body.brainModel === 'string' ? body.brainModel : settings.brainModel,
          voiceInputModel: typeof body.voiceInputModel === 'string' ? body.voiceInputModel : settings.voiceInputModel,
        });
        const old = jarvis;
        jarvis = createBrain();
        old.dispose();
        return sendJson(res, 200, { success: true, settings, models: getAvailableModels(loadKeysFromEnv()) });
      }
      if (p === '/api/hear' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}') as { text?: string };
        const text = (body.text ?? '').trim();
        if (!text) return sendJson(res, 400, { error: 'text is required' });
        const result = await jarvis.hear(text);
        return sendJson(res, 200, result);
      }
      if (p === '/api/voice/transcribe' && req.method === 'POST') {
        if (settings.voiceInputModel === 'browser-native') return sendJson(res, 400, { error: 'Select a remote voice model before uploading audio.' });
        const audio = await readBuffer(req);
        if (!audio.length) return sendJson(res, 400, { error: 'audio is required' });
        const result = await jarvis.rotator.transcribe(audio, String(req.headers['content-type'] ?? 'audio/webm'), settings.voiceInputModel);
        return sendJson(res, result.ok ? 200 : 502, result);
      }
      if (p === '/api/keys' && req.method === 'GET') {
        const configured: Record<string, boolean> = {};
        for (const k of KEY_ENVS) configured[k] = isUsableApiKey(process.env[k]);
        const keys = jarvis.rotator.status().keys.map((key) => ({
          id: key.id,
          label: key.label ?? key.provider,
          provider: key.provider,
          endpoint: key.endpoint,
          model: key.models[0] ?? 'default',
          source: key.source ?? 'env',
          configured: key.apiKey === 'configured',
        }));
        return sendJson(res, 200, { configured, keys, unlimited: true });
      }
      if (p === '/api/keys' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)) || '{}') as { updates?: Record<string, string>; keys?: StoredKeyInput[] };
        if (Array.isArray(body.keys)) {
          const existing = new Map(loadCustomKeys().map((key) => [key.id, key]));
          const entries = body.keys.map((entry) => {
            const old = entry.id ? existing.get(entry.id) : undefined;
            const masked = !entry.apiKey || entry.apiKey.startsWith('••••');
            return { ...entry, apiKey: masked ? old?.apiKey : entry.apiKey };
          });
          saveCustomKeys(entries);
          const old = jarvis;
          jarvis = createBrain();
          old.dispose();
          return sendJson(res, 200, { success: true, providers: jarvis.rotator.keyCount, unlimited: true });
        }
        const updates = body.updates ?? {};
        for (const [k, v] of Object.entries(updates)) {
          if (!KEY_ENVS.includes(k)) return sendJson(res, 400, { error: `unknown key: ${k}` });
          if (typeof v !== 'string' || !v.trim()) return sendJson(res, 400, { error: `empty value for ${k}` });
        }
        updateEnvFile(getEnvFilePath(), updates);
        const old = jarvis;
        jarvis = createBrain();
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
