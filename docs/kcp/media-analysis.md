# Media Analysis (BPM, Beat Grid, MusicDNA)

After uploading an audio file (see [file-management](file-management.md)), request analysis
to extract BPM, a beat/downbeat grid, and segment structure. This is the "Analyze & tag" step —
its output feeds directly into [komposition-format](komposition-format.md) beat timing.

## Trigger analysis

Analysis is submitted automatically when you complete an audio upload via `kli upload-analyze
<path>` (audio files only — `.mp3`, `.wav`, `.flac`, `.aac`, `.ogg`, `.m4a`). If you upload
through the raw `POST /api/upload/complete` endpoint directly instead of the CLI shortcut,
confirm with the response or by polling the analysis endpoint below whether a job was submitted
automatically for that content type.

## Poll for results

```
GET /api/multimedia/{fileId}/analysis
Authorization: Bearer <token>
Accept: application/json
```

**Analysis is complete when the response includes a populated `analyzedAt` timestamp and a
finite `bpm`.** There is no separate job/status field on this resource — poll this endpoint
directly (every 5s is reasonable) until `analyzedAt` is present, or timeout after a few minutes.

### Real response shape (verified against a live deployment — flat, no wrapper object)

```json
{
  "fileId": "ab87f27d-62df-433a-a86d-8d31e607208a",
  "bpm": 144.25,
  "confidence": "MEDIUM",
  "method": "windowed-consensus-q2q3",
  "beatCount": 567,
  "beats": [140, 557, 975, "..."],
  "downbeats": [140, 1810, 3480, "..."],
  "beat1Ms": 140,
  "durationMs": 237672,
  "segments": ["..."],
  "analyzedAt": "2026-07-12T10:30:00.000Z",
  "audioUrl": "...",
  "backends": ["..."],
  "fusedSegments": ["..."],
  "perBeatSignals": ["..."],
  "summary": "...",
  "userBoundaries": ["..."]
}
```

**There is no `musicDNA` wrapper, no `analysisJob` object, and no `status` field on this
resource.** Read fields directly off the top-level response.

### Field reference

| Field | Meaning |
|-------|---------|
| `bpm` | Detected tempo. Use this for the komposition's `## Metadata / - BPM` field. |
| `confidence` | `LOW`/`MEDIUM`/`HIGH` — how confident the detector is, not a pass/fail gate. |
| `method` | Which detection algorithm/backend produced this result (informational — different tracks may use different methods; do not branch logic on this value). |
| `beats` | Array of beat positions in **milliseconds** from track start. |
| `downbeats` | Subset of beats marking bar/measure starts (milliseconds). Use as the beat grid for phrase-aligned composition. |
| `beat1Ms` | Position of the first detected beat, in milliseconds — effectively the track's rhythmic start offset (not necessarily 0 if there's a silent intro). |
| `durationMs` | Full track duration in milliseconds. |
| `segments` | Structural segments (verse/chorus-style boundaries), if detected. |
| `analyzedAt` | ISO timestamp — **presence of this field is the completion signal.** |

### Cross-checking BPM (optional but recommended for critical timing)

The scalar `bpm` field can occasionally disagree with the track's own `beats` array on
difficult material. A cheap sanity check: compute the median inter-beat interval from `beats`
and derive `60000 / medianIntervalMs` as a secondary BPM estimate. If it disagrees with the
scalar `bpm` by more than the two obvious explanations — a 2x/0.5x octave difference, or a 2:3
meter relationship — treat the result as low-confidence regardless of what `confidence` says,
and consider re-uploading or manually verifying the tempo before building a beat-critical
komposition.

## Using the result in a komposition

A komposition has **one BPM for the whole document** (see [komposition-format](komposition-format.md)) —
every track's beat positions are converted to time using that single value, not each source's
own measured tempo. If you're composing multiple audio kilder with different measured BPMs,
either pick one as the komposition's declared BPM and manually adjust the other tracks' beat
counts to compensate, or keep tracks close in tempo to avoid silent timing drift.
