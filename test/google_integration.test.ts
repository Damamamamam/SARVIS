import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleIntegration, YOUTUBE_READONLY_SCOPE } from '../src/services/google_integration.js';

test('Google integration stays disabled until OAuth credentials are configured', () => {
  const integration = new GoogleIntegration(9742, 'http://127.0.0.1:9742/api/auth/google/callback');
  const status = integration.status(undefined);
  assert.equal(status.signedIn, false);
  assert.equal(status.youtubeConnected, false);
  if (!integration.configured) assert.throws(() => integration.createAuthorizationUrl(integration.createSessionId(), false), /not configured/);
});

test('YouTube scope is read-only and not a write/manage scope', () => {
  assert.equal(YOUTUBE_READONLY_SCOPE, 'https://www.googleapis.com/auth/youtube.readonly');
  assert.equal(YOUTUBE_READONLY_SCOPE.includes('force-ssl'), false);
});
