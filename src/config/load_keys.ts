/**
 * Load LLM keys from the environment. Never hardcode secrets.
 *
 * Set any of:
 *   SARVIS_GEMINI_API_KEY, SARVIS_GROQ_API_KEY, SARVIS_OPENROUTER_API_KEY,
 *   SARVIS_CEREBRAS_API_KEY, SARVIS_MISTRAL_API_KEY, SARVIS_TOGETHER_API_KEY,
 *   SARVIS_COHERE_API_KEY, SARVIS_DEEPSEEK_API_KEY, SARVIS_OPENCODE_ZEN_API_KEY
 */
import type { KeyConfig } from '../services/types.js';

const PROVIDERS: Array<{
  env: string;
  id: string;
  provider: string;
  endpoint: string;
  models: string[];
}> = [
  {
    env: 'SARVIS_GEMINI_API_KEY',
    id: 'gemini-flash-1',
    provider: 'gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    models: ['gemini-3.1-flash-lite'],
  },
  {
    env: 'SARVIS_GROQ_API_KEY',
    id: 'groq-1',
    provider: 'groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    models: ['llama-3.1-8b-instant'],
  },
  {
    env: 'SARVIS_OPENROUTER_API_KEY',
    id: 'openrouter-1',
    provider: 'openrouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    models: ['openrouter/auto'],
  },
  {
    env: 'SARVIS_CEREBRAS_API_KEY',
    id: 'cerebras-1',
    provider: 'cerebras',
    endpoint: 'https://api.cerebras.ai/v1/chat/completions',
    models: ['llama3.1-8b'],
  },
  {
    env: 'SARVIS_MISTRAL_API_KEY',
    id: 'mistral-1',
    provider: 'mistral',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    models: ['mistral-small-latest'],
  },
  {
    env: 'SARVIS_TOGETHER_API_KEY',
    id: 'together-1',
    provider: 'together',
    endpoint: 'https://api.together.xyz/v1/chat/completions',
    models: ['meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo'],
  },
  {
    env: 'SARVIS_COHERE_API_KEY',
    id: 'cohere-1',
    provider: 'cohere',
    endpoint: 'https://api.cohere.ai/compatibility/v1/chat/completions',
    models: ['command-r'],
  },
  {
    env: 'SARVIS_DEEPSEEK_API_KEY',
    id: 'deepseek-1',
    provider: 'deepseek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    models: ['deepseek-chat'],
  },
  {
    env: 'SARVIS_OPENCODE_ZEN_API_KEY',
    id: 'opencode-zen-1',
    provider: 'opencode-zen',
    endpoint: 'https://opencode.ai/zen/v1/chat/completions',
    models: ['nemotron-3-ultra-free'],
  },
];

import * as fs from 'node:fs';
import * as path from 'node:path';

export function loadKeysFromEnv(env: NodeJS.ProcessEnv = process.env): KeyConfig[] {
  return PROVIDERS.flatMap((p) => {
    const apiKey = env[p.env]?.trim();
    if (!apiKey || !isUsableApiKey(apiKey)) return [];
    return [{
      id: p.id,
      provider: p.provider,
      endpoint: p.endpoint,
      apiKey,
      models: p.models,
    }];
  });
}

/** Return false for blank/example values copied from .env.example. */
export function isUsableApiKey(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  return Boolean(trimmed && !/^(your_|example|changeme|replace[_-]?me)/i.test(trimmed));
}

/**
 * Minimal `.env` loader (no dependency): reads `<dir>/.env` and fills any
 * missing vars into `env`. Without this, keys saved in `.env` never reach
 * `process.env` and the brain wrongly runs with zero providers.
 * Returns the names of SARVIS_* vars that ended up set (from file or env).
 */
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && !(key in env)) env[key] = val;
  }
  return PROVIDERS.map((p) => p.env).filter((k) => isUsableApiKey(env[k]));
}

/** Warn about keys that look malformed (wrong prefix), without printing secrets. */
export function validateKeyFormats(env: NodeJS.ProcessEnv = process.env): string[] {
  const warnings: string[] = [];
  const gemini = env.SARVIS_GEMINI_API_KEY?.trim();
  if (gemini && !/^(AIza|AQ\.)/.test(gemini)) {
    warnings.push('SARVIS_GEMINI_API_KEY has an unfamiliar prefix; check it is a Gemini API key, not an OAuth token.');
  }
  return warnings;
}
