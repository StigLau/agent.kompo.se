/**
 * KLI API — HTTP helpers and environment config resolution
 */

// ---------------------------------------------------------------------------
// Environment → API URL mapping
// ---------------------------------------------------------------------------

const ENV_DEFAULTS: Record<string, string> = {
  test: 'https://api.test.ai.makeshitapp.com',
  prod: 'https://api.ai.makeshitapp.com',
  'sandbox-use2': 'https://use2.sandbox.makeshitapp.com',
  'sandbox-eun1': 'https://eun1.sandbox.makeshitapp.com',
};

/**
 * Resolve the API base URL for a given environment name.
 */
export function resolveApiUrl(env: string): string {
  return ENV_DEFAULTS[env] ?? `https://api.${env}.ai.makeshitapp.com`;
}

/**
 * Is the value likely an API Gateway or api.* URL?
 */
export function isLikelyApiUrl(value: string): boolean {
  return value.includes('execute-api.') || value.includes('://api.');
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
      console.error(`HTTP ${res.status}: ${text}`);
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
      console.error(`HTTP ${res.status}: ${text}`);
      process.exit(1);
    }

    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
