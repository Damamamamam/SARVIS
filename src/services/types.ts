/** Shared types for the SARVIS brain (see docs/architecture.md §5). */

export interface KeyConfig {
  id: string;
  provider: string; // gemini | groq | openrouter | cerebras | mistral | together | cohere | deepseek
  endpoint: string; // OpenAI-compatible chat completions URL
  apiKey: string; // resolved at runtime from env / Keystore — never hardcoded
  models: string[];
  limits?: { reqPerMinute?: number; reqPerDay?: number };
}

export interface RotatorPolicy {
  failoverOn?: string[];
  cooldownBaseSec?: number;
  healthCheckIntervalSec?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface RotatorStats {
  calls: number;
  failures: number;
  lastUsedMs: number;
}

export interface ChatCompletion {
  id?: string;
  choices: Array<{
    message?: { role: string; content: string };
    text?: string; // some free providers return `text` in choices
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tsMs: number;
}

export interface Conversation {
  id: string;
  startedAtMs: number;
  transcript: ConversationMessage[];
}

export interface Reminder {
  id: string;
  source: 'voice' | 'manual' | 'behavior';
  raw: string;
  text: string;
  dueAtMs: number;
  status: 'PENDING' | 'RUNG' | 'DISMISSED';
}

export interface ScreenTimeEntry {
  app: string; // package name
  label: string;
  flaggedUnnecessary: boolean;
  sessionMs: number;
  dailyTotalMs: number;
  nudgeSent: boolean;
}

export interface BehaviorProfile {
  ownerName?: string;
  wakeWord: string;
  routines: Array<{ timeWindow: string; observedApps: string[]; heardKeywords: string[] }>;
  nudgePrefs: { screenTimeThresholdMs: number; reminderLeadMinutes: number };
  tone: 'CALM' | 'CHEERFUL' | 'FORMAL';
}

export type TalkState = 'TALKING_TO_SARVIS' | 'ROOM_CONVERSATION' | 'NO_FACE';

export interface ToolResult {
  name: string;
  content: string;
  sourceUrl?: string;
}
