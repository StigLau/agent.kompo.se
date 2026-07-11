/**
 * KLI Auth — PKCE paste-back login flow
 *
 * No AWS credentials needed. The user logs in via a browser (on any device),
 * pastes the callback URL, and KLI stores a refreshable token pair in
 * ~/.kompo/auth-<env>.json (0o600).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PKCE_REDIRECT_URI = 'http://localhost:5173/auth/callback';
const PKCE_SCOPES = 'openid email profile';
const PKCE_SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

const AUTH_FRONTEND_ORIGINS: Record<string, string> = {
  test: 'https://test.ai.makeshitapp.com',
  'sandbox-use2': 'https://use2.sandbox.makeshitapp.com',
  'sandbox-eun1': 'https://eun1.sandbox.makeshitapp.com',
  prod: 'https://ai.makeshitapp.com',
};

// Known-good fallback for test env (mirrors lytd-bridge.js DEFAULT_AUTH_DOMAIN/DEFAULT_CLIENT_ID).
const TEST_ENV_AUTH_DEFAULTS = {
  authDomain: 'auth.test.ai.makeshitapp.com',
  clientId: '2261n9cq0iobtpsc735oia84cg',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PkceAuthUrlParams {
  authDomain: string;
  clientId: string;
  state: string;
  challenge: string;
  redirectUri?: string;
  scopes?: string;
}

export interface PkceSession {
  verifier: string;
  state: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Frontend origin resolution
// ---------------------------------------------------------------------------

export function resolveFrontendOriginForAuth(env: string): string {
  const origin = AUTH_FRONTEND_ORIGINS[env];
  if (!origin) {
    throw new Error(
      `Unknown env '${env}' for auth — expected one of: ${Object.keys(AUTH_FRONTEND_ORIGINS).join(', ')}`,
    );
  }
  return origin;
}

/** Resolve the frontend URL for a given env (for health checks, KCP discovery, etc.) */
export function resolveFrontendUrl(env: string): string {
  return resolveFrontendOriginForAuth(env);
}

// ---------------------------------------------------------------------------
// Auth config extraction
// ---------------------------------------------------------------------------

export function extractAuthConfigValue(script: string, key: string): string | null {
  const match = script.match(new RegExp(`${key}:\\s*['"]([^'"]+)['"]`));
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// PKCE crypto helpers
// ---------------------------------------------------------------------------

export function generatePkceVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function deriveCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export function buildPkceAuthUrl(params: PkceAuthUrlParams): string {
  const query = new URLSearchParams({
    client_id: params.clientId,
    response_type: 'code',
    scope: params.scopes || PKCE_SCOPES,
    redirect_uri: params.redirectUri || PKCE_REDIRECT_URI,
    state: params.state,
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
  });
  return `https://${params.authDomain}/oauth2/authorize?${query}`;
}

export function extractAuthCodeFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.includes('code=')) {
    try {
      const url = new URL(trimmed);
      return url.searchParams.get('code');
    } catch {
      const match = trimmed.match(/[?&]code=([^&\s]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    }
  }
  return trimmed;
}

export function extractAuthStateFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.includes('state=')) {
    try {
      const url = new URL(trimmed);
      return url.searchParams.get('state');
    } catch {
      const match = trimmed.match(/[?&]state=([^&\s]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    }
  }
  return null;
}

/**
 * Verify that the state from a pasted callback URL matches the session state.
 * Returns an error message string if verification fails, or null if OK.
 */
export function verifyPkceState(pastedState: string | null, sessionState: string): string | null {
  if (!pastedState) {
    return 'Please paste the full callback URL (it must include the state parameter).';
  }
  if (pastedState !== sessionState) {
    return 'State mismatch — the callback URL does not belong to this login session. Run auth/url again.';
  }
  return null;
}

export function isPkceSessionExpired(
  pkce: Pick<PkceSession, 'createdAt'> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!pkce || !pkce.createdAt) return true;
  return now - pkce.createdAt > PKCE_SESSION_TTL_MS;
}

export function decodeIdTokenEmail(idToken: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
    return payload.email || payload.sub;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function kompoDotDir(): string {
  return path.join(process.env.HOME || os.homedir(), '.kompo');
}

function pkceFilePath(env: string): string {
  return path.join(kompoDotDir(), `pkce-${env}.json`);
}

function authFilePath(env: string): string {
  return path.join(kompoDotDir(), `auth-${env}.json`);
}

function saveJsonSecure(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);

  // Never follow a pre-existing symlink when writing credentials.
  if (fs.existsSync(filePath) && fs.lstatSync(filePath).isSymbolicLink()) {
    throw new Error(`Refusing to write credentials through symlink: ${filePath}`);
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
  // The mode option only applies to new files; enforce it for existing files too.
  fs.chmodSync(filePath, 0o600);
}

function loadJsonIfExists(filePath: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function deleteFileIfExists(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

// ---------------------------------------------------------------------------
// Auth config fetching
// ---------------------------------------------------------------------------

async function fetchAuthConfigForEnv(
  frontendOrigin: string,
  env: string,
): Promise<{ authDomain: string; clientId: string }> {
  try {
    const resp = await fetch(`${frontendOrigin}/auth-config.js`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const script = await resp.text();
    const authDomain = extractAuthConfigValue(script, 'COGNITO_DOMAIN');
    const clientId = extractAuthConfigValue(script, 'COGNITO_CLIENT_ID');
    if (!authDomain || !clientId) throw new Error('missing required auth config keys');
    return { authDomain: authDomain.replace(/^https?:\/\//, ''), clientId };
  } catch (error: any) {
    if (env === 'test') {
      console.error(`WARNING: falling back to built-in test auth config (${error.message})`);
      return { ...TEST_ENV_AUTH_DEFAULTS };
    }
    throw new Error(
      `Could not resolve Cognito config for env '${env}' from ${frontendOrigin}/auth-config.js: ${error.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Auth commands
// ---------------------------------------------------------------------------

export async function cmdAuthUrl(env: string): Promise<void> {
  const frontendOrigin = resolveFrontendOriginForAuth(env);
  const { authDomain, clientId } = await fetchAuthConfigForEnv(frontendOrigin, env);

  const verifier = generatePkceVerifier();
  const challenge = deriveCodeChallenge(verifier);
  const state = crypto.randomBytes(16).toString('hex');
  const createdAt = Date.now();

  saveJsonSecure(pkceFilePath(env), { verifier, state, createdAt } satisfies PkceSession);

  const authUrl = buildPkceAuthUrl({ authDomain, clientId, state, challenge });

  console.log(`# Kompo Login URL (${env})`);
  console.log('');
  console.log(authUrl);
  console.log('');
  console.log('Instructions:');
  console.log(
    '1. Open this URL on any device (e.g. a phone) and log in with your makeshitapp.com account.',
  );
  console.log('2. After login, the browser lands on a broken localhost page — this is expected.');
  console.log('3. Copy the FULL address-bar URL.');
  console.log(`4. Run: kli --env ${env} auth/complete "<pasted-url>"`);
  console.log('');
  console.log('This login session expires in 1 hour.');
}

export async function cmdAuthComplete(env: string, input: string | undefined): Promise<void> {
  if (!input || !input.trim()) {
    console.error('Usage: auth/complete <pasted-callback-url>');
    process.exit(3);
  }

  const pkceFile = pkceFilePath(env);
  const pkce = loadJsonIfExists(pkceFile) as PkceSession | null;
  if (!pkce) {
    console.error(`No pending login session for env '${env}'. Run: auth/url first.`);
    process.exit(1);
  }
  if (isPkceSessionExpired(pkce)) {
    deleteFileIfExists(pkceFile);
    console.error('Login session expired (>1 hour). Run auth/url again.');
    process.exit(1);
  }

  const code = extractAuthCodeFromInput(input);
  if (!code) {
    console.error('Could not extract an authorization code from the input.');
    process.exit(3);
  }

  // Verify PKCE state to prevent login CSRF
  const pastedState = extractAuthStateFromInput(input);
  const stateError = verifyPkceState(pastedState, pkce.state);
  if (stateError) {
    if (pastedState && pastedState !== pkce.state) {
      // State mismatch — delete the PKCE session to prevent reuse
      deleteFileIfExists(pkceFile);
    }
    console.error(stateError);
    process.exit(1);
  }

  const frontendOrigin = resolveFrontendOriginForAuth(env);
  const { authDomain, clientId } = await fetchAuthConfigForEnv(frontendOrigin, env);

  const resp = await fetch(`https://${authDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code: code!,
      redirect_uri: PKCE_REDIRECT_URI,
      code_verifier: pkce.verifier,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    deleteFileIfExists(pkceFile);
    console.error(`Token exchange failed (HTTP ${resp.status}): ${body.slice(0, 200)}`);
    process.exit(1);
  }

  const data = (await resp.json()) as {
    id_token: string;
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  const tokens = {
    idToken: data.id_token,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  saveJsonSecure(authFilePath(env), tokens);
  deleteFileIfExists(pkceFile);

  const email = decodeIdTokenEmail(tokens.idToken);
  console.log(`# Kompo Auth Complete (${env})`);
  console.log('');
  console.log(`- Authenticated as: ${email || '(unknown — could not decode idToken)'}`);
  console.log(`- Token expires: ${new Date(tokens.expiresAt).toISOString()}`);
  console.log(`- Saved to: ~/.kompo/auth-${env}.json`);
}

/** Refresh tokens using the stored refreshToken. Returns the new idToken. Throws on failure. */
export async function cmdAuthRefresh(env: string): Promise<string> {
  const authFile = authFilePath(env);
  const tokens = loadJsonIfExists(authFile);

  if (!tokens?.idToken) {
    throw new Error(`No auth file found for env '${env}'. Run: auth/url + auth/complete first.`);
  }
  if (!tokens.refreshToken) {
    throw new Error(
      `No refreshToken in auth file for env '${env}'. Run: auth/url + auth/complete to re-login.`,
    );
  }

  const frontendOrigin = resolveFrontendOriginForAuth(env);
  const { authDomain, clientId } = await fetchAuthConfigForEnv(frontendOrigin, env);

  const resp = await fetch(`https://${authDomain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: tokens.refreshToken,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token refresh failed (HTTP ${resp.status}): ${body.slice(0, 200)}`);
  }

  const data = (await resp.json()) as {
    id_token: string;
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const newTokens = {
    idToken: data.id_token,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  saveJsonSecure(authFile, newTokens);

  console.log(`# Auth Refresh Complete (${env})`);
  console.log(`- Token expires: ${new Date(newTokens.expiresAt).toISOString()}`);

  return newTokens.idToken;
}

// ---------------------------------------------------------------------------
// Token acquisition (PKCE-only — no Cognito SDK fallback)
// ---------------------------------------------------------------------------

/**
 * Get a valid idToken for the given env.
 * Checks ~/.kompo/auth-<env>.json first; auto-refreshes if expired.
 * If no stored tokens, prints instructions and exits.
 */
export async function getToken(env: string): Promise<string> {
  const authFile = authFilePath(env);
  const tokens = loadJsonIfExists(authFile);

  if (tokens?.idToken) {
    // Not expired (with 30s buffer) — use user token directly
    if (tokens.expiresAt > Date.now() + 30_000) {
      const email = decodeIdTokenEmail(tokens.idToken);
      process.stderr.write(
        `[kli] authenticated as: ${email || '(unknown)'} (user auth, expires ${new Date(tokens.expiresAt).toISOString()})\n`,
      );
      return tokens.idToken;
    }
    // Expired but refreshToken present — try to refresh
    if (tokens.refreshToken) {
      try {
        const newIdToken = await cmdAuthRefresh(env);
        const refreshedTokens = loadJsonIfExists(authFile);
        const email = decodeIdTokenEmail(newIdToken);
        process.stderr.write(
          `[kli] authenticated as: ${email || '(unknown)'} (user auth, expires ${refreshedTokens?.expiresAt ? new Date(refreshedTokens.expiresAt).toISOString() : '?'})\n`,
        );
        return newIdToken;
      } catch (err: any) {
        console.error(`Token refresh failed: ${err.message}`);
        console.error('Run: kli auth/url + auth/complete to re-login.');
        process.exit(1);
      }
    }
  }

  // No tokens at all
  console.error(`No auth tokens found for env '${env}'.`);
  console.error('Run: kli auth/url');
  console.error('Then: kli auth/complete "<pasted-url>"');
  process.exit(1);
}

/**
 * Read the stored idToken for an env without side effects.
 * Does NOT trigger login, refresh, or exit. Returns null if no token file.
 */
export function getStoredIdToken(env: string): string | null {
  const tokens = loadJsonIfExists(authFilePath(env));
  if (!tokens?.idToken) return null;
  return tokens.idToken;
}

/** Return status info for auth/status command */
export function getAuthStatus(env: string): {
  hasTokens: boolean;
  email?: string;
  expiresAt?: number;
  expired: boolean;
} {
  const authFile = authFilePath(env);
  const tokens = loadJsonIfExists(authFile);
  if (!tokens?.idToken) {
    return { hasTokens: false, expired: false };
  }
  const expired = tokens.expiresAt <= Date.now();
  const email = decodeIdTokenEmail(tokens.idToken);
  return {
    hasTokens: true,
    email,
    expiresAt: tokens.expiresAt,
    expired,
  };
}
