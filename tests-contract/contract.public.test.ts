/**
 * Public contract tests — endpoints that MUST be reachable without
 * authentication. Runs against the deployed kompo.ai **test** environment.
 *
 * These tests need no credentials and always execute in full. A failure here
 * indicates a server-side contract breach — not a missing-login problem.
 *
 * Usage:
 *   bun test tests-contract/contract.public.test.ts
 *   # or via package script:
 *   bun run contract:public
 */

import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dir, '..');
const CLI_ENTRY = 'src/cli.ts';
const PUBLIC_TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'kompo-public-contract-'));
const TOOLS_AUTH_FALLBACK_PHRASE = 'used stored credentials';

/** Spawn the real CLI synchronously. Returns exit code, stdout, and stderr. */
function kli(
  args: string[],
  opts?: { env?: Record<string, string>; cwd?: string },
): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync({
    cmd: ['bun', CLI_ENTRY, ...args],
    cwd: opts?.cwd ?? REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, HOME: PUBLIC_TEST_HOME, ...opts?.env },
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Public contract tests (test env — no auth required)', () => {

  describe('Health', () => {
    test('returns healthy response', () => {
      const { exitCode, stdout } = kli(['--env', 'test', 'health']);
      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
      // The response is markdown/JSON; it should indicate health
      expect(stdout.toLowerCase()).toMatch(/healthy|ok|up|running|status/);
    });
  });

  describe('Tools', () => {
    test('GET /api/tools returns JSON endpoint manifest (MUST be public)', () => {
      const { exitCode, stdout, stderr } = kli(['--env', 'test', 'tools']);

      // The public suite always uses an empty HOME, so a stored local token
      // cannot turn an unauthenticated 401 into a false green result.
      expect(stderr).not.toContain(TOOLS_AUTH_FALLBACK_PHRASE);

      // Public discovery is a non-negotiable contract: /api/tools MUST NOT
      // require authentication. A non-zero exit or 401 here is a server-side
      // bug — the test FAILS loudly so it cannot be mistaken for green coverage.
      if (exitCode !== 0) {
        throw new Error(
          'FAIL: Public discovery contract broken — GET /api/tools failed ' +
          `(exit code ${exitCode}). This endpoint MUST be publicly accessible ` +
          'without authentication. Server-side bug — do NOT "fix" this test.\n' +
          `stderr: ${stderr}`,
        );
      }

      // Guard against 401 being swallowed by the CLI and producing a zero
      // exit with error text on stdout.
      const combined = stdout + '\n' + stderr;
      if (combined.includes('401') || combined.includes('Unauthorized')) {
        throw new Error(
          'FAIL: Public discovery contract broken — GET /api/tools returned ' +
          'HTTP 401. This endpoint MUST be publicly accessible without ' +
          'authentication. Server-side bug — do NOT "fix" this test.\n' +
          `stdout: ${stdout}\nstderr: ${stderr}`,
        );
      }

      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);

      // Must be valid JSON
      let parsed: unknown;
      expect(() => { parsed = JSON.parse(stdout); }).not.toThrow();
      expect(parsed).toBeDefined();
    });
  });

  describe('Bogus env contract', () => {
    test('exits 1 with error message for unknown env', () => {
      const { exitCode, stdout, stderr } = kli(['--env', 'bogus', 'health']);
      expect(exitCode).toBe(1);
      const output = stdout + stderr;
      expect(output).toMatch(/Unknown env/i);
    });
  });
});
