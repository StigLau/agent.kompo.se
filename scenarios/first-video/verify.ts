#!/usr/bin/env bun
/**
 * verify.ts — ffprobe-based verification of a rendered video file.
 *
 * Usage:
 *   bun scenarios/first-video/verify.ts <video-file> --expect-duration <sec> --tolerance <sec> --resolution 1280x720
 *
 * Also importable by run.ts.
 */

import { spawnSync } from 'child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerifyOptions {
  videoPath: string;
  expectDurationSec: number;
  toleranceSec: number;
  resolution: string; // e.g. "1280x720"
}

export interface VerifyResult {
  pass: boolean;
  checks: CheckResult[];
  evidence: string[];
}

export interface CheckResult {
  label: string;
  pass: boolean;
  expected: string;
  got: string;
}

// ---------------------------------------------------------------------------
// ffprobe helpers
// ---------------------------------------------------------------------------

function ffprobe(filePath: string): Record<string, unknown> | null {
  const result = spawnSync(
    'ffprobe',
    [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );

  if (result.status !== 0) {
    return null;
  }

  try {
    return JSON.parse(result.stdout.toString());
  } catch {
    return null;
  }
}

function getStreams(probe: Record<string, unknown>): Array<Record<string, unknown>> {
  const streams = probe.streams;
  if (!Array.isArray(streams)) return [];
  return streams as Array<Record<string, unknown>>;
}

function hasVideoStream(streams: Array<Record<string, unknown>>): boolean {
  return streams.some(s => s.codec_type === 'video');
}

function hasAudioStream(streams: Array<Record<string, unknown>>): boolean {
  return streams.some(s => s.codec_type === 'audio');
}

function getDurationSec(probe: Record<string, unknown>): number | null {
  const format = probe.format as Record<string, unknown> | undefined;
  if (format?.duration) {
    return parseFloat(String(format.duration));
  }
  // Fallback: use the video stream duration
  for (const s of getStreams(probe)) {
    if (s.codec_type === 'video' && s.duration) {
      return parseFloat(String(s.duration));
    }
  }
  return null;
}

function getResolution(
  streams: Array<Record<string, unknown>>,
): { width: number; height: number } | null {
  for (const s of streams) {
    if (s.codec_type === 'video' && s.width && s.height) {
      return {
        width: Number(s.width),
        height: Number(s.height),
      };
    }
  }
  return null;
}

function getBitrate(probe: Record<string, unknown>): number | null {
  const format = probe.format as Record<string, unknown> | undefined;
  if (format?.bit_rate) {
    return parseInt(String(format.bit_rate), 10);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export function verifyVideo(opts: VerifyOptions): VerifyResult {
  const evidence: string[] = [];
  const checks: CheckResult[] = [];

  // Check ffprobe availability
  const ffCheck = spawnSync('ffprobe', ['-version'], { stdio: 'pipe' });
  if (ffCheck.status !== 0) {
    return {
      pass: false,
      checks: [],
      evidence: ['ffprobe not found on PATH — install ffmpeg (brew install ffmpeg)'],
    };
  }

  // Check file exists
  const { statSync } = require('fs');
  let fileSize = 0;
  try {
    fileSize = statSync(opts.videoPath).size;
  } catch {
    return {
      pass: false,
      checks: [],
      evidence: [`File not found: ${opts.videoPath}`],
    };
  }
  evidence.push(`File: ${opts.videoPath} (${fileSize} bytes)`);

  // Probe
  const probe = ffprobe(opts.videoPath);
  if (!probe) {
    return {
      pass: false,
      checks: [],
      evidence: ['ffprobe failed to parse file — may be corrupt or unsupported format'],
    };
  }

  const streams = getStreams(probe);
  evidence.push(`Streams detected: ${streams.length}`);
  for (const s of streams) {
    evidence.push(
      `  ${s.codec_type || 'unknown'} (${s.codec_name || '?'}): ${s.width || '?'}x${s.height || '?'}`,
    );
  }

  // 1. Duration check
  const actualDuration = getDurationSec(probe);
  if (actualDuration !== null) {
    const diff = Math.abs(actualDuration - opts.expectDurationSec);
    const pass = diff <= opts.toleranceSec;
    checks.push({
      label: 'Duration',
      pass,
      expected: `${opts.expectDurationSec.toFixed(2)}s ±${opts.toleranceSec}s`,
      got: `${actualDuration.toFixed(2)}s (diff ${diff.toFixed(2)}s)`,
    });
  } else {
    checks.push({
      label: 'Duration',
      pass: false,
      expected: `${opts.expectDurationSec.toFixed(2)}s ±${opts.toleranceSec}s`,
      got: 'could not determine',
    });
  }

  // 2. Video stream present
  const hasVideo = hasVideoStream(streams);
  checks.push({
    label: 'Video stream',
    pass: hasVideo,
    expected: 'present',
    got: hasVideo ? 'present' : 'missing',
  });

  // 3. Audio stream present
  const hasAudio = hasAudioStream(streams);
  checks.push({
    label: 'Audio stream',
    pass: hasAudio,
    expected: 'present',
    got: hasAudio ? 'present' : 'missing',
  });

  // 4. Resolution check
  const actualRes = getResolution(streams);
  const [expW, expH] = opts.resolution.split('x').map(Number);
  if (actualRes) {
    const resMatch = actualRes.width === expW && actualRes.height === expH;
    checks.push({
      label: 'Resolution',
      pass: resMatch,
      expected: opts.resolution,
      got: `${actualRes.width}x${actualRes.height}`,
    });
  } else {
    checks.push({
      label: 'Resolution',
      pass: false,
      expected: opts.resolution,
      got: 'could not determine',
    });
  }

  // 5. Nonzero bitrate
  const bitrate = getBitrate(probe);
  if (bitrate !== null) {
    checks.push({
      label: 'Bitrate',
      pass: bitrate > 0,
      expected: '>0',
      got: `${bitrate} bps`,
    });
  } else {
    checks.push({
      label: 'Bitrate',
      pass: false,
      expected: '>0',
      got: 'could not determine',
    });
  }

  const pass = checks.every(c => c.pass);
  return { pass, checks, evidence };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function parseCliVerifyArgs(): VerifyOptions | string {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    return 'Usage: bun verify.ts <video-file> --expect-duration <sec> --tolerance <sec> --resolution 1280x720';
  }

  const videoPath = args[0];
  let expectDurationSec = 0;
  let toleranceSec = 0.5;
  let resolution = '1280x720';

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--expect-duration' && args[i + 1]) {
      expectDurationSec = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--tolerance' && args[i + 1]) {
      toleranceSec = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--resolution' && args[i + 1]) {
      resolution = args[i + 1];
      i++;
    }
  }

  if (!expectDurationSec) {
    return 'Missing --expect-duration <sec>';
  }

  return { videoPath, expectDurationSec, toleranceSec, resolution };
}

// Main
const _g = globalThis as any;
if (
  (_g.Bun && _g.Bun.main === (import.meta as any).path) ||
  (process.argv[1] && process.argv[1].includes('verify.ts'))
) {
  const parsed = parseCliVerifyArgs();
  if (typeof parsed === 'string') {
    console.error(parsed);
    process.exit(2);
  }

  const result = verifyVideo(parsed);

  console.log('# Video Verification');
  console.log('');
  for (const line of result.evidence) {
    console.log(line);
  }
  console.log('');
  console.log('## Checks');
  for (const c of result.checks) {
    const icon = c.pass ? '✅' : '❌';
    console.log(`${icon} ${c.label}: expected ${c.expected}, got ${c.got}`);
  }
  console.log('');
  console.log(`Overall: ${result.pass ? 'PASS' : 'FAIL'}`);

  process.exit(result.pass ? 0 : 1);
}
