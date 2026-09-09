/**
 * Tests for AmbientAudioRecorder — rolling buffer, kill-switch hard-stop,
 * and re-arm security guarantees.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AmbientAudioRecorder } from '../src/services/audio_recorder.js';

const chunk = (n = 160) => new Float32Array(n).fill(0.5);

test('arm -> start -> pushChunk builds rolling buffer', () => {
  const r = new AmbientAudioRecorder({ now: () => 0 });
  r.arm();
  assert.equal(r.getState(), 'ARMED');
  r.start();
  assert.equal(r.getState(), 'RECORDING');
  r.pushChunk(chunk());
  assert.equal(r.bufferedMs(), 5000);
  r.dispose();
});

test('buffer rolls over beyond window (30s / 5s = 6 chunks)', () => {
  let t = 0;
  const r = new AmbientAudioRecorder({ now: () => (t += 5000) });
  r.arm();
  r.start();
  for (let i = 0; i < 9; i++) r.pushChunk(chunk());
  assert.equal(r.bufferedMs(), 30000); // trimmed to window, not 45s
  assert.equal(r.getRecentAudio().length, 6 * 160);
  r.dispose();
});

test('kill switch zeroes buffer and blocks re-recording without rearm', () => {
  let killed = false;
  const r = new AmbientAudioRecorder({ now: () => 0 });
  r.on('kill-switch', () => { killed = true; });
  r.arm();
  r.start();
  r.pushChunk(chunk());
  r.kill();
  assert.equal(r.getState(), 'KILLED');
  assert.equal(killed, true);
  assert.equal(r.bufferedMs(), 0);
  assert.throws(() => r.start(), /requires ARMED/);
  r.dispose();
});

test('rearm only valid from KILLED', () => {
  const r = new AmbientAudioRecorder({ now: () => 0 });
  assert.throws(() => r.rearm(), /requires KILLED/);
  r.arm();
  r.start();
  r.kill();
  r.rearm();
  assert.equal(r.getState(), 'IDLE');
  r.dispose();
});

test('pushChunk ignored unless RECORDING', () => {
  const r = new AmbientAudioRecorder({ now: () => 0 });
  r.pushChunk(chunk());
  assert.equal(r.bufferedMs(), 0);
  r.arm();
  r.pushChunk(chunk());
  assert.equal(r.bufferedMs(), 0);
  r.dispose();
});
