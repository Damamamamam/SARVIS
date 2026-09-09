/**
 * Light integration test for JarvisBrain composition root.
 * Verifies the subsystems wire together and the local reminder path works
 * without any network / API keys.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JarvisBrain } from '../src/agent/brain.js';
import type { KeyConfig } from '../src/services/types.js';

const keys: KeyConfig[] = [
  {
    id: 'k1',
    provider: 'gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    apiKey: 'dummy',
    models: ['gemini-flash'],
  },
];

test('JarvisBrain instantiates all subsystems', () => {
  const j = new JarvisBrain({ keys });
  assert.ok(j.brain);
  assert.ok(j.rotator);
  assert.ok(j.audio);
  assert.ok(j.vision);
  assert.ok(j.guard);
  j.dispose();
});

test('local reminder extraction works without network', async () => {
  const j = new JarvisBrain({ keys });
  const res = await j.hear('remind me to submit the report on friday');
  if ('reminders' in res) {
    assert.ok(res.reminders && res.reminders.length === 1);
  } else {
    assert.fail('Expected reminders in result');
  }
  assert.match(res.reply, /Reminder set/);
  j.dispose();
});

test('screen guard nudge surfaces through JarvisBrain', () => {
  const j = new JarvisBrain({ keys, screenThresholdMs: 1000 });
  let nudge: any = null;
  j.onNudge((e) => (nudge = e));
  j.screen('com.instagram.android', 'Instagram', 1500);
  assert.ok(nudge);
  assert.equal(nudge.app, 'Instagram');
  j.dispose();
});

test('vision talk-state flows into the brain', () => {
  const j = new JarvisBrain({ keys });
  // MockFaceMesh not imported here; null => NO_FACE
  const state = j.see(null);
  assert.equal(state, 'NO_FACE');
  j.dispose();
});
