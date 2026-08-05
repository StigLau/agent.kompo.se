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
> throughout this unit show the format's full range and make the JSON⇄markdown correspondence
> legible — they are **not** the recommended authoring unit. A komposition is written in
> beats and bars; milliseconds are the compiled form the render pipeline consumes. Computing
> a second or millisecond position yourself from a bar reference is the anti-pattern described
> in [beats-and-bars](beats-and-bars.md), and a round `ms` literal is its usual tell.
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
- One audio section per track. Multiple tracks allowed — this is the documented route for
  **layered audio**, where more than one song plays at once. Overlapping timeline ranges
  across audio tracks is the intended DJ-style transition, not a mistake
  (see [beats-and-bars](beats-and-bars.md)). Note that `gain_db` is the only per-track
  processing this format exposes: there is **no syntax for the highpass/lowpass filter sweeps**
  a real crossfade needs. Level-only overlaps are what you can author today.
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

### Duration constraints

V3 does not support time-stretch per clip. The source range duration MUST equal the
timeline range duration — if they differ, the build fails.

> **Known conflict with the intended model.** A komposition is meant to express "this segment
> occupies 8 bars" and have the source clip *stretch to fit* — sources vary in length (say 10
> to 30 seconds) and the bar count is the fixed thing (see [beats-and-bars](beats-and-bars.md)).
> The equal-duration constraint above is the documented current V3 behavior and contradicts
> that. Until it is resolved, cover a fixed bar span with a clip you have trimmed to the right
> length, a still image, or a Remotion `source-generated` sequence — and treat stretch-to-fit
> as unavailable in V3 rather than assuming either side of this conflict.

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
- Timeline and source durations differ → build fails (no time-stretch)
- Missing `duration` in `## Meta` → parser cannot determine total length
- Overlay clips on a `blend: replace` layer → transparency rendered as black
- Using V2 markdown syntax (`[FILE_ID](source-type)`) in a V3 komposition → parse failure
