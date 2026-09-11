/**
 * Tests for OwnerTalkDetector — TalkState classification and threshold edges.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OwnerTalkDetector, MockFaceMesh } from '../src/services/vision_tracker.js';

test('null landmarks => NO_FACE', () => {
  const d = new OwnerTalkDetector();
  assert.equal(d.processFrame(null), 'NO_FACE');
});

test('facing lens + mouth moving => TALKING_TO_SARVIS', () => {
  const d = new OwnerTalkDetector({ now: () => 0 });
  const mesh = new MockFaceMesh({ yawDeg: 0, mar: 0.35, moving: true });
  let state = 'NO_FACE';
  for (let i = 0; i < 12; i++) state = d.processFrame(mesh.frame());
  assert.equal(state, 'TALKING_TO_SARVIS');
});

test('looking away (yaw > tolerance) => ROOM_CONVERSATION even if moving', () => {
  const d = new OwnerTalkDetector({ gazeAngleTolerance: 30, now: () => 0 });
  const mesh = new MockFaceMesh({ yawDeg: 60, mar: 0.4, moving: true });
  let state = 'NO_FACE';
  for (let i = 0; i < 12; i++) state = d.processFrame(mesh.frame());
  assert.equal(state, 'ROOM_CONVERSATION');
});

test('still face, small MAR => ROOM_CONVERSATION', () => {
  const d = new OwnerTalkDetector({ now: () => 0 });
  const mesh = new MockFaceMesh({ yawDeg: 0, mar: 0.1, moving: false });
  let state = 'NO_FACE';
  for (let i = 0; i < 12; i++) state = d.processFrame(mesh.frame());
  assert.equal(state, 'ROOM_CONVERSATION');
});

test('gaze tolerance boundary at exactly threshold counts as facing', () => {
  const d = new OwnerTalkDetector({ gazeAngleTolerance: 30, now: () => 0 });
  const mesh = new MockFaceMesh({ yawDeg: 30, mar: 0.4, moving: true });
  let state = 'NO_FACE';
  for (let i = 0; i < 12; i++) state = d.processFrame(mesh.frame());
  assert.equal(state, 'TALKING_TO_SARVIS');
});

test('emits state change events', () => {
  const d = new OwnerTalkDetector();
  const seen: string[] = [];
  d.on('state', (s) => seen.push(s));
  d.processFrame(null);
  d.processFrame(new MockFaceMesh({ yawDeg: 0, mar: 0.4, moving: true }).frame());
  assert.ok(seen.includes('NO_FACE'));
});
