/**
 * Tests for CLI command validation (isKnownCommand) — guarantees that
 * unknown commands are rejected BEFORE any token loading or refresh.
 */

import { describe, test, expect } from 'bun:test';
import { isKnownCommand } from '../src/cli';

// ---------------------------------------------------------------------------
// isKnownCommand — validates command names against the known set
// ---------------------------------------------------------------------------

describe('isKnownCommand', () => {
  // Auth commands
  test('auth commands are known', () => {
    expect(isKnownCommand('auth/url')).toBe(true);
    expect(isKnownCommand('auth/complete')).toBe(true);
    expect(isKnownCommand('auth/refresh')).toBe(true);
    expect(isKnownCommand('auth/status')).toBe(true);
  });

  // Public commands
  test('public commands are known', () => {
    expect(isKnownCommand('init')).toBe(true);
    expect(isKnownCommand('health')).toBe(true);
    expect(isKnownCommand('tools')).toBe(true);
    expect(isKnownCommand('incident-download')).toBe(true);
    expect(isKnownCommand('incident-replay')).toBe(true);
    expect(isKnownCommand('help')).toBe(true);
  });

  // Authenticated exact commands
  test('authenticated exact commands are known', () => {
    expect(isKnownCommand('kompositions')).toBe(true);
    expect(isKnownCommand('jobs')).toBe(true);
    expect(isKnownCommand('library')).toBe(true);
    expect(isKnownCommand('staging')).toBe(true);
    expect(isKnownCommand('outputs')).toBe(true);
    expect(isKnownCommand('productions')).toBe(true);
    expect(isKnownCommand('incidents')).toBe(true);
  });

  // Workstate commands
  test('workstate commands are known', () => {
    expect(isKnownCommand('workstate')).toBe(true);
    expect(isKnownCommand('workstate/show')).toBe(true);
    expect(isKnownCommand('workstate/clear')).toBe(true);
    expect(isKnownCommand('workstate/load-file')).toBe(true);
    expect(isKnownCommand('workstate/render')).toBe(true);
    expect(isKnownCommand('workstate/render-qc')).toBe(true);
    expect(isKnownCommand('workstate/open')).toBe(true);
  });

  // Chat commands
  test('chat commands are known', () => {
    expect(isKnownCommand('chat')).toBe(true);
    expect(isKnownCommand('chat-md')).toBe(true);
    expect(isKnownCommand('chat-workstate')).toBe(true);
    expect(isKnownCommand('chat-multimedia')).toBe(true);
  });

  // Prefix commands
  test('prefix commands are known', () => {
    expect(isKnownCommand('kompositions/abc-123')).toBe(true);
    expect(isKnownCommand('jobs/xyz')).toBe(true);
    expect(isKnownCommand('job-status/abc')).toBe(true);
    expect(isKnownCommand('tasks/123')).toBe(true);
    expect(isKnownCommand('promote/id1,id2')).toBe(true);
    expect(isKnownCommand('productions/abc')).toBe(true);
    expect(isKnownCommand('productions/by-komposition/xyz')).toBe(true);
    expect(isKnownCommand('production-stream/abc')).toBe(true);
    expect(isKnownCommand('upload-analyze')).toBe(true);
  });

  // Unknown commands
  test('unknown commands are rejected', () => {
    expect(isKnownCommand('nope')).toBe(false);
    expect(isKnownCommand('')).toBe(false);
    expect(isKnownCommand('unknown-command')).toBe(false);
    expect(isKnownCommand('komposition')).toBe(false); // singular, not valid
    expect(isKnownCommand('auth')).toBe(false);
    expect(isKnownCommand('auth/foo')).toBe(false);
    expect(isKnownCommand('workstate/foo')).toBe(false);
    expect(isKnownCommand('something/entirely/unknown')).toBe(false);
  });

  // Edge cases
  test('edge cases', () => {
    // Empty string
    expect(isKnownCommand('')).toBe(false);
    // Whitespace
    expect(isKnownCommand('  ')).toBe(false);
    // Just a slash
    expect(isKnownCommand('/')).toBe(false);
    // Partial match should not pass (e.g., 'job' vs 'jobs')
    expect(isKnownCommand('job')).toBe(false);
  });
});
