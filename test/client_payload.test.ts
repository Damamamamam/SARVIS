import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAckSuccess, pcm16leBase64ToFloat32, toClientDevicePayload } from '../src/protocol/client_payload.js';

test('swipe maps TS fromX to client startX', () => {
  const p = toClientDevicePayload({
    category: 'screen',
    action: 'swipe',
    fromX: 1,
    fromY: 2,
    toX: 3,
    toY: 4,
    durationMs: 250,
  });
  assert.equal(p.action, 'swipe');
  assert.equal(p.startX, 1);
  assert.equal(p.endY, 4);
  assert.equal(p.duration, 250);
});

test('pullNotifications maps to notifications', () => {
  const p = toClientDevicePayload({ category: 'system', action: 'pullNotifications' });
  assert.equal(p.action, 'notifications');
});

test('ack without success field is treated as success', () => {
  assert.equal(isAckSuccess('ack', {}), true);
  assert.equal(isAckSuccess('ack', { success: true }), true);
  assert.equal(isAckSuccess('ack', { success: false }), false);
  assert.equal(isAckSuccess('error', {}), false);
});

test('pcm16le base64 decodes to float32', () => {
  const buf = Buffer.alloc(4);
  buf.writeInt16LE(32767, 0);
  buf.writeInt16LE(-32768, 2);
  const samples = pcm16leBase64ToFloat32(buf.toString('base64'));
  assert.equal(samples.length, 2);
  assert.ok(samples[0] > 0.99);
  assert.ok(samples[1] <= -1);
});
