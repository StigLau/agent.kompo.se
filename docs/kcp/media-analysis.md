# Media Analysis (BPM, Beat Grid, MusicDNA)

After uploading an audio file (see [file-management](file-management.md)), request analysis
to extract BPM, a beat/downbeat grid, and segment structure. This is the "Analyze & tag" step —
its output feeds directly into [komposition-format](komposition-format.md) beat timing.

> **Read [source-metadata-approach](source-metadata-approach.md) first.** This unit is the
> endpoint contract — what the API returns and how to poll it. That unit is the approach:
> why the **grid** rather than the scalar `bpm` is the product, how to sanity-check a tempo
> estimate, why a grid is only valid for one exact audio file, and why naming segments is
> part of this step rather than an afterthought.

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
| `downbeats` | **The bar grid** — the subset of beats marking bar/measure starts, in milliseconds. This is what you place segments against. A bar's position is *read from here*, never derived by multiplying a BPM. |
| `beats` | Array of beat positions in **milliseconds** from track start. The full grid; `downbeats` is its bar-start subset. |
| `bpm` | Detected tempo — a **label**, not the grid. Use it for the komposition's `## Metadata / - BPM` field and for sanity checks; do not use it to compute where anything is. |
| `confidence` | `LOW`/`MEDIUM`/`HIGH` — how confident the detector is, not a pass/fail gate. |
| `method` | Which detection algorithm/backend produced this result (informational — different tracks may use different methods; do not branch logic on this value). |
| `beat1Ms` | Position of the first detected beat, in milliseconds — effectively the track's rhythmic start offset (not necessarily 0 if there's a silent intro). A non-zero value here is exactly why bar positions cannot be multiplied out. |
| `durationMs` | Full track duration in milliseconds. |
| `segments` | Structural segments (verse/chorus-style boundaries), if detected. Machine labels are generic — treat them as the *start* of segment naming, not the end. The names the user gives these sections are the vocabulary they will compose with; capture them onto the kilde ([sources-workflow](sources-workflow.md)). |
| `analyzedAt` | ISO timestamp — **presence of this field is the completion signal.** |

### Cross-checking BPM (do this before any beat-critical work)

The scalar `bpm` field can disagree with the track's own `beats` array on difficult material.
A cheap sanity check: compute the median inter-beat interval from `beats` and derive
`60000 / medianIntervalMs` as a secondary estimate, then compare.

For four-on-the-floor material the correction vocabulary is **2× / 1× / ½× and nothing else**:

- **Agreement, or a clean 2× or 0.5× factor** — usable. Pick the reading that matches the
  bass drum (see [source-metadata-approach](source-metadata-approach.md) for why the bass
  drum first, hi-hats second).
- **Anything else** — the analysis path is broken, regardless of what `confidence` says.
  This is not a metrical ambiguity for the user to arbitrate and not something to split the
  difference on. Re-analyze, or treat the source as unusable for beat-critical work.

Ratios such as 3:2 or 2:3 are **not** valid explanations here — they are musically strange
for this material and treating one as acceptable launders a broken result into a
plausible-looking one.

Material with a 3/8 feel, swing, or live playing needs a different posture entirely — don't
assume machine-made music, and ask the user to describe the structure during acquisition.
See [source-metadata-approach](source-metadata-approach.md).

### A grid is valid for exactly one audio file

Beat and downbeat positions describe **the specific file they were analyzed from**. They are
meaningless against a different remaster, a single edit vs the album version, or a re-upload
or re-encode of the same track — different intro length, different tempo read.

Keep every grid, offset, and segment boundary bound to the `fileId` it came from, and never
reuse one across two file IDs even when it is "the same song". If the audio is re-uploaded,
re-analyze.

## Using the result in a komposition

A komposition has **one BPM for the whole document** (see [komposition-format](komposition-format.md)) —
every track's beat positions are converted to time using that single value, not each source's
own measured tempo.

This is a **current limitation of the V1/V2 format, not the intended model.** The model this
platform is built around is a master tempo with sources at their own native tempos, reconciled
by the system — see [beats-and-bars](beats-and-bars.md). The format does not express that yet:
there is no per-source native-tempo field and no audio time-stretch to master tempo.

Until it does, when composing multiple audio kilder with different measured BPMs you must
either pick one as the document's declared BPM and adjust the other tracks' beat counts to
compensate, or keep tracks close in tempo. Note also that the server declares a
`POST /api/multimedia/beat-segments` operation that resolves a beat-based layout across
**multiple** files against each file's own measured grid — see
[source-metadata-approach](source-metadata-approach.md). It is declared but not yet verified
from this client.
