/**
 * Tests for KLI argument parsing and env resolution
 */

import { describe, test, expect } from 'bun:test';
import { parseArgs } from '../src/cli';
import { resolveApiUrl, validateEnv } from '../src/api';
import { resolveFrontendOriginForAuth } from '../src/auth';

// ---------------------------------------------------------------------------
// parseArgs — env precedence: --env flag > KOMPO_ENV > default prod
// ---------------------------------------------------------------------------

describe('parseArgs', () => {

  test('default env is prod', () => {
    delete process.env.KOMPO_ENV;
    const { env } = parseArgs(['health']);
    expect(env).toBe('prod');
  });

  test('KOMPO_ENV env var overrides default', () => {
    process.env.KOMPO_ENV = 'test';
    const { env } = parseArgs(['health']);
    expect(env).toBe('test');
  });

  test('--env flag overrides KOMPO_ENV', () => {
    process.env.KOMPO_ENV = 'test';
    const { env } = parseArgs(['--env', 'sandbox-use2', 'health']);
    expect(env).toBe('sandbox-use2');
  });

  test('--env flag works without KOMPO_ENV', () => {
    delete process.env.KOMPO_ENV;
    const { env } = parseArgs(['--env', 'sandbox-eun1', 'kompositions']);
    expect(env).toBe('sandbox-eun1');
  });

  test('extracts command and args', () => {
    delete process.env.KOMPO_ENV;
    const { env, command, cmdArgs } = parseArgs(['kompositions/abc123']);
    expect(env).toBe('prod');
    expect(command).toBe('kompositions/abc123');
    expect(cmdArgs).toEqual([]);
  });

  test('command with args', () => {
    delete process.env.KOMPO_ENV;
    const { command, cmdArgs } = parseArgs(['--env', 'test', 'chat', '"hello world"']);
    expect(command).toBe('chat');
    expect(cmdArgs).toEqual(['"hello world"']);
  });

  test('no args returns empty command', () => {
    const { command, cmdArgs } = parseArgs([]);
    expect(command).toBe('');
    expect(cmdArgs).toEqual([]);
  });

  test('--env flag position is flexible', () => {
    // Should find --env anywhere it appears
    process.env.KOMPO_ENV = 'prod';
    const { env, command } = parseArgs(['--env', 'test', 'auth/url']);
    expect(env).toBe('test');
    expect(command).toBe('auth/url');
  });
});

// ---------------------------------------------------------------------------
// resolveApiUrl
// ---------------------------------------------------------------------------

describe('resolveApiUrl', () => {
  test('prod', () => {
    expect(resolveApiUrl('prod')).toBe('https://ai.makeshitapp.com');
  });

  test('test', () => {
    expect(resolveApiUrl('test')).toBe('https://api.test.ai.makeshitapp.com');
  });

  test('sandbox-use2', () => {
    expect(resolveApiUrl('sandbox-use2')).toBe('https://use2.sandbox.makeshitapp.com');
  });

  test('sandbox-eun1', () => {
    expect(resolveApiUrl('sandbox-eun1')).toBe('https://eun1.sandbox.makeshitapp.com');
  });

  test('unknown env falls back to pattern', () => {
    const url = resolveApiUrl('custom-env');
    expect(url).toContain('api.custom-env.ai.makeshitapp.com');
  });
});

// ---------------------------------------------------------------------------
// validateEnv
// ---------------------------------------------------------------------------

describe('validateEnv', () => {
  test('all four known envs are accepted', () => {
    expect(validateEnv('prod')).toBeNull();
    expect(validateEnv('test')).toBeNull();
    expect(validateEnv('sandbox-use2')).toBeNull();
    expect(validateEnv('sandbox-eun1')).toBeNull();
  });

  test('unknown env returns error message', () => {
    const err = validateEnv('bogus');
    expect(err).not.toBeNull();
    expect(err!).toContain("Unknown env 'bogus'");
    expect(err!).toContain('expected one of:');
    expect(err!).toContain('prod');
    expect(err!).toContain('test');
    expect(err!).toContain('sandbox-use2');
    expect(err!).toContain('sandbox-eun1');
  });

  test('empty string is rejected', () => {
    const err = validateEnv('');
    expect(err).not.toBeNull();
    expect(err!).toContain("Unknown env ''");
  });
});

// ---------------------------------------------------------------------------
// resolveFrontendOriginForAuth
// ---------------------------------------------------------------------------

describe('resolveFrontendOriginForAuth', () => {
  test('known envs', () => {
    expect(resolveFrontendOriginForAuth('prod')).toBe('https://ai.makeshitapp.com');
    expect(resolveFrontendOriginForAuth('test')).toBe('https://test.ai.makeshitapp.com');
    expect(resolveFrontendOriginForAuth('sandbox-use2')).toBe(
      'https://use2.sandbox.makeshitapp.com',
    );
  });

  test('unknown env throws', () => {
    expect(() => resolveFrontendOriginForAuth('unknown-env')).toThrow(
      /Unknown env.*unknown-env/,
    );
  });
});
