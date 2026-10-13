/**
 * Consentful local context for SARVIS.
 *
 * The scanner records metadata only: app names, folder names, file counts,
 * extensions, and running process names. It never reads file contents, keys,
 * browser history, or message databases.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface AwarenessConsent {
  apps: boolean;
  files: boolean;
}

export interface FileAwareness {
  roots: string[];
  folders: number;
  files: number;
  extensions: Record<string, number>;
  largestFolders: string[];
}

export interface AppAwareness {
  installed: string[];
  running: string[];
}

export interface LocalAwareness {
  generatedAt: string;
  platform: string;
  homeDirectory: string;
  consent: AwarenessConsent;
  apps?: AppAwareness;
  files?: FileAwareness;
  limitations: string[];
}

export interface PersonalityAnswers {
  workStyle: string;
  communication: string;
  planning: string;
  energy: string;
  support: string;
}

export interface UserProfile {
  setupComplete: boolean;
  displayName?: string;
  role?: string;
  tone: 'CALM' | 'CHEERFUL' | 'FORMAL';
  traits: string[];
  answers?: PersonalityAnswers;
  awareness?: LocalAwareness;
  confirmedAt?: string;
}

export interface SarvisSettings {
  brainModel: string;
  voiceInputModel: string;
}

export const DEFAULT_SETTINGS: SarvisSettings = {
  brainModel: 'auto',
  voiceInputModel: 'browser-native',
};

export function getProfilePath(dir: string = process.cwd()): string {
  return path.join(dir, '.sarvis-profile.json');
}

export function getSettingsPath(dir: string = process.cwd()): string {
  return path.join(dir, '.sarvis-settings.json');
}

export function loadUserProfile(filePath: string = getProfilePath()): UserProfile {
  if (!fs.existsSync(filePath)) return { setupComplete: false, tone: 'CALM', traits: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<UserProfile>;
    return {
      setupComplete: Boolean(parsed.setupComplete),
      displayName: cleanText(parsed.displayName, 80),
      role: cleanText(parsed.role, 120),
      tone: parsed.tone === 'CHEERFUL' || parsed.tone === 'FORMAL' ? parsed.tone : 'CALM',
      traits: Array.isArray(parsed.traits) ? parsed.traits.map((v) => cleanText(v, 50)).filter(Boolean).slice(0, 8) : [],
      answers: parsed.answers,
      awareness: parsed.awareness,
      confirmedAt: parsed.confirmedAt,
    };
  } catch {
    return { setupComplete: false, tone: 'CALM', traits: [] };
  }
}

export function saveUserProfile(profile: UserProfile, filePath: string = getProfilePath()): UserProfile {
  const safe: UserProfile = {
    ...profile,
    displayName: cleanText(profile.displayName, 80) || undefined,
    role: cleanText(profile.role, 120) || undefined,
    traits: profile.traits.map((v) => cleanText(v, 50)).filter(Boolean).slice(0, 8),
  };
  fs.writeFileSync(filePath, JSON.stringify(safe, null, 2), 'utf8');
  return safe;
}

export function loadSettings(filePath: string = getSettingsPath()): SarvisSettings {
  if (!fs.existsSync(filePath)) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<SarvisSettings>;
    return {
      brainModel: cleanText(parsed.brainModel, 120) || DEFAULT_SETTINGS.brainModel,
      voiceInputModel: cleanText(parsed.voiceInputModel, 120) || DEFAULT_SETTINGS.voiceInputModel,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: SarvisSettings, filePath: string = getSettingsPath()): SarvisSettings {
  const safe = {
    brainModel: cleanText(settings.brainModel, 120) || DEFAULT_SETTINGS.brainModel,
    voiceInputModel: cleanText(settings.voiceInputModel, 120) || DEFAULT_SETTINGS.voiceInputModel,
  };
  fs.writeFileSync(filePath, JSON.stringify(safe, null, 2), 'utf8');
  return safe;
}

export async function scanLocalAwareness(options: {
  consent: AwarenessConsent;
  roots?: string[];
}): Promise<LocalAwareness> {
  const consent = { apps: Boolean(options.consent.apps), files: Boolean(options.consent.files) };
  const result: LocalAwareness = {
    generatedAt: new Date().toISOString(),
    platform: `${process.platform} ${os.release()}`,
    homeDirectory: os.homedir(),
    consent,
    limitations: [
      'SARVIS records metadata only and does not read file contents, browser history, messages, passwords, or API keys.',
      'The inventory is a snapshot and can be refreshed from setup at any time.',
    ],
  };
  if (consent.apps) result.apps = await scanApps();
  if (consent.files) result.files = scanFiles(options.roots ?? defaultRoots());
  return result;
}

function defaultRoots(): string[] {
  const home = os.homedir();
  return [
    path.join(home, 'Desktop'),
    path.join(home, 'Documents'),
    path.join(home, 'Downloads'),
    process.cwd(),
  ];
}

async function scanApps(): Promise<AppAwareness> {
  const installed = new Set<string>();
  const startMenus = [
    path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.ProgramData ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ].filter(Boolean);
  for (const menu of startMenus) collectShortcuts(menu, installed, 0);

  const running = new Set<string>();
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true });
      for (const line of stdout.split(/\r?\n/)) {
        const match = line.match(/^"([^"]+)"/);
        if (match?.[1]) running.add(match[1].replace(/\.exe$/i, ''));
      }
    } catch {
      /* App inventory is best-effort and never blocks startup. */
    }
  }
  return { installed: [...installed].sort().slice(0, 500), running: [...running].sort().slice(0, 200) };
}

function collectShortcuts(folder: string, result: Set<string>, depth: number): void {
  if (depth > 3 || !folder || !fs.existsSync(folder)) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) collectShortcuts(full, result, depth + 1);
    else if (/\.(lnk|url|exe)$/i.test(entry.name)) result.add(entry.name.replace(/\.(lnk|url|exe)$/i, ''));
  }
}

function scanFiles(roots: string[]): FileAwareness {
  const extensions: Record<string, number> = {};
  const folderCounts: Array<{ name: string; count: number }> = [];
  let folders = 0;
  let files = 0;
  const validRoots = [...new Set(roots.filter((root) => root && fs.existsSync(root)).map((root) => path.resolve(root)))];
  for (const root of validRoots) scanDirectory(root, 0, extensions, folderCounts, (delta) => { files += delta.files; folders += delta.folders; });
  return {
    roots: validRoots,
    folders,
    files,
    extensions,
    largestFolders: folderCounts.sort((a, b) => b.count - a.count).slice(0, 12).map((entry) => entry.name),
  };
}

function scanDirectory(
  folder: string,
  depth: number,
  extensions: Record<string, number>,
  folderCounts: Array<{ name: string; count: number }>,
  add: (delta: { files: number; folders: number }) => void,
): void {
  if (depth > 2) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch { return; }
  let localFiles = 0;
  for (const entry of entries.slice(0, 2000)) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      add({ files: 0, folders: 1 });
      scanDirectory(full, depth + 1, extensions, folderCounts, add);
    } else if (entry.isFile()) {
      localFiles += 1;
      const ext = path.extname(entry.name).toLowerCase() || '[no extension]';
      extensions[ext] = (extensions[ext] ?? 0) + 1;
      add({ files: 1, folders: 0 });
    }
  }
  if (localFiles) folderCounts.push({ name: path.basename(folder) || folder, count: localFiles });
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
