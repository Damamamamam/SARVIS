/**
 * Tests for DeviceControlService — queue ordering, toggle tracking,
 * retry→DEAD transition, and command timeout handling.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceControlService, MockTransport } from '../src/services/device_control.js';

const cfg = { idGen: () => 'id', now: () => 1000 };

test('dispatch returns id and resolves via mock transport', async () => {
  const t = new MockTransport();
  const svc = new DeviceControlService(t, cfg);
  const id = svc.launchApp('com.example');
  const entry = await svc.waitFor(id);
  assert.equal(entry.status, 'COMPLETED');
  assert.equal(t.sent.length, 1);
  svc.dispose();
});

test('toggles track state on ack', async () => {
  const t = new MockTransport();
  const svc = new DeviceControlService(t, cfg);
  const id = svc.toggle('wifi');
  await svc.waitFor(id);
  assert.equal(svc.getToggleStates().get('wifi'), true);
  svc.dispose();
});

test('failed command is retried then marked DEAD after maxRetries', async () => {
  const t = new MockTransport();
  t.autoReply = (cmd) => ({ id: cmd.id, type: 'error', module: 'device', payload: { success: false, code: 'FAIL', message: 'boom' }, ts: 1000 });
  const svc = new DeviceControlService(t, { ...cfg, maxRetries: 2 });
  const id = svc.launchApp('com.example');
  const entry = await svc.waitFor(id);
  assert.equal(entry.status, 'DEAD');
  assert.equal(entry.retries, 3); // initial + 2 retries
  svc.dispose();
});

test('command times out when bridge never replies', async () => {
  const t = new MockTransport();
  t.autoReply = null; // no reply
  const svc = new DeviceControlService(t, { ...cfg, commandTimeoutMs: 20 });
  const id = svc.launchApp('com.example');
  const entry = await svc.waitFor(id);
  assert.equal(entry.status, 'DEAD');
  svc.dispose();
});

test('commands execute serially (one at a time)', async () => {
  let executing = 0;
  let maxConcurrent = 0;
  const t = new MockTransport();
  t.autoReply = (cmd) => {
    executing++;
    maxConcurrent = Math.max(maxConcurrent, executing);
    setTimeout(() => { executing--; }, 5);
    return { id: cmd.id, type: 'ack', module: 'device', payload: { success: true }, ts: 1000 };
  };
  const svc = new DeviceControlService(t, cfg);
  const ids = [svc.launchApp('a'), svc.launchApp('b'), svc.launchApp('c')];
  await Promise.all(ids.map((i) => svc.waitFor(i)));
  assert.equal(maxConcurrent, 1);
  svc.dispose();
});
