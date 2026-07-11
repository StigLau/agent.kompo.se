/**
 * KLI API — HTTP helpers and environment config resolution
 */

import { getStoredIdToken } from './auth';

// ---------------------------------------------------------------------------
// Environment → API URL mapping
// ---------------------------------------------------------------------------

export const ENV_DEFAULTS: Record<string, string> = {
  test: 'https://api.test.ai.makeshitapp.com',
  prod: 'https://ai.makeshitapp.com',
  'sandbox-use2': 'https://use2.sandbox.makeshitapp.com',
  'sandbox-eun1': 'https://eun1.sandbox.makeshitapp.com',
};

const KNOWN_ENVS = Object.keys(ENV_DEFAULTS);

/**
 * Validate an environment name. Returns an error message string if invalid,
 * or null if valid.
 */
export function validateEnv(env: string): string | null {
  if (!KNOWN_ENVS.includes(env)) {
    return `Unknown env '${env}' — expected one of: ${KNOWN_ENVS.join(', ')}`;
  }
  return null;
}

/**
 * Resolve the API base URL for a given environment name.
 */
export function resolveApiUrl(env: string): string {
  return ENV_DEFAULTS[env] ?? `https://api.${env}.ai.makeshitapp.com`;
}

// ---------------------------------------------------------------------------
// Chat model env override
// ---------------------------------------------------------------------------

export function getChatModel(): string | undefined {
  const value = process.env.CHAT_MODEL?.trim();
  return value ? value : undefined;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/** Truncate a string to maxLen, appending '…' if truncated. */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '…';
}

export async function mdFetch(
  url: string,
  opts?: { method?: string; token?: string; body?: string; timeout?: number },
): Promise<string> {
  const timeout = opts?.timeout ?? 45_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = {
    Accept: 'text/markdown',
  };
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts?.body) headers['Content-Type'] = 'application/json';

  try {
    const res = await fetch(url, {
      method: opts?.method || 'GET',
      headers,
      body: opts?.body,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`HTTP ${res.status}: ${truncate(text, 200)}`);
      process.exit(1);
    }

    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function jsonFetch(
  url: string,
  opts?: { method?: string; token?: string; body?: string; timeout?: number },
): Promise<any> {
  const timeout = opts?.timeout ?? 45_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts?.body) headers['Content-Type'] = 'application/json';

  try {
    const res = await fetch(url, {
      method: opts?.method || 'GET',
      headers,
      body: opts?.body,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`HTTP ${res.status}: ${truncate(text, 200)}`);
      process.exit(1);
    }

    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// /api/tools fetch with 401→token fallback
// ---------------------------------------------------------------------------

export interface FetchToolsDeps {
  fetcher: (url: string, init?: RequestInit) => Promise<Response>;
  loadToken: (env: string) => string | null;
  stderr?: { write: (msg: string) => void };
}

export interface ToolsFetchResult {
  data: any;
  usedTokenFallback: boolean;
}

const TOOLS_AUTH_FALLBACK_NOTE =
  'note: /api/tools requires login on this deployment — used stored credentials.\n';

async function fetchToolsRequest(
  fetcher: FetchToolsDeps['fetcher'],
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch /api/tools with graceful 401→token fallback.
 *
 * 1. Try unauthenticated (intended end state).
 * 2. On 401: load a stored token for the env (read-only, no login, no refresh).
 *    If token → retry with Bearer. If no token → throw.
 *
 * Callers handle the throw: `kli tools` exits 1; `kli init` continues best-effort.
 */
export async function fetchToolsWithFallback(
  apiUrl: string,
  env: string,
  deps?: FetchToolsDeps,
): Promise<ToolsFetchResult> {
  const fetcher = deps?.fetcher ?? fetch;
  const loadToken = deps?.loadToken ?? defaultLoadToken;
  const stderr = deps?.stderr ?? process.stderr;

  // 1. Unauthenticated attempt. Keep bootstrap from hanging forever if the
  // deployment's public discovery endpoint stalls.
  let res = await fetchToolsRequest(fetcher, `${apiUrl}/api/tools`);

  if (res.ok) {
    return { data: await res.json(), usedTokenFallback: false };
  }

  // 2. 401 → try token fallback
  if (res.status === 401) {
    const token = loadToken(env);
    if (token) {
      stderr.write(TOOLS_AUTH_FALLBACK_NOTE);
      res = await fetchToolsRequest(fetcher, `${apiUrl}/api/tools`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        return { data: await res.json(), usedTokenFallback: true };
      }
      // Token retry also failed
      const body = await res.text().catch(() => '');
      throw new Error(
        `/api/tools fetch failed even with stored credentials (HTTP ${res.status}): ${truncate(body, 200)}`,
      );
    }
    // No token available
    throw new Error(
      '/api/tools returned 401 and no stored credentials are available — authenticate first with `kli auth/url` + `kli auth/complete`',
    );
  }

  // 3. Other HTTP error
  const body = await res.text().catch(() => '');
  throw new Error(`/api/tools fetch failed (HTTP ${res.status}): ${truncate(body, 200)}`);
}

/** Default token loader — reads ~/.kompo/auth-<env>.json, returns idToken or null. */
function defaultLoadToken(env: string): string | null {
  return getStoredIdToken(env);
}
