/**
 * Tests for DoomscrollGuard — threshold crossing, nudge emission, snooze, reset.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DoomscrollGuard } from '../src/services/screen_guard.js';

const FLAGGED = ['chrome.exe'];

test('nudge fires once when a flagged app crosses the threshold', () => {
  const g = new DoomscrollGuard({ thresholdMs: 50_000, flaggedApps: FLAGGED });
  // 2 x 30s = 60s > 50s threshold; fires on the 2nd observation (=> 1 minute)
  g.observe('chrome.exe', 'Chrome', 30_000);
  const ev = g.observe('chrome.exe', 'Chrome', 30_000);
  assert.ok(ev);
  assert.equal(ev!.app, 'Chrome');
  assert.equal(ev!.minutes, 1);
});

test('nudge does not fire twice for the same app', () => {
  const g = new DoomscrollGuard({ thresholdMs: 1000, flaggedApps: FLAGGED });
  let count = 0;
  g.onNudge(() => count++);
  g.observe('chrome.exe', 'Chrome', 1200);
  g.observe('chrome.exe', 'Chrome', 5000);
  assert.equal(count, 1);
});

test('non-flagged apps never trigger a nudge', () => {
  const g = new DoomscrollGuard({ thresholdMs: 1000, flaggedApps: FLAGGED });
  let fired = false;
  g.onNudge(() => (fired = true));
  g.observe('notepad.exe', 'Notepad', 999999);
  assert.equal(fired, false);
});

test('snooze suppresses nudges; resetDaily re-enables', () => {
  const g = new DoomscrollGuard({ thresholdMs: 1000, flaggedApps: FLAGGED });
  let count = 0;
  g.onNudge(() => count++);
  g.snooze();
  g.observe('chrome.exe', 'Chrome', 5000);
  assert.equal(count, 0);
  g.resetDaily();
  g.observe('chrome.exe', 'Chrome', 5000);
  assert.equal(count, 1);
});

test('snapshot tracks per-app daily totals', () => {
  const g = new DoomscrollGuard({ thresholdMs: 10_000, flaggedApps: FLAGGED });
  g.observe('chrome.exe', 'Chrome', 1500);
  g.observe('firefox.exe', 'Firefox', 800);
  const snap = g.snapshot();
  assert.equal(snap.length, 2);
  const chrome = snap.find((s) => s.app === 'chrome.exe');
  assert.equal(chrome?.dailyTotalMs, 1500);
});
