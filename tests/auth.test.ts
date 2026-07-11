/**
 * Tests for KLI auth helpers — PKCE state extraction and verification
 */

import { describe, test, expect } from 'bun:test';
import { extractAuthStateFromInput, verifyPkceState } from '../src/auth';

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
