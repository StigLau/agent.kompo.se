# Beats and Bars — where to start when writing a komposition

This unit is the **approach**, not the syntax. For the exact markdown a build accepts, see
[komposition-format](komposition-format.md) (V1/V2) and [komposition-v3](komposition-v3.md)
(layered). Read this one first: it is what stops a syntactically valid komposition from
being musically wrong.

## The komposition is a simplified central model

In the middle of everything sits a simple description of what the user wants. A worked
example, in the user's own terms:

> A music video at 130 BPM. Intro 4 bars, verse 8 bars, refrain 8 bars, outro 4 bars.
> It draws on two songs — one at 125 BPM, one at 138. From the first we play the segments
> *"straw hat man"* and *"car chase"* for intro and verse; from the second,
> *"banging wall"* and *"outro"*.

That is the whole input. The user describes **what they want**; the system does the
arithmetic. **The user never calculates timing** — and neither should the agent driving
the CLI on their behalf.

Note what the user did *not* say: no timestamps, no durations in seconds, no offsets in
milliseconds. They named structural lengths in bars and they named segments of songs.
That is the vocabulary to preserve all the way down to the document you author.

## Beats and bars are the language

State positions the way the music is counted:

> segment `outro` starts at beat 128 and plays for 16 beats

Not `starts at 59076ms`. Not `starts at 59.08s`. Seconds are not the unit either — they are
just milliseconds with fewer digits.

Exact milliseconds **do** exist and they matter: they are what gets handed to ffmpeg, and
they are an essential part of the caching strategy. But they belong at the render boundary,
computed by the server from the analyzed grid. The komposition layer, and the conversational
LLM sitting above it, should not speak in milliseconds unless forced to.

### The anti-pattern: precomputing milliseconds

The failure this unit exists to prevent looks like this:

1. The user says "start the refrain at bar 32."
2. The agent computes `32 bars × 4 beats × 60000 / 130 BPM = 59077ms`.
3. The agent hardcodes `59077` — or, more often, a suspiciously round `59000` — into the
   document.

Step 2 is the error, and it is wrong even when the arithmetic is right. It bakes one
assumption (constant tempo from time zero, no intro offset, this exact tempo estimate) into
a number that no longer carries any of that context. If any assumption was off, nothing
downstream can tell.

**Round millisecond numbers in an authored komposition are the tell.** A real
grid-derived position is almost never a multiple of 500.

The correction is not "do the arithmetic more carefully." It is: *don't do the arithmetic.*
State beats, and let the beat-grid resolution step convert them against the track's real
measured grid — see [source-metadata-approach](source-metadata-approach.md).

## Counting is 0-indexed

- Beats count from **0**. The first beat of the track is beat 0.
- Bars count from **0**. The first bar is bar 0.
- In 4/4, bar *B* spans beats `4B .. 4B+3`. The first beat of bar 1 is beat 4.

That relationship describes the **counting scheme**. It is not a way to find out where bar
12 actually lands in a recording.

> **Never derive a bar's position by multiplying.** Real tracks have pickups, silent leads,
> and intro offsets. A bar's position comes from the analyzed downbeat grid, not from
> arithmetic on a BPM label.

Multiplication tells you what bar 12 *would* be on a metronome that started at t=0. The
downbeat grid tells you where bar 12 *is*. Use the grid.

## Bars are how you think; beats are what you write

The wire formats do not accept a `bars` unit. V1/V2 accepts `N beats`
([komposition-format](komposition-format.md)); V3 accepts `s`, `ms`, or `beats`
([komposition-v3](komposition-v3.md)).

So convert bar counts to beat counts when you author — in 4/4, multiply the bar *count* by
4 — and keep the bar structure visible in the document's prose and segment names so the
user's intent survives. Converting a **count** (a length, "8 bars long" → "32 beats long")
is safe. Converting a **position** by the same multiplication is the anti-pattern above:
positions come from the grid.

The example above becomes, structurally:

| Section | Bars | Beats | Starts at beat |
|---|---|---|---|
| intro | 4 | 16 | 0 |
| verse | 8 | 32 | 16 |
| refrain | 8 | 32 | 48 |
| outro | 4 | 16 | 80 |

Those *timeline* positions are exact, because the output timeline is generated at the
master BPM and genuinely does start at zero. The positions that must never be computed this
way are the ones **inside a source track** — where in "banging wall" the segment starts.
Those come from that track's grid.

## One master tempo, fixed

A komposition has a single master BPM, and it is constant for the whole document.

A gradual master-tempo ramp — 125 sliding to 140 across the video — is an illustration of
what this model *could* express. **It is explicitly not supported at this stage.** Do not
author it and do not tell a user it is available.

## Audio is layered — songs legitimately overlap

Transitions are DJ-style. Songs are chosen so they *overlap*: for example one bar before
and two bars after the cutoff point, with highpass and lowpass filters moving in opposite
directions, so the incoming song enters on its highs and the crossover lands on the cutoff.

**Multiple songs playing at once during a transition is the intent, not a mistake.** Any
guidance that says "there should be only one song" is superseded.

This is implemented, and it has a dedicated construct: **`## Overlay Segments`** in V3 (see
[komposition-v3](komposition-v3.md)). It declares a window in which two or more sources play
simultaneously, authored **entirely in beats** — `startBeat`, `durationBeats`, per-track
`sourceBeat`, and a `transition` with `inDurationBeats` / `outDurationBeats`.

The opposed filter sweep is part of it and is applied for you: the outgoing track gets a
descending lowpass while the incoming track gets a descending highpass, so the incoming song
enters on its highs exactly as described above. You specify the crossfade in beats; you do
not author filters.

Use that construct for a transition rather than overlapping two `## Audio` sections — and do
not cover the crossfade zone in both, or the audio double-plays.

## Video segments stretch to their target length

Source clips vary in length — say 10 to 30 seconds — and are stretched to fit the bar count
they occupy. The bar count is the fixed thing; the clip accommodates it.

A segment may instead be covered by a still image, or by a Remotion-provided sequence
(`source-generated` in V1/V2, `{file:remotion:...}` in V3).

This is implemented, not aspirational: a V3 clip whose source duration differs from its
timeline duration is time-stretched to fill the slot — video by rescaling presentation
timestamps, audio via rubberband. See
[komposition-v3 § Duration constraints](komposition-v3.md). State the bar span you want and
let the clip accommodate it rather than pre-trimming sources to length.

## Music rendering is a separate step from video layering

Rendering the music is its own stage: it produces an audio file — `.flac` or `.mp3`, the
format is not settled — and it is a **separate cache boundary** from the ffmpeg video
layering that follows.

This separation is part of the model. **It is not documented in this client** — the job
contract described in [video-build-workflow](video-build-workflow.md) exposes a single
`video_build` type, and whether a separately addressable audio-render stage exists on the
server has not been verified from here. Treat that as a gap in this documentation rather than
as evidence the stage does not exist, and do not build against a separate audio-render job
until its contract is confirmed.

## The schema is the contract

You author to the schema, and the backend rejects what does not conform. Rejection is
structural and early, not a silent mis-render.

A create call with no H1 header, for instance, comes back as
([kompositions-workflow](kompositions-workflow.md)):

```json
{
  "error": "Invalid komposition structure",
  "message": "Content must start with '# Komposition Name' header",
  "validationErrors": ["Missing H1 header at start of content"]
}
```

Read `validationErrors` and fix the document — do not retry the same payload, and do not
work around a rejection by switching to a different format version.

## Starting checklist

Before writing a single line of komposition markdown:

1. **Get the user's structure in bars.** "Intro 4, verse 8, refrain 8, outro 4." If they
   gave you seconds, ask what that is in bars.
2. **Get the master BPM.** One number, fixed.
3. **Know your sources by segment name**, not by timestamp — see
   [source-metadata-approach](source-metadata-approach.md).
4. **Confirm each source has an analyzed beat grid**, and that the grid belongs to the
   exact file you will reference.
5. **Lay out the timeline in beats**, cumulative from 0.
6. **Author it.** No millisecond literals you computed yourself.

## Where each part of this model lives

| Intent | Where it is expressed |
|---|---|
| Video or audio segment stretched to its target length | **Supported.** V3 time-stretches any clip whose source duration differs from its timeline duration — see [komposition-v3](komposition-v3.md). |
| Master BPM different from a source's native BPM, system reconciles | **Supported in Overlay Segments** via `strategy: "C_STRETCH"` + `sourceBpm`. The plain `## Audio` track format has a single global BPM and no per-track native tempo. |
| Two or more songs playing at once | **Supported.** The `## Overlay Segments` construct, authored in beats. |
| DJ crossfade with opposed highpass/lowpass sweeps | **Supported and automatic.** Specify the crossfade in beats; the sweep is applied for you. |
| Reference a source by segment name rather than by timestamp | **Supported.** `{source:Alias:segment}` in markdown, and `sourceSegmentId` on an Overlay Segment track, resolved against the source's analyzed downbeat grid. Not yet documented in this client — see [sources-workflow](sources-workflow.md). |
| `bars` as a literal unit token in a document | **Not a unit token.** Positions and lengths are written in `beats`. Think in bars, author beats. |
| Gradual master-tempo ramp | **Not supported at this stage.** Illustrative only — do not author it. |
| Separate music-render stage and cache boundary | **Not documented in this client.** The public job contract here exposes `video_build`; whether a separate audio-render stage exists server-side has not been checked from here. |

> **A caution about every row above that says "not".** This repo is a client, and it is
> demonstrably behind the server — several capabilities in this table were documented here as
> impossible while being fully implemented. **Absence of syntax in this client's docs is not
> evidence of absence in the API.** Before telling a user something cannot be done, check the
> tools manifest and the server's own parser guidance; "I cannot find it documented" is a
> claim you can support, "the platform does not do it" usually is not.

Where something genuinely is not available, say so as a limitation. Do not simulate it by
precomputing milliseconds — that produces a document that builds, drifts, and gives nobody a
way to find out why.
