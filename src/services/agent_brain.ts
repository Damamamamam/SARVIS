/**
 * AgentBrain — central orchestrator.
 * Routes intents, maintains conversation state, extracts voice tasks/reminders,
 * issues screen-time nudges, and grows a behavior profile. Provider-agnostic:
 * every LLM round-trip goes through APIRotatorService.
 */
import { APIRotatorService } from './api_rotator.js';
import type {
  BehaviorProfile,
  Conversation,
  KeyConfig,
  Reminder,
  ScreenTimeEntry,
  TalkState,
  ToolResult,
} from './types.js';

export interface BrainConfig {
  keys: KeyConfig[];
  wakeWord?: string;
  screenTimeThresholdMs?: number;
  reminderLeadMinutes?: number;
  ownerName?: string;
}

export interface AgentEvent {
  type: 'reminder_created' | 'screen_time_nudge' | 'talk_state' | 'profile_update';
  at: string;
  data: unknown;
}

export interface BrainResult {
  reply: string;
  toolCalls?: ToolResult[];
  reminders?: Reminder[];
  events?: AgentEvent[];
  degraded?: boolean;
}

/** Reminder keywords that trigger task extraction from transcribed speech. */
const REMINDER_VERBS = ['remind', 'submit', 'ring', 'call', 'pay', 'send', 'buy', 'book', 'email', 'message'];
const TIME_TOKENS: Array<[RegExp, (m: RegExpMatchArray, now: Date) => Date]> = [
  [/\btonight\b/i, (_, n) => dayAt(n, 21, 0)],
  [/\btomorrow\b/i, (_, n) => dayAt(n, 9, 0, 1)],
  [/\b(on )?thursday\b/i, (_, n) => nextWeekday(n, 4, 9, 0)],
  [/\b(on )?friday\b/i, (_, n) => nextWeekday(n, 5, 9, 0)],
  [/\b(at )?(\d{1,2})(:(\d{2}))?\s*(am|pm)?\b/i, (m, n) => atHour(n, m)],
];

function dayAt(n: Date, h: number, min: number, offsetDays = 0): Date {
  const d = new Date(n);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(h, min, 0, 0);
  return d;
}

function nextWeekday(n: Date, weekday: number, h: number, min: number): Date {
  const d = new Date(n);
  let delta = (weekday - d.getDay() + 7) % 7;
  if (delta === 0) delta = 7; // always future
  d.setDate(d.getDate() + delta);
  d.setHours(h, min, 0, 0);
  return d;
}

function atHour(n: Date, m: RegExpMatchArray): Date {
  let h = Number(m[2]);
  const min = m[4] ? Number(m[4]) : 0;
  const meridiem = (m[5] ?? '').toLowerCase();
  if (meridiem === 'pm' && h < 12) h += 12;
  if (meridiem === 'am' && h === 12) h = 0;
  const d = new Date(n);
  d.setHours(h, min, 0, 0);
  if (d.getTime() <= n.getTime()) d.setDate(d.getDate() + 1); // "at 6" means next 6
  return d;
}

export class AgentBrain {
  private rotator: APIRotatorService;
  private conversation: Conversation;
  private reminders: Reminder[] = [];
  private screenTime: Map<string, ScreenTimeEntry> = new Map();
  private profile: BehaviorProfile;
  private cfg: Required<Pick<BrainConfig, 'wakeWord' | 'screenTimeThresholdMs' | 'reminderLeadMinutes'>> & BrainConfig;

  constructor(config: BrainConfig) {
    this.cfg = {
      wakeWord: config.wakeWord ?? 'jarvis',
      screenTimeThresholdMs: config.screenTimeThresholdMs ?? 2 * 3_600_000, // 2h default
      reminderLeadMinutes: config.reminderLeadMinutes ?? 10,
      ...config,
    };
    this.rotator = new APIRotatorService(config.keys);
    this.conversation = { id: `conv_${Date.now().toString(36)}`, startedAtMs: Date.now(), transcript: [] };
    this.profile = {
      wakeWord: this.cfg.wakeWord,
      routines: [],
      nudgePrefs: { screenTimeThresholdMs: this.cfg.screenTimeThresholdMs, reminderLeadMinutes: this.cfg.reminderLeadMinutes },
      tone: 'CALM',
      ownerName: config.ownerName,
    };
  }

  /** Current rotator state — exposed for dashboards and tests. */
  rotatorStatus() {
    return this.rotator.status();
  }

  /** Add observed screen-time usage; returns a nudge event when the threshold is crossed. */
  observeScreenTime(entry: ScreenTimeEntry): AgentEvent | null {
    const prev = this.screenTime.get(entry.app);
    this.screenTime.set(entry.app, entry);
    if (prev && !prev.nudgeSent && entry.dailyTotalMs >= this.cfg.screenTimeThresholdMs && entry.flaggedUnnecessary) {
      const updated = { ...entry, nudgeSent: true };
      this.screenTime.set(entry.app, updated);
      const event: AgentEvent = {
        type: 'screen_time_nudge',
        at: new Date().toISOString(),
        data: {
          app: entry.label,
          minutes: Math.round(entry.dailyTotalMs / 60_000),
          suggestion: `You've spent ${Math.round(entry.dailyTotalMs / 60_000)} minutes on ${entry.label} today.`,
        },
      };
      return event;
    }
    return null;
  }

  /** Feed a talk-state signal from OwnerTalkDetector (module D). */
  onTalkState(state: TalkState): AgentEvent {
    const event: AgentEvent = { type: 'talk_state', at: new Date().toISOString(), data: { state } };
    if (state === 'TALKING_TO_SARVIS') {
      this.profile.routines.push({ timeWindow: new Date().toTimeString().slice(0, 5), observedApps: [], heardKeywords: [] });
    }
    return event;
  }

  /**
   * Process a transcribed utterance.
   * - If it smells like a reminder ("submit on thursday", "ring reminders"), extract locally.
   * - Otherwise route to the LLM via the rotator.
   */
  async process(utterance: string): Promise<BrainResult> {
    const events: AgentEvent[] = [];
    this.conversation.transcript.push({ role: 'user', content: utterance, tsMs: Date.now() });

    // Local extraction — zero API cost, works even when all keys are degraded.
    const extracted = extractReminder(utterance);
    if (extracted) {
      this.reminders.push(extracted);
      events.push({ type: 'reminder_created', at: new Date().toISOString(), data: extracted });
      const due = new Date(extracted.dueAtMs);
      return {
        reply: `Done. Reminder set: "${extracted.text}" for ${due.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`,
        reminders: [extracted],
        events,
      };
    }

    // LLM path
    const res = await this.rotator.complete({ messages: this.conversation.transcript });
    if (!res.ok) {
      const fallback = localFallback(utterance);
      this.conversation.transcript.push({ role: 'assistant', content: fallback, tsMs: Date.now() });
      return { reply: fallback, events, degraded: true };
    }

    const reply = res.completion?.choices[0]?.message?.content ?? res.completion?.choices[0]?.text ?? '...';
    this.conversation.transcript.push({ role: 'assistant', content: reply, tsMs: Date.now() });
    return { reply, events, degraded: false };
  }

  pendingReminders(now = Date.now()): Reminder[] {
    return this.reminders.filter((r) => r.status === 'PENDING' && r.dueAtMs - now <= this.cfg.reminderLeadMinutes * 60_000 && r.dueAtMs >= now);
  }

  get profileSnapshot(): BehaviorProfile {
    return structuredClone(this.profile);
  }
}

/* ------------------------------------------------------------------ */
/* Local extraction & fallbacks                                        */
/* ------------------------------------------------------------------ */

export function extractReminder(text: string): Reminder | null {
  const lower = text.toLowerCase();
  if (!REMINDER_VERBS.some((v) => lower.includes(v))) return null;
  const now = new Date();
  for (const [re, resolve] of TIME_TOKENS) {
    const m = text.match(re);
    if (m) {
      const due = resolve(m, now);
      const clean = text.replace(re, '').replace(/\s+/g, ' ').replace(/^(remind me to |set a reminder to |remind me )/i, '').trim();
      return {
        id: `rem_${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`,
        source: 'voice',
        raw: text,
        text: clean || text,
        dueAtMs: due.getTime(),
        status: 'PENDING',
      };
    }
  }
  return null;
}

function localFallback(utterance: string): string {
  const lower = utterance.toLowerCase();
  if (lower.includes('time')) return `It's ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
  if (lower.includes('date') || lower.includes('day')) return `Today is ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}.`;
  return "I'm running on local fallback right now — my AI providers are all rate-limited. I can still set reminders and tell time.";
}
