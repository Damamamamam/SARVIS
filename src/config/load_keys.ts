/**
 * Load provider credentials from the environment and the local custom-key
 * vault. Custom entries are intentionally unbounded: users may add multiple
 * keys for one provider or any OpenAI-compatible endpoint.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { KeyConfig } from '../services/types.js';

export interface ProviderDefinition {
  env: string;
  id: string;
  provider: string;
  endpoint: string;
  models: string[];
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
}

export interface StoredKeyInput {
  id?: string;
  label?: string;
  provider: string;
  endpoint: string;
  model?: string;
  models?: string[];
  apiKey?: string;
}

export interface StoredKey extends KeyConfig {
  label?: string;
  source: 'custom';
}

export const PROVIDERS: ProviderDefinition[] = [
  { env: 'SARVIS_GEMINI_API_KEY', id: 'gemini-flash-1', provider: 'gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', models: ['gemini-3.1-flash-lite'] },
  { env: 'SARVIS_GROQ_API_KEY', id: 'groq-1', provider: 'groq', endpoint: 'https://api.groq.com/openai/v1/chat/completions', models: ['llama-3.1-8b-instant'] },
  { env: 'SARVIS_OPENROUTER_API_KEY', id: 'openrouter-1', provider: 'openrouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', models: ['openrouter/auto'] },
  { env: 'SARVIS_CEREBRAS_API_KEY', id: 'cerebras-1', provider: 'cerebras', endpoint: 'https://api.cerebras.ai/v1/chat/completions', models: ['llama3.1-8b'] },
  { env: 'SARVIS_MISTRAL_API_KEY', id: 'mistral-1', provider: 'mistral', endpoint: 'https://api.mistral.ai/v1/chat/completions', models: ['mistral-small-latest'] },
  { env: 'SARVIS_TOGETHER_API_KEY', id: 'together-1', provider: 'together', endpoint: 'https://api.together.xyz/v1/chat/completions', models: ['meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'] },
  { env: 'SARVIS_COHERE_API_KEY', id: 'cohere-1', provider: 'cohere', endpoint: 'https://api.cohere.ai/compatibility/v1/chat/completions', models: ['command-r'] },
  { env: 'SARVIS_DEEPSEEK_API_KEY', id: 'deepseek-1', provider: 'deepseek', endpoint: 'https://api.deepseek.com/chat/completions', models: ['deepseek-chat'] },
  { env: 'SARVIS_OPENCODE_ZEN_API_KEY', id: 'opencode-zen-1', provider: 'opencode-zen', endpoint: 'https://opencode.ai/zen/v1/chat/completions', models: ['nemotron-3-ultra-free'] },
];

export const VOICE_MODEL_OPTIONS: ModelOption[] = [
  { id: 'browser-native', label: 'Browser native (local)', provider: 'local' },
  { id: 'whisper-1', label: 'Whisper-compatible audio', provider: 'openai-compatible' },
  { id: 'gemini-2.5-flash', label: 'Gemini audio', provider: 'gemini' },
];

export function getAvailableModels(keys: KeyConfig[] = loadKeysFromEnv()): { brain: ModelOption[]; voice: ModelOption[] } {
  const brain: ModelOption[] = [{ id: 'auto', label: 'Auto / failover', provider: 'SARVIS' }];
  const seen = new Set(brain.map((model) => model.id));
  for (const key of keys) {
    for (const model of key.models) {
      if (!seen.has(model)) {
        seen.add(model);
        brain.push({ id: model, label: `${model} (${key.provider})`, provider: key.provider });
      }
    }
  }
  return { brain, voice: VOICE_MODEL_OPTIONS };
}

export function getKeyStorePath(dir: string = process.cwd()): string {
  return path.join(dir, '.sarvis-keys.json');
}

export function loadCustomKeys(filePath: string = getKeyStorePath()): StoredKey[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { keys?: StoredKey[] };
    if (!Array.isArray(raw.keys)) return [];
    return raw.keys.filter((key) => isUsableApiKey(key.apiKey) && isValidCustomKey(key));
  } catch {
    return [];
  }
}

export function saveCustomKeys(entries: StoredKeyInput[], filePath: string = getKeyStorePath()): StoredKey[] {
  const seen = new Set<string>();
  const keys: StoredKey[] = [];
  for (const entry of entries) {
    if (!isValidCustomKey(entry) || !isUsableApiKey(entry.apiKey)) continue;
    const id = entry.id?.trim() || `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    keys.push({
      id,
      label: entry.label?.trim() || entry.provider.trim(),
      provider: entry.provider.trim(),
      endpoint: entry.endpoint.trim(),
      apiKey: entry.apiKey!.trim(),
      models: (entry.models?.length ? entry.models : [entry.model?.trim() || 'default']).filter(Boolean),
      source: 'custom',
    });
  }
  fs.writeFileSync(filePath, JSON.stringify({ version: 1, keys }, null, 2), 'utf8');
  return keys;
}

export function loadKeysFromEnv(env: NodeJS.ProcessEnv = process.env, filePath: string = getKeyStorePath()): KeyConfig[] {
  const envKeys = PROVIDERS.flatMap((p) => {
    const apiKey = env[p.env]?.trim();
    if (!apiKey || !isUsableApiKey(apiKey)) return [];
    return [{ id: p.id, label: p.provider, provider: p.provider, endpoint: p.endpoint, apiKey, models: p.models, source: 'env' as const }];
  });
  return [...envKeys, ...loadCustomKeys(filePath)];
}

/** Return false for blank/example values copied from .env.example. */
export function isUsableApiKey(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  return Boolean(trimmed && !/^(your_|example|changeme|replace[_-]?me)/i.test(trimmed));
}

function isValidCustomKey(key: Partial<StoredKeyInput>): boolean {
  return Boolean(key.provider?.trim() && /^https?:\/\//i.test(key.endpoint?.trim() ?? '') && (key.models?.length || key.model?.trim()));
}

/** Minimal `.env` loader. */
export function loadDotEnvFile(dir: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): string[] {
  const file = path.join(dir, '.env');
  if (!fs.existsSync(file)) return [];
  const content = fs.readFileSync(file, 'utf-8');
  for (const line of content.split('\n')) {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('export ')) trimmed = trimmed.slice(7).trim();
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (key && !(key in env)) env[key] = val;
  }
  return PROVIDERS.map((p) => p.env).filter((key) => isUsableApiKey(env[key]));
}

/** Warn about keys that look malformed, without printing secrets. */
export function validateKeyFormats(env: NodeJS.ProcessEnv = process.env): string[] {
  const warnings: string[] = [];
  const gemini = env.SARVIS_GEMINI_API_KEY?.trim();
  if (gemini && !/^(AIza|AQ\.)/.test(gemini)) warnings.push('SARVIS_GEMINI_API_KEY has an unfamiliar prefix; check it is a Gemini API key, not an OAuth token.');
  return warnings;
}
