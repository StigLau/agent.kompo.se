# KompoStrict V3 — Layered Compositing Format

V3 is the **layered compositing** format for kompo.ai. It replaces V2's flat track arrays
with an ordered layer stack that has explicit z-index and blend modes — enabling proper
alpha compositing, overlays, and foreground elements.

V3 kompositions can be authored in a human-readable markdown format and are compiled
into a strict JSON schema for the render pipeline.

## JSON Schema

```ts
type KompoStrictV3 = {
  version: 'v3';

  meta: {
    bpm: number;
    meter: string;       // e.g. "4/4"
    width: number;
    height: number;
    fps: number;
    duration_ms: number;
  };

  layers: Array<{
    z: number;           // 0 = bottom (background). Must be unique, consecutive from 0.
    role: 'background' | 'foreground' | 'overlay';
    blend: 'replace' | 'alpha_over';
    clips: Array<{
      source_id: string;
      source_range: { start_ms: number; duration_ms: number };
      timeline_range: { start_ms: number; duration_ms: number };
    }>;
  }>;

  audio_tracks: Array<{
    role: 'music' | 'voiceover' | 'effect';
    gain_db: number;
    clips: Array<{
      source_id: string;
      source_range: { start_ms: number; duration_ms: number };
      timeline_range: { start_ms: number; duration_ms: number };
    }>;
  }>;
};
```

## Layer z-order rules

1. `z` values must be **unique** — no two layers share the same z index.
2. `z` values must be **consecutive starting from 0** — `[0, 1, 2]` is valid; `[0, 2]` or `[1, 2]` are not.
3. `z=0` is always the bottom (background) layer.
4. Higher z = rendered on top.

## Key differences from V2

| Concern | V2 | V3 |
|---------|----|----|
| Visual tracks | `structure.tracks.video[n][]` (flat, track name enum) | `layers[n]` (z-ordered, blend-mode aware) |
| Audio tracks | `structure.tracks.audio[n][]` (track name enum) | `audio_tracks[n]` (role + gain_db) |
| Timing in clips | `TimeValueV2` (ms / beats / beats_global union) | Flat `start_ms` / `duration_ms` numbers |
| Render params | `output: {width, height, fps}` + `timing.sections[0].bpm` | `meta: {bpm, meter, width, height, fps, duration_ms}` |

## V3 Markdown Format

V3 kompositions can be authored and exchanged in a human-readable markdown format.
This is the format agents should write.

> **Author in `beats`, even though the examples below are in seconds.** The `s`/`ms` values
> show the format's full range and make the JSON⇄markdown correspondence legible — they are
> **not** the recommended authoring unit. Write musical positions in beats and bars; see
> [beats-and-bars](beats-and-bars.md).
>
> Write `timeline 0beats-32beats`, not `timeline 0s-16s`, wherever the position is musical.

### Format

```markdown
# Title

## Meta
- bpm: 120
- duration: 48s
- size: 1920x1080@30

## Layer 0: Backgrounds (blend: replace)
- {file:X} timeline 0s-48s source 10s-58s

## Layer 1: Overlays (blend: alpha_over)
- {file:Y} timeline 0s-8s source 0s-8s
- {file:Z} timeline 16s-24s source 0s-8s

## Audio: music (gain: 0dB)
- {file:song1} timeline 0s-24s source 0s-24s
```

### Rules

- **Layers** numbered from 0 (bottom). `z` values must be unique and consecutive.
- **Layer label** (`Backgrounds`, `Overlays`, `Foregrounds`) determines `role`:
  - `Backgrounds` → `background`
  - `Overlays` → `overlay`
  - `Foregrounds` → `foreground`
- **`blend`** must match schema enum: `replace` or `alpha_over`.
- **`timeline`** = output position; **`source`** = slice from source file.
- **Time units** supported in all positions: `beats` (resolved via `meta.bpm` — **prefer this**),
  `s` (seconds), `ms` (milliseconds).
  - The server resolves beats for you: `beats × (60000 / bpm)` = ms. Example: `16beats` at
    bpm=120 → 8000ms.
  - **This formula is documentation of what the server does, not a step for you to perform.**
    Write `16beats` and let it resolve. Writing `8000ms` throws away the musical intent and
    silently bakes in one tempo assumption — see [beats-and-bars](beats-and-bars.md).
- **Audio sections**: `## Audio: <role> (gain: <N>dB)` — role must be `music`, `voiceover`, or `effect`.
- One audio section per track. Multiple tracks allowed; multiple audio tracks are mixed
  together at their specified `gain_db` levels.
- **For a DJ-style crossfade where two songs deliberately play at once, use the
  `## Overlay Segments` construct below rather than overlapping `## Audio` sections.**
- `gain_db` of `0` serializes as `0dB`.
- `{file:X}` references a library file ID (from `GET /api/files/user`).
- `{file:remotion:CompositionId}` references a Remotion composition (rendered on-the-fly).

### Time unit examples

| Input | bpm | Result |
|-------|-----|--------|
| `8s` | any | 8000ms |
| `500ms` | any | 500ms |
| `16beats` | 120 | 8000ms |
| `4beats` | 140 | 1714ms |

### Source and timeline ranges

`timeline` is the output range and `source` is the selected range from the source file. Use
beats for musical positions. Confirm a composition against a real render before relying on a
particular source-to-timeline duration relationship.

## Worked Example A: Single-layer V3 komposition

**V3 JSON:**
```json
{
  "version": "v3",
  "meta": { "bpm": 140, "meter": "4/4", "width": 1280, "height": 720, "fps": 25, "duration_ms": 20000 },
  "layers": [{
    "z": 0, "role": "background", "blend": "replace",
    "clips": [{
      "source_id": "boat-vid",
      "source_range": { "start_ms": 0, "duration_ms": 20000 },
      "timeline_range": { "start_ms": 0, "duration_ms": 20000 }
    }]
  }],
  "audio_tracks": []
}
```

**Equivalent V3 markdown:**
```markdown
# Boat Video

## Meta
- bpm: 140
- duration: 20s
- size: 1280x720@25

## Layer 0: Backgrounds (blend: replace)
- {file:boat-vid} timeline 0s-20s source 0s-20s
```

## Worked Example B: Multi-layer V3 komposition

```json
{
  "version": "v3",
  "meta": { "bpm": 128, "meter": "4/4", "width": 1920, "height": 1080, "fps": 30, "duration_ms": 120000 },
  "layers": [
    {
      "z": 0, "role": "background", "blend": "replace",
      "clips": [{ "source_id": "main-footage", "source_range": { "start_ms": 0, "duration_ms": 60000 }, "timeline_range": { "start_ms": 0, "duration_ms": 60000 } }]
    },
    {
      "z": 1, "role": "overlay", "blend": "alpha_over",
      "clips": [{ "source_id": "logo-overlay", "source_range": { "start_ms": 0, "duration_ms": 5000 }, "timeline_range": { "start_ms": 10000, "duration_ms": 5000 } }]
    },
    {
      "z": 2, "role": "foreground", "blend": "alpha_over",
      "clips": [{ "source_id": "title-card", "source_range": { "start_ms": 0, "duration_ms": 3000 }, "timeline_range": { "start_ms": 0, "duration_ms": 3000 } }]
    }
  ],
  "audio_tracks": [
    { "role": "music", "gain_db": -3, "clips": [{ "source_id": "soundtrack", "source_range": { "start_ms": 0, "duration_ms": 120000 }, "timeline_range": { "start_ms": 0, "duration_ms": 120000 } }] },
    { "role": "voiceover", "gain_db": 0, "clips": [{ "source_id": "narration", "source_range": { "start_ms": 0, "duration_ms": 30000 }, "timeline_range": { "start_ms": 5000, "duration_ms": 30000 } }] }
  ]
}
```

**Equivalent V3 markdown:**
```markdown
# Multi-layer Demo

## Meta
- bpm: 128
- duration: 120s
- size: 1920x1080@30

## Layer 0: Backgrounds (blend: replace)
- {file:main-footage} timeline 0s-60s source 0s-60s

## Layer 1: Overlays (blend: alpha_over)
- {file:logo-overlay} timeline 10s-15s source 0s-5s

## Layer 2: Foregrounds (blend: alpha_over)
- {file:title-card} timeline 0s-3s source 0s-3s

## Audio: music (gain: -3dB)
- {file:soundtrack} timeline 0s-120s source 0s-120s

## Audio: voiceover (gain: 0dB)
- {file:narration} timeline 5s-35s source 0s-30s
```

## Overlay Segments — simultaneous playback and DJ crossfades

A window where two or more audio sources play **at the same time**, with a beat-timed
crossfade. This is the construct for the transition model described in
[beats-and-bars](beats-and-bars.md), and notably it is **authored entirely in beats** — no
seconds, no milliseconds.

It is expressed as an `## Overlay Segments` section containing a JSON array:

```json
[{
  "type": "overlay",
  "startBeat": 128,
  "durationBeats": 32,
  "masterBpm": 130,
  "tracks": [
    { "fileId": "ID_A", "sourceBeat": 128, "strategy": "A_NATIVE" },
    { "fileId": "ID_B", "sourceBeat": 128, "strategy": "C_STRETCH", "sourceBpm": 132 }
  ],
  "transition": {
    "type": "crossfade",
    "outDurationBeats": 32,
    "inDurationBeats": 32,
    "curve": "equal_power",
    "eqKill": "bass_swap"
  }
}]
```

| Field | Meaning |
|---|---|
| `startBeat` | Beat on the master timeline where the crossfade window opens |
| `durationBeats` | Length of the simultaneous-playback window |
| `masterBpm` | BPM for beat→ms conversion (usually the same as `meta.bpm`) |
| `tracks[]` | **At least 2.** `tracks[0]` is outgoing (fades out); the last is incoming (fades in) |
| `transition` | `outDurationBeats` / `inDurationBeats` fade lengths, `curve: "equal_power"`; optional `eqKill: "bass_swap"` |

### Per-track tempo reconciliation

Each track carries a `strategy`, and this is where a source at its own native tempo gets
reconciled to the master:

- **`A_NATIVE`** — play at the source's own tempo, no tempo change.
- **`C_STRETCH`** — reconcile the source's native tempo to `masterBpm`; provide its
  `sourceBpm`.

So a 130 BPM master drawing on a 132 BPM song is expressible here: give that track
`strategy: "C_STRETCH"` and `sourceBpm: 132`.

### Prefer a real downbeat over `sourceBeat`

A track may specify `sourceStartMs` instead of `sourceBeat`. **Prefer it** — read the
analyzed downbeat grid and pass the chosen downbeat position, because the `sourceBeat`
formula assumes the file has no intro and is less accurate. This is the same principle as
[beats-and-bars](beats-and-bars.md): a position inside a source comes from that file's
measured grid, not from arithmetic.

### Optional EQ treatment

Set `eqKill: "bass_swap"` in `transition` to opt into the crossfade's EQ treatment. Omit it
for a volume crossfade only.

> Do not also cover an overlay window in `## Audio`; use the overlay segment for that window.
> There is no `kli` shortcut for Overlay Segments, so confirm the exact field set against a
> real render before depending on it.

## Clip-line Props (Remotion)

On V3 markdown, generated segments can pass props inline on the clip line:

```markdown
- {file:remotion:KompoTitle} timeline 0s-8s source 0s-8s props {"title": "My Video", "accentColor": "#6366f1"}
- {file:remotion:KompoOverlay} timeline 8s-20s source 0s-12s props {"name": "Speaker", "role": "Producer"}
```

Props can also be written as a sub-bullet; if both forms are present, the inline form wins.

## Overlay clips

Overlay clips (logo overlays, lower-thirds, title cards with transparency) must be placed
on a layer with `blend: alpha_over`. They are composited on top of the previous layer
using alpha compositing. In the markdown format, use a layer labelled `Overlays` or
`Foregrounds` with `blend: alpha_over`.

## Common Mistakes

- Non-consecutive z values (e.g., layers 0 and 2 with no layer 1) → validation fails
- Missing `duration` in `## Meta` → parser cannot determine total length
- Overlay clips on a `blend: replace` layer → transparency rendered as black
- Using V2 markdown syntax (`[FILE_ID](source-type)`) in a V3 komposition → parse failure
