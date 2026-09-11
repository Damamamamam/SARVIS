/**
 * Load LLM keys from the environment. Never hardcode secrets.
 *
 * Set any of:
 *   SARVIS_GEMINI_API_KEY, SARVIS_GROQ_API_KEY, SARVIS_OPENROUTER_API_KEY,
 *   SARVIS_CEREBRAS_API_KEY, SARVIS_MISTRAL_API_KEY, SARVIS_TOGETHER_API_KEY,
 *   SARVIS_COHERE_API_KEY, SARVIS_DEEPSEEK_API_KEY
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
    models: ['gemini-2.5-flash'],
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
];

export function loadKeysFromEnv(env: NodeJS.ProcessEnv = process.env): KeyConfig[] {
  return PROVIDERS.flatMap((p) => {
    const apiKey = env[p.env]?.trim();
    if (!apiKey) return [];
    return [{
      id: p.id,
      provider: p.provider,
      endpoint: p.endpoint,
      apiKey,
      models: p.models,
    }];
  });
}
