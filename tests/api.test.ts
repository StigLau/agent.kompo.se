/**
 * Tests for fetchToolsWithFallback decision logic (injected fetchers — no live network).
 */

import { describe, test, expect, mock, spyOn } from 'bun:test';
import { fetchToolsWithFallback } from '../src/api';
import type { FetchToolsDeps } from '../src/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a Response-like object with the minimum surface the helper reads. */
function okRes(data: any): Response {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

function errRes(status: number, body?: string): Response {
  return {
    ok: false,
    status,
    json: async () => {
      throw new Error('not json');
    },
    text: async () => body ?? `error ${status}`,
  } as unknown as Response;
}

function makeDeps(overrides: Partial<FetchToolsDeps> = {}): FetchToolsDeps {
  return {
    fetcher: mock(() => Promise.resolve(okRes({ paths: { '/a': {}, '/b': {} } }))),
    loadToken: mock(() => null),
    stderr: { write: mock(() => {}) },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchToolsWithFallback', () => {
  test('unauthenticated succeeds → returns data, no fallback', async () => {
    const fetcher = mock((_url: string, _init?: RequestInit) =>
      Promise.resolve(okRes({ paths: { '/a': {} } })),
    );
    const deps = makeDeps({ fetcher });

    const result = await fetchToolsWithFallback('https://example.com', 'prod', deps);

    expect(result.data).toEqual({ paths: { '/a': {} } });
    expect(result.usedTokenFallback).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('https://example.com/api/tools');
    // The bootstrap request may carry an abort signal, but never credentials.
    expect((fetcher.mock.calls[0][1] as any)?.headers?.Authorization).toBeUndefined();
  });

  test('401 → token available → retry succeeds → usedTokenFallback=true + note printed', async () => {
    const responses: Response[] = [
      errRes(401),
      okRes({ paths: { '/x': {} } }),
    ];
    const fetcher = mock((_url: string, _init?: RequestInit) => {
      return Promise.resolve(responses.shift()!);
    });
    const loadToken = mock((_env: string) => 'stored-token-123');
    const stderrWrite = mock((_message: string) => {});
    const deps = makeDeps({ fetcher, loadToken, stderr: { write: stderrWrite } });

    const result = await fetchToolsWithFallback('https://example.com', 'prod', deps);

    expect(result.data).toEqual({ paths: { '/x': {} } });
    expect(result.usedTokenFallback).toBe(true);

    // Two calls: first unauthenticated, second with Bearer
    expect(fetcher).toHaveBeenCalledTimes(2);

    // First call — no auth
    expect((fetcher.mock.calls[0][1] as any)?.headers?.Authorization).toBeUndefined();

    // Second call — with Bearer
    expect((fetcher.mock.calls[1][1] as any)?.headers?.Authorization).toBe(
      'Bearer stored-token-123',
    );

    // Note printed
    expect(stderrWrite).toHaveBeenCalledTimes(1);
    expect(stderrWrite.mock.calls[0][0]).toContain('requires login');
    expect(stderrWrite.mock.calls[0][0]).toContain('used stored credentials');
  });

  test('401 → token available → retry also 401 → throws', async () => {
    const responses: Response[] = [errRes(401), errRes(401, 'still denied')];
    const fetcher = mock(() => Promise.resolve(responses.shift()!));
    const loadToken = mock(() => 'stale-token');
    const deps = makeDeps({ fetcher, loadToken });

    await expect(
      fetchToolsWithFallback('https://example.com', 'prod', deps),
    ).rejects.toThrow(/even with stored credentials/);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test('401 → no token → throws with authentication guidance', async () => {
    const fetcher = mock((_url: string, _init?: RequestInit) => Promise.resolve(errRes(401)));
    const loadToken = mock((_env: string) => null);
    const deps = makeDeps({ fetcher, loadToken });

    await expect(
      fetchToolsWithFallback('https://example.com', 'prod', deps),
    ).rejects.toThrow(/401.*no stored credentials/);

    expect(loadToken).toHaveBeenCalledTimes(1);
    expect(loadToken).toHaveBeenCalledWith('prod');
    expect(fetcher).toHaveBeenCalledTimes(1); // no retry
  });

  test('non-401 error (e.g. 503) → throws immediately, no token fallback attempted', async () => {
    const fetcher = mock((_url: string, _init?: RequestInit) =>
      Promise.resolve(errRes(503, 'Service Unavailable')),
    );
    const loadToken = mock((_env: string) => 'some-token');
    const deps = makeDeps({ fetcher, loadToken });

    await expect(
      fetchToolsWithFallback('https://example.com', 'prod', deps),
    ).rejects.toThrow(/503/);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(loadToken).not.toHaveBeenCalled(); // no token check for non-401
  });

  test('network error (fetch throws) → propagates', async () => {
    const fetcher = mock((_url: string, _init?: RequestInit) =>
      Promise.reject(new Error('ECONNREFUSED')),
    );
    const deps = makeDeps({ fetcher });

    await expect(
      fetchToolsWithFallback('https://example.com', 'prod', deps),
    ).rejects.toThrow('ECONNREFUSED');
  });
});
