/**
 * Authenticated contract gate — exercises the real CLI against the deployed
 * kompo.ai **test** environment for endpoints that require a login.
 *
 * ── CRITICAL: gate-not-run behaviour ──
 * When no valid (non-expired) auth token store is detected, this file
 * prints a clear "GATE DID NOT RUN" message and exits non-zero. Silent
 * green skips are the bug we are removing — a missing-credentials result
 * must be impossible to mistake for full coverage.
 *
 * Usage:
 *   bun test tests-contract/contract.auth.test.ts
 *   # or via package script:
 *   bun run contract:auth
 *
 * Auth-required tests run unconditionally (never skipped) because the
 * gate check above guarantees credentials are present before the suite
 * is reached.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Paths & helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dir, '..');
const CLI_ENTRY = 'src/cli.ts';

/** Spawn the real CLI synchronously. */
function kli(
  args: string[],
  opts?: { env?: Record<string, string>; cwd?: string },
): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync({
    cmd: ['bun', CLI_ENTRY, ...args],
    cwd: opts?.cwd ?? REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
    env: opts?.env ? { ...process.env, ...opts.env } : process.env,
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
  };
}

// ---------------------------------------------------------------------------
// Auth detection (synchronous at module load — runs once)
// ---------------------------------------------------------------------------

interface AuthInfo {
  hasAuth: boolean;
  email: string;
  sourceLine: string;
  expired: boolean;
}

function detectAuth(): AuthInfo {
  const result = kli(['--env', 'test', 'auth/status']);
  const combined = result.stdout + '\n' + result.stderr;
  const hasTokens = combined.includes('source: user auth');
  const expired = combined.includes('EXPIRED');
  const emailMatch = combined.match(/identity:\s*(.+)/);
  const sourceLineMatch = combined.match(/(source:.*)/);
  return {
    hasAuth: hasTokens && !expired,
    email: emailMatch?.[1]?.trim() || '',
    sourceLine: sourceLineMatch?.[1]?.trim() || '',
    expired,
  };
}

const AUTH = detectAuth();

// ═══════════════════════════════════════════════════════════════════════════
// GATE CHECK — exit non-zero if credentials are missing or expired.
// This runs at module load, before any test is defined.
// ═══════════════════════════════════════════════════════════════════════════

if (!AUTH.hasAuth) {
  const reason = AUTH.expired
    ? `auth token for test env is EXPIRED (${AUTH.email || 'unknown'}). Run \`kli auth/refresh\` or re-login.`
    : 'no auth token for test env. Run `kli auth/url` + `kli auth/complete` first.';
  console.error(`GATE DID NOT RUN: ${reason}`);
  console.error(
    'The authenticated contract gate requires valid credentials. ' +
    'Without them, the gate cannot verify API compatibility — this is a ' +
    'deliberate non-zero exit, not a test failure.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

const FULL = process.env.KOMPO_CONTRACT_FULL === '1';
const FULL_FIXTURE = process.env.KOMPO_CONTRACT_KOMPOSITION_FILE;
const MUTATING = process.env.KOMPO_CONTRACT_MUTATING === '1';

// ---------------------------------------------------------------------------
// WAV generation (pure Bun — no dependencies)
// ---------------------------------------------------------------------------

/** Generate a silent mono 16-bit 44.1kHz WAV file. */
function generateSilentWav(filePath: string, durationSec: number = 0.5): void {
  const sampleRate = 44100;
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * channels * bytesPerSample;
  const fileSize = 36 + dataSize;

  const buf = Buffer.alloc(44 + dataSize);
  let off = 0;

  buf.write('RIFF', off); off += 4;
  buf.writeUInt32LE(fileSize, off); off += 4;
  buf.write('WAVE', off); off += 4;

  buf.write('fmt ', off); off += 4;
  buf.writeUInt32LE(16, off); off += 4;
  buf.writeUInt16LE(1, off); off += 2;
  buf.writeUInt16LE(channels, off); off += 2;
  buf.writeUInt32LE(sampleRate, off); off += 4;
  buf.writeUInt32LE(sampleRate * channels * bytesPerSample, off); off += 4;
  buf.writeUInt16LE(channels * bytesPerSample, off); off += 2;
  buf.writeUInt16LE(bitsPerSample, off); off += 2;

  buf.write('data', off); off += 4;
  buf.writeUInt32LE(dataSize, off); off += 4;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
}

// ---------------------------------------------------------------------------
// Suite — all tests run unconditionally (gate above ensures auth is present)
// ---------------------------------------------------------------------------

describe('Authenticated contract tests (test env)', () => {

  // ── Gate sanity check ──────────────────────────────────────────────

  if (FULL && !FULL_FIXTURE) {
    test('full contract gate has a fixture', () => {
      throw new Error(
        'KOMPO_CONTRACT_FULL=1 requires KOMPO_CONTRACT_KOMPOSITION_FILE to be set',
      );
    });
  }

  // ── Read-only — auth required ──────────────────────────────────────

  describe('Kompositions', () => {
    test('lists kompositions', () => {
      const { exitCode, stdout } = kli(['--env', 'test', 'kompositions']);
      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
      expect(stdout).toMatch(/^#\s/m);
    });
  });

  describe('Library', () => {
    test('lists media files (kilder)', () => {
      const { exitCode, stdout } = kli(['--env', 'test', 'library']);
      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
      expect(stdout).toMatch(/^#\s/m);
    });
  });

  describe('Jobs', () => {
    test('lists jobs (deployed endpoint currently returns JSON despite markdown Accept)', () => {
      const { exitCode, stdout } = kli(['--env', 'test', 'jobs']);
      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
      // `/api/jobs` is a documented JSON exception to the markdown-first surface.
      expect(() => JSON.parse(stdout)).not.toThrow();
    });
  });

  describe('Outputs', () => {
    test('lists video outputs', () => {
      const { exitCode, stdout } = kli(['--env', 'test', 'outputs']);
      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
      expect(stdout).toMatch(/^#\s/m);
    });
  });

  // ── Mutating tier — KOMPO_CONTRACT_MUTATING=1 required ─────────────

  const describeMutating = MUTATING ? describe : describe.skip;

  describeMutating('Upload & analyze (mutating)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kompo-contract-test-'));
    const wavPath = path.join(tmpDir, 'silence.wav');

    beforeAll(() => {
      generateSilentWav(wavPath, 0.5);
    });

    afterAll(() => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    });

    test('upload-analyze a generated silent WAV', () => {
      const { exitCode, stdout, stderr } = kli(
        ['--env', 'test', 'upload-analyze', wavPath],
      );
      const combined = stdout + '\n' + stderr;
      expect(exitCode).toBe(0);
      expect(combined).toMatch(/PASS/);
      expect(combined).toMatch(/fileId:/);

      const fileId = combined.match(/fileId:\s*(\S+)/)?.[1];
      expect(fileId).toBeTruthy();
      const promoted = kli(['--env', 'test', `promote/${fileId}`]);
      expect(promoted.exitCode).toBe(0);
      expect(promoted.stdout + '\n' + promoted.stderr).toMatch(/success:\s*true/i);
    });
  });

  // ── Full tier — KOMPO_CONTRACT_FULL=1 + MUTATING + fixture ─────────

  const describeFull =
    FULL && MUTATING && FULL_FIXTURE ? describe : describe.skip;

  describeFull('Compose, build, poll, and download (mutating)', () => {
    const projectDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kompo-contract-project-'),
    );

    afterAll(() => {
      try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch {}
    });

    test('loads a komposition, renders it, polls completion, and resolves its stream', () => {
      const composed = kli(
        ['--env', 'test', 'workstate/load-file', FULL_FIXTURE!],
        { cwd: projectDir },
      );
      expect(composed.exitCode).toBe(0);
      expect(composed.stdout).toMatch(/Current object|Komposition/i);

      const rendered = kli(['--env', 'test', 'workstate/render-qc'], {
        cwd: projectDir,
      });
      expect(rendered.exitCode).toBe(0);
      expect(rendered.stdout).toMatch(/Job status:\s*SUCCEEDED/i);
      expect(rendered.stdout).toMatch(/Stream URL:\s*\[present\]/i);

      const productionId = rendered.stdout.match(/Production:\s*(\S+)/i)?.[1];
      expect(productionId).toBeTruthy();
      const stream = kli(
        ['--env', 'test', `production-stream/${productionId}`],
        { cwd: projectDir },
      );
      expect(stream.exitCode).toBe(0);
      expect(stream.stdout).toMatch(/Stream URL:/i);
      expect(stream.stdout).not.toMatch(/\[missing\]/i);
    });
  });
});
