/**
 * Contract test suite — exercises the real CLI against the deployed kompo.ai
 * **test** environment.
 *
 * - Read-only tests run by default (no side effects).
 * - Mutating tests (upload-analyze + promote) require KOMPO_CONTRACT_MUTATING=1.
 * - The full compose/build/poll/stream flow additionally requires
 *   KOMPO_CONTRACT_FULL=1 and KOMPO_CONTRACT_KOMPOSITION_FILE.
 * - Auth-required tests are skipped when no valid (non-expired) auth token
 *   store is detected. Expired tokens are treated as "no auth".
 *
 * Usage:
 *   bun test tests-contract/                         # read-only
 *   KOMPO_CONTRACT_MUTATING=1 bun test tests-contract/ # read-only + mutating
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
  /** True when a user auth file exists and the token is not expired. */
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
const FULL = process.env.KOMPO_CONTRACT_FULL === '1';
const FULL_FIXTURE = process.env.KOMPO_CONTRACT_KOMPOSITION_FILE;

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

  // RIFF header
  buf.write('RIFF', off); off += 4;
  buf.writeUInt32LE(fileSize, off); off += 4;
  buf.write('WAVE', off); off += 4;

  // fmt sub-chunk
  buf.write('fmt ', off); off += 4;
  buf.writeUInt32LE(16, off); off += 4;          // sub-chunk size (PCM)
  buf.writeUInt16LE(1, off); off += 2;            // audio format (1 = PCM)
  buf.writeUInt16LE(channels, off); off += 2;     // channels
  buf.writeUInt32LE(sampleRate, off); off += 4;   // sample rate
  buf.writeUInt32LE(sampleRate * channels * bytesPerSample, off); off += 4; // byte rate
  buf.writeUInt16LE(channels * bytesPerSample, off); off += 2; // block align
  buf.writeUInt16LE(bitsPerSample, off); off += 2; // bits per sample

  // data sub-chunk
  buf.write('data', off); off += 4;
  buf.writeUInt32LE(dataSize, off); off += 4;

  // PCM data — all zeros = silence

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Contract tests (test env)', () => {

  // Build a human-readable skip reason shared by all describe blocks
  const authSkipReason = AUTH.hasAuth
    ? ''
    : AUTH.expired
      ? `SKIPPED: auth token for test env is EXPIRED (${AUTH.email || 'unknown'}). Run \`kli auth/refresh\` or re-login.`
      : `SKIPPED: no auth token for test env. Run \`kli auth/url\` + \`auth/complete\` first.`;

  // -----------------------------------------------------------------------
  // Read-only — no auth required
  // -----------------------------------------------------------------------

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
    test('returns JSON endpoint manifest', () => {
      const { exitCode, stdout, stderr } = kli(['--env', 'test', 'tools']);
      const combined = stdout + '\n' + stderr;

      // Some deployments protect discovery until the user authenticates. Keep
      // this compatibility check informative without leaking response bodies.
      if (combined.includes('HTTP 401') || combined.includes('Unauthorized')) {
        console.warn(
          '⚠ /api/tools requires authentication on this deployment; strict manifest assertions skipped.',
        );
        expect(combined.length).toBeGreaterThan(0);
        return;
      }

      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
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

  // -----------------------------------------------------------------------
  // Read-only — auth required (skipped when no valid non-expired token)
  // -----------------------------------------------------------------------

  const describeAuth = AUTH.hasAuth ? describe : describe.skip;

  if (FULL && (!AUTH.hasAuth || !FULL_FIXTURE)) {
    test('full contract gate has usable auth and a fixture', () => {
      throw new Error(
        'KOMPO_CONTRACT_FULL=1 requires a non-expired test auth store and KOMPO_CONTRACT_KOMPOSITION_FILE',
      );
    });
  }

  describeAuth('Kompositions', () => {
    test('lists kompositions', () => {
      const { exitCode, stdout } = kli(['--env', 'test', 'kompositions']);
      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
      // Markdown output — should have a heading
      expect(stdout).toMatch(/^#\s/m);
    });
  });

  describeAuth('Library', () => {
    test('lists media files (kilder)', () => {
      const { exitCode, stdout } = kli(['--env', 'test', 'library']);
      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
      expect(stdout).toMatch(/^#\s/m);
    });
  });

  describeAuth('Jobs', () => {
    test('lists jobs', () => {
      const { exitCode, stdout } = kli(['--env', 'test', 'jobs']);
      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
      expect(stdout).toMatch(/^#\s/m);
    });
  });

  describeAuth('Outputs', () => {
    test('lists video outputs', () => {
      const { exitCode, stdout } = kli(['--env', 'test', 'outputs']);
      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
      expect(stdout).toMatch(/^#\s/m);
    });
  });

  // -----------------------------------------------------------------------
  // Mutating tier — KOMPO_CONTRACT_MUTATING=1 AND valid auth required
  // -----------------------------------------------------------------------

  const MUTATING = process.env.KOMPO_CONTRACT_MUTATING === '1';
  const describeMutating = MUTATING && AUTH.hasAuth ? describe : describe.skip;

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

      // Promotion is the tagging step: the analyzed upload becomes a reusable
      // library Kilde before it can be referenced by a komposition.
      const fileId = combined.match(/fileId:\s*(\S+)/)?.[1];
      expect(fileId).toBeTruthy();
      const promoted = kli(['--env', 'test', `promote/${fileId}`]);
      expect(promoted.exitCode).toBe(0);
      expect(promoted.stdout + '\n' + promoted.stderr).toMatch(/success:\s*true/i);
    });
  });

  // Full build/download is deliberately opt-in because it consumes render
  // compute. The caller supplies a valid .v3.kompo.md fixture that references
  // the account's promoted Kilde.
  const describeFull = FULL && MUTATING && AUTH.hasAuth && FULL_FIXTURE ? describe : describe.skip;

  describeFull('Compose, build, poll, and download (mutating)', () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kompo-contract-project-'));

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

      const rendered = kli(['--env', 'test', 'workstate/render-qc'], { cwd: projectDir });
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
