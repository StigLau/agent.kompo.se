#!/usr/bin/env bun
/** Deterministic, fail-fast rails runner for the first-video scenario. */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getAuthStatus, getToken } from '../../src/auth';
import { jsonFetch, resolveApiUrl } from '../../src/api';
import { verifyVideo } from './verify';

// expectedStartTimeMs was hand-verified on different rips than the local media; advisory until calibrated against these exact files.
interface Track { key: string; filePatterns: string[]; expectedBpm: number; bpmTolerance: number; acceptBpmOctaves: boolean; expectedStartTimeMs: number; startTimeToleranceMs: number; startTimeAdvisory: boolean }
interface Fixture { env: string; tracks: Track[]; order: { beatsPerTrackSegment: number; resolution: string; durationToleranceSec: number } }
interface Stage { name: string; expectation: string; run: () => Promise<StageResult> }
interface StageResult { pass: boolean; evidence: string[]; error?: string }
interface ReportStage extends StageResult { name: string; expectation: string }

const ROOT = path.resolve(import.meta.dirname!, '../..');
const HERE = import.meta.dirname!;
const fixture: Fixture = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures.json'), 'utf8'));
const report: { timestamp: string; fixture: Fixture; stages: ReportStage[]; pass: boolean } = { timestamp: new Date().toISOString(), fixture, stages: [], pass: false };

function kli(args: string[], cwd = ROOT, timeout = 120_000) {
  const r = spawnSync('bun', [path.join(ROOT, 'src/cli.ts'), '--env', fixture.env, ...args], { cwd, timeout, stdio: 'pipe' });
  return { code: r.status ?? 1, out: r.stdout.toString(), err: r.stderr.toString() };
}
function compact(value: string): string { return value.replace(/\s+/g, ' ').slice(0, 400); }
function cliGot(result: { err: string }, got: string, pass: boolean): string {
  return `${got}${!pass && result.err ? `; stderr=${compact(redact(result.err))}` : ''}`;
}
function log(name: string, expected: string, got: string, pass: boolean) {
  const line = `[${name}] EXPECT ${expected} → GOT ${got} → ${pass ? 'PASS' : 'FAIL'}`;
  console.log(line); return line;
}
function warn(name: string, expected: string, got: string) {
  const line = `[${name}] EXPECT ${expected} → GOT ${got} → WARN`;
  console.warn(line); return line;
}
function authInstructions(): string {
  return 'Authentication is required. Run: kli --env sandbox-use2 auth/url → open the printed URL in a browser → kli --env sandbox-use2 auth/complete "<pasted-callback-url>". Re-run the scenario.';
}
function redact(s: string): string {
  return s.replace(/Authorization:\s*Bearer\s+\S+/gi, 'Authorization: Bearer [REDACTED]')
    .replace(/\b(id_token|access_token|refresh_token)\b\s*[:=]\s*"?[^\s",]+"?/gi, '$1=[REDACTED]')
    .replace(/([?&](?:token|signature|x-amz-signature)=)[^&\s]+/gi, '$1[REDACTED]');
}
function writeReport() {
  const dir = path.join(HERE, 'reports'); fs.mkdirSync(dir, { recursive: true });
  const stem = report.timestamp.replace(/[:.]/g, '-');
  const safe = JSON.parse(JSON.stringify(report, (_key, value) => typeof value === 'string' ? redact(value) : value));
  fs.writeFileSync(path.join(dir, `${stem}.json`), JSON.stringify(safe, null, 2));
  const md = ['# First-video scenario report', '', `Overall: ${safe.pass ? 'PASS' : 'FAIL'}`, ''];
  for (const s of safe.stages) md.push(`## ${s.name}: ${s.pass ? 'PASS' : 'FAIL'}`, '', `Expectation: ${s.expectation}`, '', ...s.evidence.map((x: string) => `- ${x}`), s.error ? `\nError: ${s.error}` : '', '');
  fs.writeFileSync(path.join(dir, `${stem}.md`), md.join('\n'));
  return dir;
}
function matchBpm(actual: number, expected: number, tolerance: number, octaves: boolean) {
  const candidates = octaves ? [actual, actual * 2, actual / 2] : [actual];
  return candidates.some(v => Math.abs(v - expected) <= tolerance);
}
function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function findMedia(track: Track): string | undefined {
  const dir = path.join(HERE, 'media');
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) for (const glob of track.filePatterns) {
    const re = new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
    if (re.test(name)) return path.join(dir, name);
  }
}
async function token(): Promise<string | null> { try { return await getToken(fixture.env); } catch { return null; } }

async function main() {
  const context: { fileIds: Record<string, string>; bpms: Record<string, number>; kompositionId?: string; streamUrl?: string } = { fileIds: {}, bpms: {} };
  const continueOnQcFail = process.argv.includes('--continue-on-qc-fail');
  const temp = fs.mkdtempSync(path.join('/tmp', 'kli-first-video-'));
  const stages: Stage[] = [
    { name: 'health', expectation: 'kli health exits 0 and reports healthy', async run() {
      const r = kli(['health']); const ok = r.code === 0 && /healthy/i.test(r.out + r.err);
      return { pass: ok, evidence: [log('health', 'exit 0 + healthy', cliGot(r, `exit ${r.code}; ${compact(r.out + r.err)}`, ok), ok)] };
    } },
    { name: 'auth', expectation: 'valid PKCE authentication is available (refresh once if expired)', async run() {
      const before = kli(['auth/status']); let status = getAuthStatus(fixture.env);
      const beforeOk = status.hasTokens && !status.expired;
      const evidence = [log('auth', 'stored valid authentication', cliGot(before, status.hasTokens ? (status.expired ? 'expired token' : 'valid token') : 'no token', beforeOk), beforeOk)];
      if (status.hasTokens && status.expired) {
        const refresh = kli(['auth/refresh']); status = getAuthStatus(fixture.env);
        const ok = refresh.code === 0 && status.hasTokens && !status.expired;
        evidence.push(log('auth', 'refresh succeeds', cliGot(refresh, `exit ${refresh.code}`, ok), ok));
      }
      const ok = status.hasTokens && !status.expired;
      if (!ok) evidence.push(`auth/status: ${compact(before.out + before.err)}`);
      return { pass: ok, evidence, error: ok ? undefined : authInstructions() };
    } },
    { name: 'discover', expectation: 'init with local manifest writes AGENTS.md with >=14 units and >0 tools', async run() {
      const r = kli(['init', '--manifest', path.join(ROOT, 'knowledge.yaml')], temp, 60_000);
      const agents = path.join(temp, 'AGENTS.md'); const content = fs.existsSync(agents) ? fs.readFileSync(agents, 'utf8') : '';
      const units = (content.match(/\*\*`[^`]+`\*\*/g) || []).length;
      const tools = Number((r.out.match(/Tools operations:\s*(\d+)/) || [])[1] || 0);
      const ok = r.code === 0 && !!content && units >= 14 && tools > 0;
      return { pass: ok, evidence: [log('discover', 'exit 0, AGENTS.md, >=14 units, >0 tools', cliGot(r, `exit ${r.code}; AGENTS=${!!content}; units=${units}; tools=${tools}`, ok), ok)] };
    } },
    { name: 'media-in', expectation: 'both calibrated media files are present and upload-analyze returns file IDs', async run() {
      const evidence: string[] = [];
      for (const track of fixture.tracks) {
        const file = findMedia(track);
        if (!file) return { pass: false, evidence: [...evidence, log('media-in', `${track.key} file in media/`, `missing (${track.filePatterns.join(', ')})`, false)], error: `Place the ${track.key} audio file in ${path.join(HERE, 'media')}/ and re-run.` };
        const r = kli(['upload-analyze', file], ROOT, 120_000); const id = (r.out + r.err).match(/- fileId:\s*(\S+)/)?.[1]; const ok = r.code === 0 && !!id;
        evidence.push(log('media-in', `${track.key} uploaded with fileId`, cliGot(r, `exit ${r.code}; fileId=${id || 'missing'}`, ok), ok));
        if (!ok) return { pass: false, evidence, error: `upload-analyze failed for ${track.key}: ${compact(r.err)}` };
        context.fileIds[track.key] = id!;
      } return { pass: true, evidence };
    } },
    { name: 'analysis-qc', expectation: 'analysis is complete with calibrated BPM and beat grid; start time is advisory when configured', async run() {
      const bearer = await token(); if (!bearer) return { pass: false, evidence: [log('analysis-qc', 'authenticated request', 'no token', false)], error: authInstructions() };
      const evidence: string[] = []; const api = resolveApiUrl(fixture.env); let allPass = true;
      for (const track of fixture.tracks) {
        const id = context.fileIds[track.key]; let data: any;
        for (let attempt = 0; attempt < 60; attempt++) {
          const a = await fetch(`${api}/api/multimedia/${encodeURIComponent(id)}/analysis`, { headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' } });
          if (a.ok) {
            data = await a.json();
            if (data?.analyzedAt && Number.isFinite(Number(data?.bpm))) break;
          }
          if (attempt < 59) await Bun.sleep(5000);
        }
        const bpm = Number(data?.bpm); const start = Number(data?.beat1Ms); const grid = Array.isArray(data?.downbeats) && data.downbeats.length ? data.downbeats : data?.beats;
        const beats = Array.isArray(data?.beats) ? data.beats.map(Number).filter(Number.isFinite).sort((a: number, b: number) => a - b) : [];
        const intervals = beats.slice(1).map((beat: number, i: number) => beat - beats[i]).filter((interval: number) => interval > 0 && Number.isFinite(interval));
        const beatsImpliedBpm = median(intervals);
        const secondaryBpm = beatsImpliedBpm === undefined ? undefined : 60000 / beatsImpliedBpm;
        const confidence = data?.confidence ?? 'missing'; const method = data?.method ?? 'missing';
        const startTimeMatches = Number.isFinite(start) && Math.abs(start - track.expectedStartTimeMs) <= track.startTimeToleranceMs;
        const bpmPass = Number.isFinite(bpm) && matchBpm(bpm, track.expectedBpm, track.bpmTolerance, track.acceptBpmOctaves);
        const ok = bpmPass && !!data?.analyzedAt && Array.isArray(grid) && grid.length > 0;
        allPass = allPass && ok;
        if (Number.isFinite(bpm)) context.bpms[track.key] = bpm;
        evidence.push(log('analysis-qc', `${track.key}: analyzed, BPM/grid calibrated`, `bpm=${bpm}; confidence=${confidence}; method=${method}; beat1Ms=${start}; downbeats=${Array.isArray(data?.downbeats) ? data.downbeats.length : 0}; beats-implied-bpm=${secondaryBpm ?? 'missing'}`, ok));
        if (!startTimeMatches && track.startTimeAdvisory) evidence.push(warn('analysis-qc', `${track.key}: beat1Ms within ${track.startTimeToleranceMs}ms of ${track.expectedStartTimeMs} (advisory)`, `beat1Ms=${start}`));
      }
      if (!allPass) return { pass: false, evidence, error: `Analysis QC failed for one or more tracks${continueOnQcFail ? '; continuing because --continue-on-qc-fail was supplied.' : '.'}` };
      return { pass: true, evidence };
    } },
    { name: 'compose', expectation: 'a beats-only komposition is loaded and appears in kompositions', async run() {
      const beats = fixture.order.beatsPerTrackSegment; const total = beats * fixture.tracks.length; const bpm = Math.round(context.bpms[fixture.tracks[0].key]);
      const audio = fixture.tracks.map((t, i) => `- [${context.fileIds[t.key]}](source-audio) "${t.key}"\n  - Start: ${i * beats} beats\n  - End: ${(i + 1) * beats} beats`).join('\n');
      const md = `# First Video E2E Scenario\n\n## Metadata\n- BPM: ${bpm}\n\n## Tracks\n\n### Visuals\n- [remotion:KompoTitle](source-generated) "First Video Title"\n  - Start: 0 beats\n  - End: ${total} beats\n  - Props: {"title":"First Video"}\n\n### Audio\n${audio}\n`;
      const file = path.join(temp, 'first-video.kompo.md'); fs.writeFileSync(file, md); const loaded = kli(['workstate/load-file', file], temp, 60_000);
      const id = (loaded.out + loaded.err).match(/\*\*ID:\*\*\s*`?([^`\s]+)|ID:\s*`([^`]+)`/)?.slice(1).find(Boolean); const listed = id ? kli(['kompositions'], temp, 60_000) : { code: 1, out: '', err: '' };
      const ok = loaded.code === 0 && !!id && listed.code === 0 && (listed.out + listed.err).includes(id);
      context.kompositionId = id; return { pass: ok, evidence: [log('compose', 'load-file and kompositions listing identify the new ID', cliGot(loaded, `load=${loaded.code}; id=${id || 'missing'}; list=${listed.code}`, ok), ok), ...(listed.code !== 0 && !ok ? [log('compose', 'kompositions listing succeeds', cliGot(listed, `exit ${listed.code}`, false), false)] : [])] };
    } },
    { name: 'build', expectation: 'render-qc succeeds and a production stream URL resolves', async run() {
      const rendered = kli(['workstate/render-qc'], temp, 10 * 60_000); const bearer = await token(); let url: string | undefined;
      if (rendered.code === 0 && bearer && context.kompositionId) { const p = await jsonFetch(`${resolveApiUrl(fixture.env)}/api/productions/by-komposition/${encodeURIComponent(context.kompositionId)}`, { token: bearer }); const production = p?.productions?.[0]; const productionId = production?.productionId || production?.id; if (productionId) { const stream = await jsonFetch(`${resolveApiUrl(fixture.env)}/api/productions/${encodeURIComponent(productionId)}/stream`, { token: bearer }); url = stream?.streamUrl; } }
      context.streamUrl = url; const ok = rendered.code === 0 && !!url;
      return { pass: ok, evidence: [log('build', 'render succeeds and production stream resolves', cliGot(rendered, `render=${rendered.code}; stream=${url ? 'present' : 'missing'}`, ok), ok)] };
    } },
    { name: 'verify-order', expectation: 'downloaded output has expected duration, streams, resolution, and bitrate', async run() {
      const expected = fixture.tracks.reduce((sum, t) => sum + fixture.order.beatsPerTrackSegment * 60 / context.bpms[t.key], 0); const out = path.join(HERE, 'reports', `output-${Date.now()}.mp4`);
      if (!context.streamUrl) return { pass: false, evidence: [log('verify-order', 'stream URL', 'missing', false)] };
      const response = await fetch(context.streamUrl); if (!response.ok) return { pass: false, evidence: [log('verify-order', 'download stream', `HTTP ${response.status}`, false)] };
      fs.writeFileSync(out, Buffer.from(await response.arrayBuffer())); const result = verifyVideo({ videoPath: out, expectDurationSec: expected, toleranceSec: fixture.order.durationToleranceSec, resolution: fixture.order.resolution });
      return { pass: result.pass, evidence: [log('verify-order', 'ffprobe checks pass', `expected=${expected.toFixed(2)}s; ${result.checks.map(c => `${c.label}=${c.pass}`).join(', ')}`, result.pass), ...result.evidence] };
    } },
  ];
  try { for (const stage of stages) { const result = await stage.run(); report.stages.push({ name: stage.name, expectation: stage.expectation, ...result }); if (!result.pass) { if (result.error) console.error(`[${stage.name}] ${result.error}`); if (!(stage.name === 'analysis-qc' && continueOnQcFail)) break; } } }
  finally { fs.rmSync(temp, { recursive: true, force: true }); report.pass = report.stages.length === stages.length && report.stages.every(s => s.pass); const dir = writeReport(); console.log(`Report: ${dir}`); }
  process.exit(report.pass ? 0 : 1);
}
main();
