import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { isUsableApiKey, loadKeysFromEnv, saveCustomKeys, validateKeyFormats } from '../src/config/load_keys.js';

test('placeholder API keys are not counted as configured', () => {
  assert.equal(isUsableApiKey('your_gemini_api_key_here'), false);
  assert.equal(loadKeysFromEnv({ SARVIS_GEMINI_API_KEY: 'your_gemini_api_key_here' }).length, 0);
  assert.equal(loadKeysFromEnv({ SARVIS_GEMINI_API_KEY: 'AQ.real-key' }).length, 1);
});

test('new Gemini AQ keys are accepted without a false warning', () => {
  assert.deepEqual(validateKeyFormats({ SARVIS_GEMINI_API_KEY: 'AQ.real-key' }), []);
});

test('custom key vault accepts unlimited entries and reloads them', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sarvis-keys-'));
  const file = path.join(dir, '.sarvis-keys.json');
  try {
    const entries = Array.from({ length: 12 }, (_, i) => ({
      id: `custom-${i}`,
      provider: 'local-compatible',
      endpoint: 'https://example.test/v1/chat/completions',
      model: 'demo-model',
      apiKey: `key-${i}`,
    }));
    saveCustomKeys(entries, file);
    const loaded = loadKeysFromEnv({}, file);
    assert.equal(loaded.length, 12);
    assert.equal(loaded[11].id, 'custom-11');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
