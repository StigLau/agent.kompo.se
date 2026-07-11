# PLAYBOOK — First-Video E2E Scenario (LLM-facing)

## Hot path — command sequence

Run these in order. If any step fails, read the matching "If this fails" block
before proceeding. Stop and report if a blocker is reached.

---

### 0. Health check

```bash
bun src/cli.ts --env sandbox-use2 health
```

**Expected output shape:**
```
# Kompo server is healthy
...
# KCP Discovery Chain
- knowledge.yaml: OK (kcp_version: ..., units: 0, updated: ...)
```

The deployed `knowledge.yaml` is a known 0-unit redirect-stub gap (and may be
reported as `DEGRADED` once the pending client fix merges); this does not fail
this step. The real 14-unit manifest arrives via `--manifest` in step 2.

**If this fails:** The sandbox API is unreachable. Check your network, wait a
few minutes, retry. If persistent, stop and report: the API is down.

---

### 1. Authenticate (one-time, human-assisted)

```bash
bun src/cli.ts --env sandbox-use2 auth/status
```

**Expected output shape (unauthenticated):**
```
# Auth Status (sandbox-use2)
- source: none (no user auth file)
- auth file: ~/.kompo/auth-sandbox-use2.json — not found
- Run kli auth/url + auth/complete to log in.
```

If it says `authenticated` with a future expiry, skip to step 2.

**To log in (human must do this once):**
```bash
bun src/cli.ts --env sandbox-use2 auth/url
```
Open the printed URL in a browser, log in. The browser lands on a broken
localhost page — this is normal. Copy the FULL address-bar URL and run:
```bash
bun src/cli.ts --env sandbox-use2 auth/complete "<pasted-url>"
```

**If this fails:**
- "No pending login session" — run auth/url first.
- "Login session expired" — run auth/url again.
- "State mismatch" — paste the FULL URL including `?code=...&state=...`.
- "Token exchange failed" — the authorization code is single-use; start over
  with auth/url.

After login, verify:
```bash
bun src/cli.ts --env sandbox-use2 auth/status
```
Expected: `authenticated as <email>` with a future expiry. Proceed to step 2.

---

### 2. Bootstrap project context (discover)

```bash
bun src/cli.ts --env sandbox-use2 init --manifest <path-to-project-root>/knowledge.yaml
```

**Expected output shape:**
```
✅ AGENTS.md written to .../AGENTS.md

→ Bootstrap summary:
  Environment: sandbox-use2
  Tools operations: 42
  Knowledge units: 14
  Auth: ✅ authenticated as ...
```

**If this fails:**
- If exit code != 0: re-run auth/status to confirm you're still logged in.
- Do not continue with a partial context. The deployed tools endpoint can return
  401 before authentication; this is why discovery follows the auth step. If it
  still fails after authentication, stop and report the failure.

---

### 3. Locate and upload audio tracks

The scenario expects two audio files in `scenarios/first-video/media/`.
Check which files you have:

```bash
ls -la scenarios/first-video/media/
```

For each track defined in `fixtures.json`, find the matching file by the
`filePatterns` glob. Upload each:

```bash
bun src/cli.ts --env sandbox-use2 upload-analyze scenarios/first-video/media/<filename>
```

**Expected output shape:**
```
# upload-analyze

- fileId: <id>
- analysisStatus (response): queued
- analysisJob.jobId: <job-id>
- result: PASS
```

Capture each `fileId` — you will need them for the komposition.

**If this fails:**
- "File not found" — place the audio files in `scenarios/first-video/media/`.
- "presigned-url returned no uploadUrl" — sandbox S3 may be misconfigured;
  stop and report.
- "analysisJob marker not written" — the job may still be queued; wait 20s
  and check with `bun src/cli.ts --env sandbox-use2 job-status/<jobId>`.

---

### 4. Verify analysis results

Poll each analysis job until terminal, then fetch the file's MusicDNA data.
Check that the measured BPM matches the expected value from `fixtures.json`
(within tolerance; accept 0.5x or 2x octave multiples).

```bash
bun src/cli.ts --env sandbox-use2 job-status/<analysis-job-id>
```

**Expected output shape:**
```
# Job <analysis-job-id>
- status: SUCCEEDED
```

Use `fixtures.json` to know the expected values. The rails runner reads the
analysis response and performs the BPM/start-time/grid checks; record a BLOCKED
result instead of inventing a client command if those fields are not exposed.

**Key verification points:**
- BPM within `bpmTolerance` of `expectedBpm` (or 0.5x/2x if `acceptBpmOctaves: true`)
- `start_time`: advisory, WARN only
- Beat grid present in analysis output

**If this fails:**
- BPM wildly off: the file may be a different recording than calibrated.
  Re-verify you have the right file.
- Analysis job FAILED: check job details with
  `bun src/cli.ts --env sandbox-use2 jobs/<jobId>`. The audio file format may
  be unsupported (must be WAV, MP3, FLAC, AAC, OGG, or M4A).

---

### 5. Compose a komposition

Write a komposition markdown file in beats-based format (V1/V2). Use the
measured BPM from step 4 and the fileIds from step 3.

The order is defined in `fixtures.json`: `beatsPerTrackSegment` beats from
each track, sequenced in `tracks` order.

**Minimal komposition structure:**
```markdown
# First Video — E2E Scenario

## Metadata
- BPM: <measured-bpm>

## Tracks

### Audio
- [<fileId1>](source-audio) "track-1-name"
  - Start: 0 beats
  - End: <beatsPerTrackSegment> beats
- [<fileId2>](source-audio) "track-2-name"
  - Start: <beatsPerTrackSegment> beats
  - End: <2*beatsPerTrackSegment> beats

### Visuals
- [remotion:KompoTitle](source-generated) "First Video Title"
  - Start: 0 beats
  - End: <total-beats> beats
  - Props: {"title": "E2E First Video", "accentColor": "#6366f1"}
```

Save it to a temp file (e.g., `first-video.kompo.md`) and load it:

```bash
bun src/cli.ts --env sandbox-use2 workstate/load-file first-video.kompo.md
```

**Expected output shape:**
```
# Muse Workstate

- **Environment:** sandbox-use2
...
## Current Object
- **Type:** komposition
- **Title:** First Video — E2E Scenario
- **ID:** `<komposition-id>`
```

Capture the komposition ID.

**If this fails:**
- "File not found" — check your path.
- HTTP error: check auth/status; you may need to re-authenticate.
- Server rejects format: verify your markdown exactly matches the structure
  above (no missing sections, correct BPM, valid fileIds).

---

### 6. Build (render)

```bash
bun src/cli.ts --env sandbox-use2 workstate/render-qc
```

This command submits a video_build job, polls until terminal (SUCCEEDED or
FAILED), resolves the production, and prints the stream URL.

**Expected output shape:**
```
# Muse Renderability Lock

- Komposition: First Video — E2E Scenario (<id>)
- Job: <job-id>
- Status: PENDING
- Poll: kli --env sandbox-use2 job-status/<job-id>

# Muse Fresh Build QC

- Komposition: First Video — E2E Scenario (<id>)
- Job: <job-id>
- Job status: SUCCEEDED
- Production: <production-id>
- Stream URL: [present]
```

The command may take 2-10 minutes depending on render queue depth.

**If this fails:**
- "No current workstate object" — run workstate/load-file first.
- Job FAILED: check `bun src/cli.ts --env sandbox-use2 jobs/<jobId>` for
  error details. Common causes: missing file references, invalid komposition
  format, server-side render pipeline error.
- Timeout (10 min): the job may be stuck. Check status manually with
  job-status. If still RUNNING, the queue may be backed up — wait and retry.

---

### 7. Verify the output

Download the video and run verification:

```bash
bun scenarios/first-video/verify.ts <downloaded-video.mp4> \
  --expect-duration <computed-seconds> \
  --tolerance 0.5 \
  --resolution 1280x720
```

**Expected output shape:**
```
# Video Verification

File: <path> (<size> bytes)
Streams detected: 2
  video (h264): 1280x720
  audio (aac): ...

## Checks
✅ Duration: expected 14.22s ±0.5s, got 14.25s (diff 0.03s)
✅ Video stream: expected present, got present
✅ Audio stream: expected present, got present
✅ Resolution: expected 1280x720, got 1280x720
✅ Bitrate: expected >0, got 1234567 bps

Overall: PASS
```

The expected duration is computed from the komposition: for each track,
`beats × 60 / measured_bpm`, summed across all tracks. Do NOT hardcode a
number — compute it.

**If this fails:**
- "ffprobe not found" — install ffmpeg: `brew install ffmpeg`
- Duration mismatch: the render may have trimmed or added silence. Small
  differences (<1s) are acceptable; larger ones indicate a build issue.
- Missing streams: check the job output — the render may have failed silently.

## Success criteria

All of these must be true:

1. **8 stages pass**: health, auth, discover, media-in, analysis-qc, compose,
   build, verify-order.
2. **verify.ts reports PASS** on every check: duration, video stream, audio
   stream, resolution, nonzero bitrate.
3. **AGENTS.md** was written by kli init and contains ≥14 knowledge units.
4. **No credentials or tokens** in any report output.

## What NOT to do

- Do NOT use any API endpoints not listed in `docs/kcp/` or `src/commands/`.
- Do NOT hardcode fileIds or BPM values — read them from analysis output.
- Do NOT commit media files or reports — they are gitignored.
- Do NOT use milliseconds in the komposition document — use beats.
- Do NOT attempt credential-based auth — PKCE only.
