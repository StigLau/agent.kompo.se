# Komposition Markdown Format (V1/V2)

A komposition is a markdown document that describes a music video. It defines BPM,
beat timings, visual and audio tracks, and references to kilder (media source assets).
The platform parses this markdown, resolves references, and compiles it into a render
graph. The markdown must follow the exact structure below.

Kompositions are timed in **BPM/beats**, not milliseconds — and not seconds either.

> **Start at [beats-and-bars](beats-and-bars.md).** This unit is the syntax. That one is the
> approach: think in bars, author in beats, and never precompute a millisecond position
> yourself. The conversion formula below is for *verifying a finished render*, not for
> placing anything.

## Required Structure

```markdown
# Komposition Title

## Metadata
- BPM: 135

## Tracks

### Visuals
- [FILE_ID](source-image) "Description of the visual"
  - Start: 0 beats
  - End: 8 beats
- [FILE_ID](source-video) "Description of the clip"
  - Start: 8 beats
  - End: 24 beats

### Audio
- [FILE_ID](source-audio) "Description of the audio track"
  - Start: 0 beats
  - End: 32 beats
```

## Field Reference

### H1 Title (Required)
The first line MUST be `# Title`. The title becomes the komposition name.

### Metadata Section (Required)
- **BPM** (Required): Beats per minute. Controls the timing grid. Common values: 120 (house), 128 (trance), 135 (goa trance), 140 (psytrance), 90 (hip-hop).

### Tracks Section (Required)
Contains two subsections: `### Visuals` and `### Audio`.

Both take a list, so **multiple audio entries in one komposition are valid** — sequencing two
songs one after another is a normal, exercised case.

For a **DJ-style transition** where the outgoing and incoming songs deliberately play at once
(see [beats-and-bars](beats-and-bars.md)), use V3's `## Overlay Segments`; see
[komposition-v3](komposition-v3.md) for its entered format. Overlapping two `### Audio`
entries here is not the documented route for that and should be confirmed against a real
render before you rely on it.

### Source References
Format: `[FILE_ID](source-type) "Human-readable name"`

| source-type | Meaning |
|-------------|---------|
| `source-image` | A still image, displayed for the duration of its beat range |
| `source-video` | A video clip, trimmed or looped to fit its beat range |
| `source-audio` | An audio track, mixed into the final output |

**FILE_ID** is the ID from the media library (list with `GET /api/files/user`). The file must exist in the library before the komposition can be built.

### Beat Timing
Each source entry has:
- **Start**: `N beats` — when this source begins (beats are **0-indexed**; 0 = start of video)
- **End**: `M beats` — when this source ends

`beats` is the only timing unit this format accepts. **There is no `bars` unit** — think in
bars, then write the beat count (in 4/4, bars × 4). Bar *lengths* convert safely by
multiplication; bar *positions inside a source track* do not — those come from that track's
analyzed downbeat grid. See [beats-and-bars](beats-and-bars.md).

The server converts beats to time using the document's BPM:
`duration_seconds = (end - start) * 60 / BPM`. At 135 BPM, 8 beats is 3.56 seconds and 32
beats is 14.22 seconds.

**Use that formula to check a rendered output's duration, not to author positions.** If you
find yourself writing a millisecond or second literal you computed from a bar number, stop —
that is the precomputation anti-pattern described in [beats-and-bars](beats-and-bars.md).

## Complete Example (Build-Ready)

```markdown
# trancy-boat-trip-v2

## Metadata
- BPM: 135

## Tracks

### Visuals
- [66YthVY13aSXDGN3](source-image) "Viking Longship Arriving"
  - Start: 0 beats
  - End: 8 beats
- [MlkHds9ENQc6brfy](source-video) "Vikings Landing video"
  - Start: 8 beats
  - End: 24 beats
- [4hLuFPyvFPJq-AUw](source-image) "Vikings Rowing"
  - Start: 24 beats
  - End: 32 beats

### Audio
- [bFdjZNswS-e2Unkm](source-audio) "goa trance music"
  - Start: 0 beats
  - End: 32 beats
```

## Generated Segments (Remotion)

Segments can reference Remotion compositions instead of library files. These are
rendered on-the-fly during the build pipeline.

### Source Type: `source-generated`

Format: `[remotion:CompositionId](source-generated) "Description"`

```markdown
### Visuals
- [remotion:KompoTitle](source-generated) "Intro title card"
  - Start: 0 beats
  - End: 8 beats
  - Props: {"title": "My Video", "subtitle": "Episode 1", "accentColor": "#6366f1"}

- [FILE_ID](source-video) "Main content"
  - Start: 8 beats
  - End: 40 beats

- [remotion:KompoOverlay](source-generated) "Lower-third overlay"
  - Start: 8 beats
  - End: 20 beats
  - Props: {"name": "Speaker Name", "role": "Producer"}
  - Overlay: true
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `remotion:CompositionId` | Yes | References a registered Remotion composition |
| `Props` | No | JSON object passed to the React component |
| `Overlay` | No | If `true`, rendered with alpha and composited on top of the previous visual |

### Available Compositions

| ID | Output | Props |
|----|--------|-------|
| `KompoTitle` | MP4 title card | `title`, `subtitle`, `bgColor`, `accentColor` |
| `KompoOverlay` | WebM+alpha lower-third | `name`, `role`, `accentColor` |
| `KompoDataViz` | MP4 bar chart | `stats[]` (array of `{label, value}`) |
| `SegmentCard` | MP4 timing visualization | `segmentName`, `beatStart`, `beatEnd`, `bgColor`, `accentColor`, `segmentIndex`, `bpm` |

### Fallback if a generated segment fails to render

A `source-generated` (remotion:*) segment depends on server-side rendering infrastructure. If a build fails specifically at a generated-segment render step, a `source-video` or `source-image` visual (see Source References above) referencing a pre-uploaded file is a reliable fallback that does not depend on that rendering path — swap the segment type, keep the same beat range, and resubmit.

## Common Mistakes

- Missing `## Metadata` section or BPM field → build fails
- File ID not in library (still in staging) → build fails with "source not found"
- Overlapping visual beat ranges → unexpected stacking behavior
- No audio track → video renders but is silent
- Sending a `name` field in the create request → rejected (name is extracted from H1)
- **Precomputing millisecond or second positions** — if a value in this document is a round
  number of milliseconds you calculated from a bar reference, it is almost certainly wrong.
  State beats; let the server resolve them. See [beats-and-bars](beats-and-bars.md).
- **Mixing tracks of different tempo without accounting for the single global BPM** — there is
  only ONE `BPM` value per komposition, and every track's beat positions (visual and audio)
  are converted to time using that one value. If you compose two audio kilder with different
  measured tempos (see [media-analysis](media-analysis.md)), beat counts authored against a
  track's own native BPM will play at the wrong speed once resolved against the document's
  declared BPM. Either declare the BPM you actually want the timeline to run at and convert
  each track's beat counts to match, or keep the tracks close in tempo.

  This is a V1/V2 format constraint. For V3's alternative, see the entered
  `## Overlay Segments` format in [komposition-v3](komposition-v3.md).
- **Assuming output resolution is configurable** — there is no resolution field in this format.
  The platform renders at a fixed default resolution; do not build downstream logic that expects
  a specific resolution unless you've confirmed it against a real render.
