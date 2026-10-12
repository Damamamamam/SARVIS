import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseComputerPlan } from '../src/agent/computer_agent.js';

test('plans open and type as ordered computer actions', () => {
  assert.deepEqual(parseComputerPlan('SARVIS, open notepad and write down hello from the agent'), [
    { tool: 'open_app', target: 'notepad' },
    { tool: 'type_text', text: 'hello from the agent' },
  ]);
});

test('plans a workspace file write without allowing an arbitrary shell', () => {
  assert.deepEqual(parseComputerPlan('create a file named notes/demo.md containing a short plan'), [
    { tool: 'write_file', file: 'notes/demo.md', content: 'a short plan' },
  ]);
  assert.equal(parseComputerPlan('run powershell Remove-Item *'), null);
});

test('plans browser search and safe project actions', () => {
  assert.deepEqual(parseComputerPlan('search the web for SARVIS agent tools'), [
    { tool: 'open_url', url: 'https://www.google.com/search?q=SARVIS%20agent%20tools' },
  ]);
  assert.deepEqual(parseComputerPlan('build the project'), [
    { tool: 'run_project_command', command: 'npm run build' },
  ]);
});
