/**
 * Maps TS DeviceCommand objects to the flat JSON the Android bridge understands.
 * Both current Kotlin field names and TS names are included so either side can
 * finish catching up without breaking the other.
 */
import type { DeviceCommand } from '../services/device_control.js';

export type AndroidDevicePayload = Record<string, unknown> & { action: string };

export function toAndroidDevicePayload(command: DeviceCommand): AndroidDevicePayload {
  switch (command.action) {
    case 'launchApp':
    case 'closeApp':
    case 'switchApp':
      return { action: command.action, pkg: command.pkg };

    case 'tap':
      return { action: 'tap', x: command.x, y: command.y };

    case 'tapSelector':
      return { action: 'tapSelector', selector: command.selector };

    case 'scroll':
      return { action: 'scroll', direction: command.direction, amount: command.amount };

    case 'swipe':
      return {
        action: 'swipe',
        startX: command.fromX,
        startY: command.fromY,
        endX: command.toX,
        endY: command.toY,
        duration: command.durationMs ?? 300,
        fromX: command.fromX,
        fromY: command.fromY,
        toX: command.toX,
        toY: command.toY,
        durationMs: command.durationMs ?? 300,
      };

    case 'inputText':
      return { action: 'inputText', text: command.text, selector: command.selector };

    case 'toggle':
      return flattenToggle(command.target);

    case 'pullNotifications':
      return { action: 'notifications' };

    case 'dismissNotifications':
      return { action: 'home' };

    case 'setBrightness':
      return { action: 'brightness', level: command.level };

    case 'setVolume':
      return {
        action: 'volume',
        level: command.level,
        stream: command.stream,
      };

    case 'dial':
      return { action: 'dial', number: command.number };

    case 'answerCall':
      return { action: 'answerCall' };

    case 'rejectCall':
      return { action: 'rejectCall' };

    case 'endCall':
      return { action: 'endCall' };

    case 'readSms':
      return { action: 'readSms', count: command.count ?? 5 };

    case 'sendSms':
      return { action: 'sendSms', to: command.to, body: command.body };
  }
}

function flattenToggle(target: string): AndroidDevicePayload {
  if (target === 'flashlight') {
    return { action: 'flashlight', enable: true, target };
  }
  if (target === 'volume_up') {
    return { action: 'volume', direction: 'up', target };
  }
  if (target === 'volume_down') {
    return { action: 'volume', direction: 'down', target };
  }
  if (target === 'volume_mute') {
    return { action: 'volume', level: 0, target };
  }
  return { action: 'toggle', target };
}

export function pcm16leBase64ToFloat32(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  const out = new Float32Array(Math.floor(buf.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = buf.readInt16LE(i * 2) / 32768;
  }
  return out;
}

export function isAckSuccess(type: string, payload: { success?: boolean }): boolean {
  if (type === 'error') return false;
  if (type !== 'ack') return false;
  return payload.success !== false;
}
