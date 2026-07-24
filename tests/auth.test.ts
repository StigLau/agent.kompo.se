/**
 * Tests for KLI auth helpers — PKCE state extraction and verification
 */

import { describe, test, expect } from 'bun:test';
import {
  extractAuthStateFromInput,
  verifyPkceState,
  decodeIdTokenGroups,
  formatRoleInfo,
} from '../src/auth';

// ---------------------------------------------------------------------------
// Test helper — builds a fake (unsigned) JWT with the given payload, matching
// the base64url-decode-the-payload-segment pattern the auth module uses.
// ---------------------------------------------------------------------------

function fakeIdToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

// ---------------------------------------------------------------------------
// extractAuthStateFromInput
// ---------------------------------------------------------------------------

describe('extractAuthStateFromInput', () => {
  test('extracts state from full callback URL', () => {
    const url =
      'http://localhost:5173/auth/callback?code=abc123&state=feedface1234';
    expect(extractAuthStateFromInput(url)).toBe('feedface1234');
  });

  test('extracts state from URL with only state param', () => {
    const url = 'http://localhost:5173/auth/callback?state=deadbeef';
    expect(extractAuthStateFromInput(url)).toBe('deadbeef');
  });

  test('extracts state from malformed URL via regex fallback (no protocol)', () => {
    const url = 'localhost:5173/auth/callback?state=cafebabe&code=xyz';
    expect(extractAuthStateFromInput(url)).toBe('cafebabe');
  });

  test('returns null for URL without state param', () => {
    const url = 'http://localhost:5173/auth/callback?code=abc123';
    expect(extractAuthStateFromInput(url)).toBeNull();
  });

  test('returns null for bare authorization code', () => {
    expect(extractAuthStateFromInput('abc123-def456')).toBeNull();
  });

  test('returns null for empty input', () => {
    expect(extractAuthStateFromInput('')).toBeNull();
  });

  test('returns null for whitespace-only input', () => {
    expect(extractAuthStateFromInput('   ')).toBeNull();
  });

  test('extracts state when it appears before code in query string', () => {
    const url = 'http://localhost:5173/auth/callback?state=1234abcd&code=xyz';
    expect(extractAuthStateFromInput(url)).toBe('1234abcd');
  });

  test('handles URL-encoded state values', () => {
    const url =
      'http://localhost:5173/auth/callback?state=hello%20world&code=abc';
    expect(extractAuthStateFromInput(url)).toBe('hello world');
  });

  test('returns null for random non-URL text', () => {
    expect(extractAuthStateFromInput('just some random text')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// verifyPkceState
// ---------------------------------------------------------------------------

describe('verifyPkceState', () => {
  test('returns null for matching state', () => {
    expect(verifyPkceState('abc123', 'abc123')).toBeNull();
  });

  test('returns error for mismatching state', () => {
    const err = verifyPkceState('badstate', 'goodstate');
    expect(err).not.toBeNull();
    expect(err!).toContain('State mismatch');
  });

  test('returns bare-code error for null pasted state', () => {
    const err = verifyPkceState(null, 'session123');
    expect(err).not.toBeNull();
    expect(err!).toContain('full callback URL');
  });
});

// ---------------------------------------------------------------------------
// decodeIdTokenGroups
// ---------------------------------------------------------------------------

describe('decodeIdTokenGroups', () => {
  test('decodes a single-group array claim', () => {
    const token = fakeIdToken({ 'cognito:groups': ['viewer'] });
    expect(decodeIdTokenGroups(token)).toEqual(['viewer']);
  });

  test('decodes a multi-group array claim', () => {
    const token = fakeIdToken({ 'cognito:groups': ['producer', 'viewer'] });
    expect(decodeIdTokenGroups(token)).toEqual(['producer', 'viewer']);
  });

  test('decodes a comma-separated string claim', () => {
    const token = fakeIdToken({ 'cognito:groups': 'producer,viewer' });
    expect(decodeIdTokenGroups(token)).toEqual(['producer', 'viewer']);
  });

  test('decodes a single-value string claim', () => {
    const token = fakeIdToken({ 'cognito:groups': 'viewer' });
    expect(decodeIdTokenGroups(token)).toEqual(['viewer']);
  });

  test('returns empty array when the claim is absent', () => {
    const token = fakeIdToken({ email: 'user@example.com' });
    expect(decodeIdTokenGroups(token)).toEqual([]);
  });

  test('returns empty array for an unparseable token', () => {
    expect(decodeIdTokenGroups('not-a-jwt')).toEqual([]);
  });

  test('returns empty array for an unexpected claim shape', () => {
    const token = fakeIdToken({ 'cognito:groups': 42 });
    expect(decodeIdTokenGroups(token)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// formatRoleInfo
// ---------------------------------------------------------------------------

describe('formatRoleInfo', () => {
  test('formats a single role, no warning for producer', () => {
    const lines = formatRoleInfo(['producer']);
    expect(lines).toEqual(['- Role: producer']);
  });

  test('formats multiple roles', () => {
    const lines = formatRoleInfo(['producer', 'viewer']);
    expect(lines[0]).toBe('- Roles: producer, viewer');
  });

  test('warns when producer is absent', () => {
    const lines = formatRoleInfo(['viewer']);
    expect(lines[0]).toBe('- Role: viewer');
    expect(lines[1]).toContain('producer role');
  });

  test('does not warn for admin (inherits producer)', () => {
    const lines = formatRoleInfo(['admin']);
    expect(lines.length).toBe(1);
  });

  test('is case-insensitive when checking for producer/admin', () => {
    const lines = formatRoleInfo(['Producer']);
    expect(lines.length).toBe(1);
  });

  test('warns and reports "(none)" when there are no groups at all', () => {
    const lines = formatRoleInfo([]);
    expect(lines[0]).toBe('- Roles: (none)');
    expect(lines[1]).toContain('producer role');
  });
});
