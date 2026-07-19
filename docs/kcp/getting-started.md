# Getting started: zero to first rendered video

This walkthrough takes you from nothing to a rendered `.mp4`, timed to the measured beat
grid of your own audio, using the `@kompo/kli` CLI. It is written second-person to the
agent driving the CLI — a human is only needed for the one-time login. Prerequisites:
[Bun](https://bun.sh), a kompo.ai account for the authenticated steps (accounts are
invitation-only — see [service-overview](service-overview.md)), and optionally `ffprobe`
(from ffmpeg) if you want to verify the rendered output yourself. For the domain model
behind each step, see [service-overview](service-overview.md); for everything else, start
at [`knowledge.yaml`](/knowledge.yaml).

## 1. Install and health check

Clone and install — the npm package is not published yet, so this is the only path today:

```bash
git clone https://github.com/StigLau/agent.kompo.se.git
cd agent.kompo.se && bun install
```

Check that the API and the KCP discovery chain are both reachable:

```bash
bun src/cli.ts health
```

`health` prints two summaries, reported separately: API availability, and the KCP
discovery chain (whether `knowledge.yaml` was reachable and how many units it declares).
Only an unreachable API is exit-nonzero — a degraded KCP summary means discovery is
incomplete, but the service may still be functional.

## 2. Bootstrap: `kli init`

```bash
bun src/cli.ts init
```

`init` fetches the tools manifest and the knowledge manifest, checks your auth status, and
writes an `AGENTS.md` context file into the current directory — environment, tools
operation count, knowledge unit count, and auth state. It fails closed: if any discovery
step fails (tools manifest, knowledge manifest, or a manifest that parses to 0 units), it
exits non-zero and writes no file. Pass `--allow-partial` to write the context file anyway
with a prominent warning banner. Pass `--manifest <path-or-url>` to point `init` at a local
`knowledge.yaml` or an alternate URL instead of the default published one.

**Ordering nuance:** the tools manifest is contractually a public bootstrap endpoint, so
`init` should work before you log in. If it fails with a 401 on the tools manifest, the
robust move is to authenticate first (step 3) and re-run `init` — treat auth-then-init as
the reliable order.

## 3. Authenticate (human does this once)

```bash
bun src/cli.ts auth/url
```

Open the printed URL in a browser and log in. The browser will land on a broken localhost
page after login — **that is normal**. Copy the *full* address-bar URL, including
`?code=...&state=...`, and paste it back:

```bash
bun src/cli.ts auth/complete "<full-callback-url>"
```

Tokens are stored in `~/.kompo/auth-<env>.json`, mode `0600`, and refresh automatically.
Check `bun src/cli.ts auth/status` at any point to see identity and token expiry.

Common failures and fixes:

- **"No pending login session"** — run `auth/url` first.
- **"Login session expired"** — re-run `auth/url`.
- **"State mismatch"** — you pasted a partial URL; paste the FULL address-bar URL.
- **"Token exchange failed"** — authorization codes are single-use; start over with
  `auth/url`.

PKCE is the only supported auth flow — never attempt to pass credentials directly.

## 4. Upload and analyze your audio

```bash
bun src/cli.ts upload-analyze <path-to-audio-file>
```

Supported formats: WAV, MP3, FLAC, AAC, OGG, M4A. Expected output shape:

```
# upload-analyze

- fileId: <id>
- analysisStatus (response): queued
- analysisJob.jobId: <job-id>
- result: PASS
```

Capture the `fileId` — you need it to reference this audio in your komposition.

## 5. Read the analysis

Analysis runs asynchronously. Poll the authenticated analysis endpoint until it completes:

```
GET /api/multimedia/<fileId>/analysis
Authorization: Bearer <token>
Accept: application/json
```

The response is flat (no wrapper object, no separate job/status field) and carries `bpm`,
`confidence`, `method`, `beat1Ms`, `downbeats` (the beat grid), `beats`, and `analyzedAt`.
Completion criterion: `analyzedAt` is set and `bpm` is finite. A detected BPM at 0.5x or 2x
the tempo you perceive by ear is a normal octave ambiguity, not an error. See
[media-analysis](media-analysis.md) for the full field reference and cross-checking advice.

## 6. Write the komposition

Write a markdown komposition using the **measured** BPM from step 5 — never milliseconds.
Minimal structure:

```markdown
# My First Video

## Metadata
- BPM: <measured-bpm>

## Tracks

### Visuals
- [remotion:KompoTitle](source-generated) "Title card"
  - Start: 0 beats
  - End: 8 beats
  - Props: {"title": "My First Video", "accentColor": "#6366f1"}

### Audio
- [<fileId>](source-audio) "My track"
  - Start: 0 beats
  - End: 32 beats
```

Three rules the platform enforces: use the measured BPM, never milliseconds; one global
BPM governs beat-to-time conversion across *every* track in the document; reference only
`fileId`s you have uploaded (or a `source-generated` Remotion visual where available). See
[komposition-format](komposition-format.md) for the full V1/V2 spec and
[komposition-v3](komposition-v3.md) for layered/z-ordered compositions.

## 7. Build and download

```bash
bun src/cli.ts workstate/load-file <path-to-komposition>.kompo.md
```

Registers the komposition and opens it in your workstate — capture the komposition ID from
the output. Then:

```bash
bun src/cli.ts workstate/render-qc
```

This submits the build job, polls until it reaches a terminal state (`SUCCEEDED` or
`FAILED`), resolves the production, and prints a stream URL. Expect 2-10 minutes depending
on render queue depth. If you need to check progress independently, `kli job-status/<id>`
polls live. Finished outputs are also listable with `kli outputs`.

## 8. Verify (optional but recommended)

Expected duration is `total_beats × 60 / BPM` — compute it, don't hardcode it. If you have
`ffprobe`, check that the output has both a video and an audio stream at the expected
duration and resolution. `scenarios/first-video/verify.ts` in this repo is a ready-made
checker that does exactly this against a downloaded `.mp4`.

## Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| `health` reports the API unreachable | Network issue or outage | Check connectivity, retry after a few minutes |
| `init` or `tools` gets a 401 | Tools manifest should be public; treat as a deployment issue | Authenticate first, then re-run (§2); if it persists, this is a server-side contract failure, not a client bug |
| Analysis never completes | Job still queued, or unsupported audio format | Keep polling for a few minutes; confirm the file is WAV/MP3/FLAC/AAC/OGG/M4A |
| Server rejects the komposition format | Missing section, wrong BPM field, or a `fileId` not yet in your library | Re-check against [komposition-format](komposition-format.md) exactly — no missing sections, valid `fileId`s |
| Build job reaches `FAILED` | Invalid komposition, missing file reference, or a server-side render error | Inspect `kli jobs/<id>` for the error detail |
| `render-qc` times out | Render queue backed up, or job stuck | Check status manually with `kli job-status/<id>`; if still `RUNNING`, wait and retry |

## The reproducible reference

`scenarios/first-video/` in this repository is this exact flow, captured as a deterministic
8-stage rails runner plus an LLM-facing playbook, with machine-checked success criteria
(duration, streams, resolution). Run it to see a known-good execution end to end.
