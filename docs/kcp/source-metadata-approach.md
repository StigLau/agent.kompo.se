# Source Metadata — how to approach finding metadata on music

This unit is the **approach** to acquiring metadata on source material. For the exact
analysis endpoint and its verified response shape, see
[media-analysis](media-analysis.md). For what you do with the result, see
[beats-and-bars](beats-and-bars.md).

The goal of this step is **not** "get the BPM". It is: come away with a grid you can place
segments on, and a set of names the user can compose with.

## The beat grid is the product. BPM is a label.

A single track-wide BPM number is a label. It is useful for setting a master tempo and for
sanity checks, and it is nearly useless for placing anything precisely.

What actually matters:

1. **The beat grid** — the measured position of every beat, and of every downbeat (bar
   start), in the real recording.
2. **The structural segments** built on that grid. The typical unit is about **4 bars**.

Two tracks can report the same BPM and have completely different grids — different intro
lengths, different pickups, a half-bar of silence before the first kick. The scalar cannot
express any of that. The grid can.

So: **read the grid, not just the number.** Anywhere you are tempted to multiply a BPM to
find out where something is, fetch the grid instead.

### What indicates the real pulse

When judging whether an analysis found the actual pulse — or when asking a user to confirm
it — the reliable indicators are the rhythmic elements, in order:

1. **The bass drum.** First and most reliable. In four-on-the-floor material it *is* the
   beat.
2. **The hi-hats.** Second. Useful for resolving whether you are on the beat or on the
   offbeat, and for spotting a doubled or halved read.

Melodic and harmonic content is a much weaker signal and should not be the basis for
overriding a grid.

## Tempo sanity check: 2× / 1× / ½× and nothing else

For four-on-the-floor techno — the primary target material — an estimate stands in exactly
one of three relationships to the truth: it is right, it is **double**, or it is **half**.

That is the entire correction vocabulary. Check it explicitly:

- Compare the scalar BPM against the median inter-beat interval implied by the grid.
- If they agree, or differ by a clean factor of 2 or 0.5, you have a usable grid — pick the
  reading that matches the bass drum.
- **If the disagreement is neither 1×, 2×, nor ½×, the analysis path is broken.** It is not
  a metrical ambiguity for the user to arbitrate. Do not offer them a choice; do not "split
  the difference"; do not proceed and hope. Re-analyze, or treat the source as unusable for
  beat-critical work and say so.

Ratios such as 3:2 or 2:3 are **not** part of this vocabulary. They are musically strange
for this material, and treating one as an acceptable explanation launders a broken result
into a plausible-looking one.

### Other genres need a different posture

The rule above is calibrated to machine-made four-on-the-floor. For material with a 3/8
feel, swing, or live playing, **do not assume machine-made music**:

- Rely on what the analysis actually gives you rather than forcing it onto a rigid grid.
- **Ask the end user for more during data acquisition.** This is the right moment to ask —
  before anything is composed against a grid that may not hold.
- Expect the user to describe more on top of the music: where sections start, what the feel
  is, which parts they mean by name. That description is data, not decoration.

## A grid belongs to one exact audio edit

This one causes silent, hard-to-diagnose drift.

Beat and downbeat positions are derived from **one specific audio file**. They are
meaningless against:

- a different remaster,
- a single edit vs the album version,
- a re-upload, re-encode, or re-trim of the same track,
- the same song from a different source entirely.

Different intro length, different tempo read, everything shifts. The analysis is still
internally consistent — it is just describing a different recording than the one you are
about to render.

**Any anchor must name which edit it belongs to.** In practice: keep the analysis bound to
the library `fileId` it was produced from, and never reuse a grid, an offset, or a segment
boundary across two file IDs even when the track is "the same song". If you re-upload,
re-analyze.

## Segment discovery and naming is a first-class step

The user composes by **naming parts of songs** — *"straw hat man"*, *"car chase"*,
*"banging wall"*, *"outro"* — not by naming timestamps. Those names are the composing
vocabulary (see [beats-and-bars](beats-and-bars.md)).

So capturing them is part of metadata acquisition, not a side effect of it:

1. **Get the structural boundaries** the analyzer found. Machine labels are generic —
   Intro, Verse, Drop, Breakdown, Outro.
2. **Get the user's names for them.** The generic label is a starting point for a
   conversation, not the answer. Ask: what do you call this part? Users name sections after
   what they see or hear in them, and those names are what they will use later.
3. **Anchor each named segment to the grid** — a downbeat position and a length in bars —
   not to a wall-clock timestamp.
4. **Store them on the kilde**, in its `## Segments` section (see
   [sources-workflow](sources-workflow.md)), so the names outlive the conversation and are
   reusable across kompositions.

A kilde whose segments are unnamed, or named only `segment-1`, has lost the thing that made
it worth analyzing.

## Operations relevant to this step

`GET /api/multimedia/{fileId}/analysis` is documented and verified in
[media-analysis](media-analysis.md) — start there.

Beyond it, the public tools manifest at `https://ai.makeshitapp.com/api/tools` declares
three further operations that serve this approach directly:

| Operation | What the manifest declares it does |
|---|---|
| `GET /api/multimedia/{fileId}/beat-grid` | The dedicated canonical beat-grid contract: per-beat timestamps and downbeat/bar-start timestamps in absolute milliseconds, plus BPM, confidence, median beat interval, and first/last beat positions. Reports a status of `not_analyzed`, `analyzed`, or `no_beat_grid`. |
| `POST /api/multimedia/beat-segments` | Converts a **beat-based** segment layout into timeline positions. Takes `beats_per_segment`, `segment_count`, and `file_ids`; looks up the exact beat grid for each file; returns contiguous timeline start/end positions plus source offsets. `start_beat` skips an intro. `arrangement` is `alternate` (cycles between files) or `sequential` (exhausts each before the next). |
| `analyze_audio_source` (via `POST /api/execute-tool`, body `source_id`) | Audio analysis metadata for a **kilde**: BPM plus segments with labels and timing, using boundaries such as Intro, Verse, Drop, Breakdown, Outro. |

`beat-segments` is the mechanism that makes agent-side arithmetic unnecessary: you state
the layout in beats, it resolves against each file's **measured** grid, and it returns the
millisecond positions. That is the division of labour this whole approach describes — you
speak beats, the server speaks milliseconds. Prefer it over computing positions yourself,
and note that it accepts multiple `file_ids`, so a layout spanning more than one song is a
first-class input rather than a workaround.

> **Status: declared, not verified.** These three entries are read from the server's own
> tools manifest. Their exact response shapes have **not** been confirmed against a live
> authenticated call from this client, and there is no `kli` command for any of them yet —
> they require a raw authenticated request. Verify the response before depending on field
> names, and treat any mismatch as a finding worth reporting rather than something to work
> around.

## Acquisition checklist

1. Upload the audio (`kli upload-analyze <path>`) and capture the `fileId`.
2. Poll until analysis completes — `analyzedAt` present and a finite `bpm`
   ([media-analysis](media-analysis.md)).
3. **Fetch the grid**, not just the scalar. Confirm downbeats are present.
4. **Run the tempo sanity check.** 1×, 2×, or ½× — anything else means stop.
5. **Discover the segments**, get the user's names for them, anchor each to a downbeat and
   a bar length.
6. **Record which `fileId` the grid came from.** It is only valid for that exact file.
7. Store the named segments on the kilde ([sources-workflow](sources-workflow.md)).

Only then start composing.
