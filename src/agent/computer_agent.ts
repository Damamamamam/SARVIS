/**
 * Bounded computer agent for local, user-requested actions.
 *
 * This deliberately does not expose an arbitrary shell to the language model.
 * Natural-language requests are converted into a small ordered plan, each tool
 * is allow-listed, and the result of every step is returned to the conversation.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { WinControlService } from '../services/win_control.js';

const execAsync = promisify(exec);
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type ComputerAction =
  | { tool: 'open_app'; target: string }
  | { tool: 'open_url'; url: string }
  | { tool: 'type_text'; text: string }
  | { tool: 'write_file'; file: string; content: string }
  | { tool: 'open_file'; file: string }
  | { tool: 'run_project_command'; command: string };

export interface ComputerStepResult {
  tool: ComputerAction['tool'];
  ok: boolean;
  detail: string;
}

export interface ComputerAgentResult {
  handled: true;
  reply: string;
  steps: ComputerStepResult[];
}

const APP_ALIASES: Record<string, string> = {
  chrome: 'chrome',
  'google chrome': 'chrome',
  edge: 'edge',
  'microsoft edge': 'edge',
  browser: 'edge',
  notepad: 'notepad',
  notes: 'notepad',
  'text editor': 'notepad',
  code: 'code',
  vscode: 'code',
  'vs code': 'code',
  'visual studio code': 'code',
  terminal: 'terminal',
  powershell: 'powershell',
  calculator: 'calculator',
  calc: 'calculator',
  explorer: 'explorer',
  'file explorer': 'explorer',
  settings: 'settings',
  spotify: 'spotify',
  paint: 'paint',
  word: 'word',
};

const APP_NAMES = Object.keys(APP_ALIASES).sort((a, b) => b.length - a.length).join('|');

function normalizeRequest(text: string): string {
  return text.trim()
    .replace(/^(?:hey\s+)?(?:sarvis|jarvis)[,\s:]*/i, '')
    .replace(/^please\s+/i, '')
    .trim();
}

function appTarget(value: string): string | null {
  const cleaned = value.trim().replace(/^the\s+/i, '').replace(/[.!?]+$/, '').toLowerCase();
  return APP_ALIASES[cleaned] ?? null;
}

function urlTarget(value: string): string | null {
  const cleaned = value.trim().replace(/[.!?]+$/, '');
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (/^(?:www\.)[\w.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(cleaned)) return `https://${cleaned}`;
  return null;
}

function parseAtomic(text: string): ComputerAction[] | null {
  const request = text.trim().replace(/[.!?]+$/, '');

  const openAndType = request.match(/^(?:open|launch|start)\s+(?:the\s+)?(.+?)\s+(?:and then|then|and)\s+(?:write|type|enter)(?:\s+down)?\s+(.+)$/i);
  if (openAndType) {
    const target = appTarget(openAndType[1]);
    if (target) return [{ tool: 'open_app', target }, { tool: 'type_text', text: openAndType[2].replace(/\s+in it$/i, '').trim() }];
  }

  const openAndSearch = request.match(/^(?:open|launch|start)\s+(?:the\s+)?(.+?)\s+(?:and then|then|and)\s+search\s+(?:for\s+)?(.+)$/i);
  if (openAndSearch) {
    const target = appTarget(openAndSearch[1]);
    if (target) return [{ tool: 'open_app', target }, { tool: 'open_url', url: `https://www.google.com/search?q=${encodeURIComponent(openAndSearch[2])}` }];
  }

  const writeIn = request.match(/^(?:write|type|enter)(?:\s+down)?\s+(.+?)\s+(?:in|into|on)\s+(?:the\s+)?(.+)$/i);
  if (writeIn) {
    const target = appTarget(writeIn[2]);
    if (target) return [{ tool: 'open_app', target }, { tool: 'type_text', text: writeIn[1].trim() }];
  }

  const createFile = request.match(/^(?:create|write)(?:\s+(?:a|an))?\s+file\s+(?:called|named)\s+([^\s]+)(?:\s+(?:with|containing)\s+([\s\S]+))?$/i);
  if (createFile) {
    return [{ tool: 'write_file', file: createFile[1], content: createFile[2]?.trim() ?? '' }];
  }

  const openFile = request.match(/^(?:open|edit)\s+(?:the\s+)?file\s+(.+)$/i);
  if (openFile) return [{ tool: 'open_file', file: openFile[1].trim() }];

  const open = request.match(/^(?:open|launch|start)\s+(?:the\s+)?(.+)$/i);
  if (open) {
    const url = urlTarget(open[1]);
    if (url) return [{ tool: 'open_url', url }];
    const target = appTarget(open[1]);
    if (target) return [{ tool: 'open_app', target }];
  }

  const type = request.match(/^(?:type|write|enter)(?:\s+down)?\s+(.+)$/i);
  if (type) return [{ tool: 'type_text', text: type[1].trim() }];

  const run = request.match(/^(?:run|execute)(?:\s+(?:the\s+)?(?:project\s+)?command)?\s+(.+)$/i);
  if (run && allowedProjectCommand(run[1].trim())) return [{ tool: 'run_project_command', command: run[1].trim() }];

  const build = request.match(/^(?:build|test)\s+(?:the\s+)?project$/i);
  if (build) return [{ tool: 'run_project_command', command: build[0].toLowerCase().startsWith('test') ? 'npm test' : 'npm run build' }];

  const search = request.match(/^search\s+(?:the web\s+)?(?:for\s+)?(.+)$/i);
  if (search) return [{ tool: 'open_url', url: `https://www.google.com/search?q=${encodeURIComponent(search[1])}` }];

  return null;
}

/** Convert a natural-language request into an ordered, bounded action plan. */
export function parseComputerPlan(text: string): ComputerAction[] | null {
  const request = normalizeRequest(text);
  if (!request) return null;

  const direct = parseAtomic(request);
  if (direct) return direct;

  const parts = request.split(/\s+(?:and then|then|after that|next)\s+/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const actions: ComputerAction[] = [];
  for (const part of parts) {
    const parsed = parseAtomic(part);
    if (!parsed) return null;
    actions.push(...parsed);
  }
  return actions.length > 0 && actions.length <= 6 ? actions : null;
}

function safeWorkspacePath(file: string): string {
  const root = path.resolve(process.cwd());
  const resolved = path.resolve(root, file);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error('file path must stay inside the SARVIS workspace');
  return resolved;
}

function allowedProjectCommand(command: string): boolean {
  return /^(?:npm\s+(?:test|run\s+(?:build|copy-ui|test(?::[a-z-]+)?))|git\s+(?:status|diff|log(?:\s+[-\w.]+)*))|node\s+--version|npm\s+--version$/i.test(command.trim());
}

export class ComputerAgent {
  private readonly control: WinControlService;

  constructor(control = new WinControlService()) {
    this.control = control;
  }

  async execute(text: string): Promise<ComputerAgentResult | null> {
    const plan = parseComputerPlan(text);
    if (!plan) return null;

    const steps: ComputerStepResult[] = [];
    for (const action of plan) {
      try {
        const detail = await this.executeAction(action);
        steps.push({ tool: action.tool, ok: true, detail });
      } catch (error) {
        steps.push({ tool: action.tool, ok: false, detail: error instanceof Error ? error.message : String(error) });
        break;
      }
    }

    const completed = steps.filter((step) => step.ok).length;
    const failed = steps.find((step) => !step.ok);
    const summary = failed
      ? `I completed ${completed} step${completed === 1 ? '' : 's'}, then stopped at ${failed.tool}: ${failed.detail}.`
      : `Completed ${completed} computer step${completed === 1 ? '' : 's'}: ${steps.map((step) => step.detail).join(' ')}`;
    return { handled: true, reply: summary, steps };
  }

  private async executeAction(action: ComputerAction): Promise<string> {
    switch (action.tool) {
      case 'open_app':
        await this.control.launchApp(action.target);
        return `Opened ${action.target}.`;
      case 'open_url':
        await this.control.openUrl(action.url);
        return `Opened ${action.url}.`;
      case 'type_text':
        await wait(700);
        await this.control.typeText(action.text);
        return `Typed ${action.text.length} characters into the active window.`;
      case 'write_file': {
        const file = safeWorkspacePath(action.file);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, action.content, 'utf8');
        return `Wrote ${action.content.length} characters to ${path.relative(process.cwd(), file)}.`;
      }
      case 'open_file': {
        const file = safeWorkspacePath(action.file);
        if (!fs.existsSync(file)) throw new Error(`file does not exist: ${action.file}`);
        await this.control.openPath(file);
        return `Opened ${path.relative(process.cwd(), file)}.`;
      }
      case 'run_project_command': {
        if (!allowedProjectCommand(action.command)) throw new Error('command is not on the safe project-command allowlist');
        const result = await execAsync(action.command, { cwd: process.cwd(), windowsHide: true, timeout: 120_000, maxBuffer: 512 * 1024 });
        const output = `${result.stdout}${result.stderr}`.trim().replace(/\s+/g, ' ').slice(-240);
        return `Ran ${action.command}.${output ? ` Output: ${output}` : ''}`;
      }
    }
  }
}
