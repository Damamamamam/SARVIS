/**
 * Optional Google identity and YouTube signals.
 *
 * OAuth tokens intentionally live only in memory. SARVIS never writes Google
 * access or refresh tokens to the profile vault. A restart requires a fresh
 * sign-in, which keeps the local app from becoming a long-lived credential
 * store.
 */
import * as crypto from 'node:crypto';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const YOUTUBE_ENDPOINT = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

interface GoogleSession {
  accessToken: string;
  refreshToken?: string;
  expiresAtMs: number;
  email?: string;
  name?: string;
  picture?: string;
  scopes: string[];
}

interface PendingState {
  sessionId: string;
  youtube: boolean;
  createdAtMs: number;
}

export interface GoogleStatus {
  configured: boolean;
  signedIn: boolean;
  youtubeConnected: boolean;
  email?: string;
  name?: string;
  picture?: string;
}

export interface YouTubeSignals {
  generatedAt: string;
  items: Array<{ title: string; channel: string; publishedAt?: string; type: string }>;
  channels: string[];
  note: string;
}

export class GoogleIntegration {
  private readonly clientId = process.env.SARVIS_GOOGLE_CLIENT_ID?.trim() ?? '';
  private readonly clientSecret = process.env.SARVIS_GOOGLE_CLIENT_SECRET?.trim() ?? '';
  private readonly redirectUri: string;
  private readonly sessions = new Map<string, GoogleSession>();
  private readonly states = new Map<string, PendingState>();

  constructor(port: number, redirectUri = process.env.SARVIS_GOOGLE_REDIRECT_URI?.trim()) {
    this.redirectUri = redirectUri || `http://127.0.0.1:${port}/api/auth/google/callback`;
  }

  get configured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  get redirect(): string {
    return this.redirectUri;
  }

  createSessionId(): string {
    return crypto.randomBytes(24).toString('base64url');
  }

  createAuthorizationUrl(sessionId: string, youtube: boolean): string {
    if (!this.configured) throw new Error('Google OAuth is not configured. Set SARVIS_GOOGLE_CLIENT_ID and SARVIS_GOOGLE_CLIENT_SECRET.');
    const state = crypto.randomBytes(24).toString('base64url');
    this.states.set(state, { sessionId, youtube, createdAtMs: Date.now() });
    const scopes = ['openid', 'email', 'profile'];
    if (youtube) scopes.push(YOUTUBE_READONLY_SCOPE);
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: youtube ? 'consent' : 'select_account',
    });
    return `${AUTH_ENDPOINT}?${params}`;
  }

  async completeAuthorization(sessionId: string, state: string, code: string): Promise<void> {
    const pending = this.states.get(state);
    this.states.delete(state);
    if (!pending || pending.sessionId !== sessionId || Date.now() - pending.createdAtMs > 10 * 60_000) throw new Error('Google sign-in state expired or did not match this browser.');
    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: this.clientId, client_secret: this.clientSecret, redirect_uri: this.redirectUri, grant_type: 'authorization_code' }),
    });
    if (!tokenResponse.ok) throw new Error(`Google token exchange failed (${tokenResponse.status}).`);
    const token = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
    if (!token.access_token) throw new Error('Google did not return an access token.');
    const previous = this.sessions.get(sessionId);
    const user = await this.fetchUser(token.access_token);
    this.sessions.set(sessionId, {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? previous?.refreshToken,
      expiresAtMs: Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000,
      email: user.email,
      name: user.name,
      picture: user.picture,
      scopes: [...new Set([...(previous?.scopes ?? []), ...(token.scope ?? '').split(' ').filter(Boolean), ...(pending.youtube ? [YOUTUBE_READONLY_SCOPE] : [])])],
    });
  }

  status(sessionId: string | undefined): GoogleStatus {
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    return {
      configured: this.configured,
      signedIn: Boolean(session),
      youtubeConnected: Boolean(session?.scopes.includes(YOUTUBE_READONLY_SCOPE)),
      email: session?.email,
      name: session?.name,
      picture: session?.picture,
    };
  }

  disconnect(sessionId: string | undefined): void {
    if (sessionId) this.sessions.delete(sessionId);
  }

  async youtubeSignals(sessionId: string): Promise<YouTubeSignals> {
    const session = this.requireSession(sessionId);
    if (!session.scopes.includes(YOUTUBE_READONLY_SCOPE)) throw new Error('YouTube access has not been granted.');
    const token = await this.accessToken(sessionId, session);
    const headers = { Authorization: `Bearer ${token}` };
    const activity = await this.googleJson(`${YOUTUBE_ENDPOINT}/activities?part=snippet,contentDetails&mine=true&maxResults=50`, headers);
    const subscriptions = await this.googleJson(`${YOUTUBE_ENDPOINT}/subscriptions?part=snippet&mine=true&maxResults=50`, headers).catch(() => ({ items: [] }));
    const items = Array.isArray(activity.items) ? activity.items.map((item: any) => ({
      title: String(item?.snippet?.title ?? '').slice(0, 240),
      channel: String(item?.snippet?.channelTitle ?? '').slice(0, 120),
      publishedAt: typeof item?.snippet?.publishedAt === 'string' ? item.snippet.publishedAt : undefined,
      type: String(item?.snippet?.type ?? 'activity'),
    })).filter((item: { title: string }) => item.title) : [];
    const channelNames: string[] = (Array.isArray(subscriptions.items) ? subscriptions.items : []).map((item: any) => String(item?.snippet?.title ?? '').slice(0, 120)).filter((channel: string) => Boolean(channel));
    const channels: string[] = Array.from(new Set<string>(channelNames)).slice(0, 50);
    return {
      generatedAt: new Date().toISOString(),
      items,
      channels,
      note: 'This is an activity/subscription signal snapshot, not the private YouTube home recommendation feed.',
    };
  }

  private async accessToken(sessionId: string, session: GoogleSession): Promise<string> {
    if (Date.now() < session.expiresAtMs - 60_000) return session.accessToken;
    if (!session.refreshToken) throw new Error('Google session expired. Sign in again.');
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, refresh_token: session.refreshToken, grant_type: 'refresh_token' }),
    });
    if (!response.ok) throw new Error(`Google token refresh failed (${response.status}).`);
    const token = await response.json() as { access_token?: string; expires_in?: number };
    if (!token.access_token) throw new Error('Google token refresh returned no access token.');
    session.accessToken = token.access_token;
    session.expiresAtMs = Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000;
    this.sessions.set(sessionId, session);
    return session.accessToken;
  }

  private requireSession(sessionId: string): GoogleSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Sign in with Google first.');
    return session;
  }

  private async fetchUser(accessToken: string): Promise<{ email?: string; name?: string; picture?: string }> {
    const response = await fetch(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Google profile lookup failed (${response.status}).`);
    return await response.json() as { email?: string; name?: string; picture?: string };
  }

  private async googleJson(url: string, headers: Record<string, string>): Promise<any> {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Google API request failed (${response.status}).`);
    return response.json();
  }
}
