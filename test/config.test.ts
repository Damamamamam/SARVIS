import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUsableApiKey, loadKeysFromEnv, validateKeyFormats } from '../src/config/load_keys.js';

test('placeholder API keys are not counted as configured', () => {
  assert.equal(isUsableApiKey('your_gemini_api_key_here'), false);
  assert.equal(loadKeysFromEnv({ SARVIS_GEMINI_API_KEY: 'your_gemini_api_key_here' }).length, 0);
  assert.equal(loadKeysFromEnv({ SARVIS_GEMINI_API_KEY: 'AQ.real-key' }).length, 1);
});

test('new Gemini AQ keys are accepted without a false warning', () => {
  assert.deepEqual(validateKeyFormats({ SARVIS_GEMINI_API_KEY: 'AQ.real-key' }), []);
});
