import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadSettings, loadUserProfile, saveSettings, saveUserProfile, scanLocalAwareness } from '../src/services/user_context.js';

test('awareness scan records file metadata without reading file contents', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sarvis-context-'));
  try {
    fs.mkdirSync(path.join(dir, 'notes'));
    fs.writeFileSync(path.join(dir, 'notes', 'plan.md'), 'private body should never enter the result');
    fs.writeFileSync(path.join(dir, 'photo.png'), 'not a real image');
    const result = await scanLocalAwareness({ consent: { apps: false, files: true }, roots: [dir] });
    assert.equal(result.apps, undefined);
    assert.equal(result.files?.files, 2);
    assert.equal(result.files?.extensions['.md'], 1);
    assert.equal(JSON.stringify(result).includes('private body'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('profile and model settings persist locally', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sarvis-profile-'));
  try {
    const profilePath = path.join(dir, 'profile.json');
    const settingsPath = path.join(dir, 'settings.json');
    saveUserProfile({ setupComplete: true, displayName: 'Alex', role: 'Student', tone: 'CHEERFUL', traits: ['curious'] }, profilePath);
    saveSettings({ brainModel: 'demo-model', voiceInputModel: 'browser-native' }, settingsPath);
    assert.equal(loadUserProfile(profilePath).displayName, 'Alex');
    assert.equal(loadSettings(settingsPath).brainModel, 'demo-model');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
