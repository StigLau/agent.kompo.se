# Sources Workflow (Kilder)

A **kilde** (plural **kilder**) is a metadata-tagged, reusable multimedia source asset —
an audio track, video clip, or image — with segment definitions. Kilder are specialized
komposition records with `contentType` set to `"source-audio"`, `"source-video"`, or
`"source-image"`.

A kilde is where a source's **named segments** live, and those names are the vocabulary the
user composes with — see [source-metadata-approach](source-metadata-approach.md). Creating a
kilde with an empty or auto-numbered `## Segments` section throws away the most valuable part
of analysis.

## Key differences from regular kompositions

- **contentType** is `"source-audio"`, `"source-video"`, or `"source-image"`
- Status is always `"complete"` (no build pipeline)
- `content` is **REQUIRED** (never null) — contains a strict markdown structure
- `name` is extracted from the first H1 header
- Includes `fileReferences` JSON array with a fallback chain

## Endpoints

### List kilder

```
GET /api/kompositions/sources
Authorization: Bearer <token>
```

Response:

```json
{
  "sources": [
    {
      "kompositionId": "source-uuid-123",
      "name": "Hesnes Islands Footage",
      "contentType": "source-video",
      "content": "# Hesnes Islands Footage\n\n## Metadata\n- Type: video\n- BPM: 125\n\n## Segments\n- **intro** (0:00-0:15): Opening shot\n\n## File Locations\n1. library:{file:abc123}\n2. https://youtube.com/...",
      "fileReferences": "[{\"type\":\"library\",\"fileId\":\"abc123\",\"priority\":1},{\"type\":\"youtube\",\"url\":\"https://...\",\"priority\":2}]",
      "status": "complete",
      "createdAt": "2025-01-05T12:00:00Z",
      "updatedAt": "2025-01-05T12:00:00Z"
    }
  ]
}
```

### Create a kilde

Creating a kilde requires the `producer` role on your account.

```
POST /api/kompositions/sources
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "# My Drum Loop\n\n## Metadata\n- Type: audio\n- BPM: 120\n- Duration: 180\n\n## Segments\n\n## File Locations\n1. library:{file:xyz789}",
  "contentType": "source-audio"
}
```

Response:

```json
{
  "source": {
    "kompositionId": "source-uuid-456",
    "name": "My Drum Loop",
    "contentType": "source-audio",
    "content": "# My Drum Loop\n\n## Metadata\n...",
    "fileReferences": "[{\"type\":\"library\",\"fileId\":\"xyz789\",\"priority\":1}]",
    "status": "complete",
    "createdAt": "2025-01-05T13:00:00Z",
    "updatedAt": "2025-01-05T13:00:00Z"
  }
}
```

## The `## Segments` section

Every kilde's `content` carries a `## Segments` section. It is where a source's structural
parts are recorded and, critically, **named**.

> **Open gap — the shape of this section is not specified by any verified contract.** The
> only form appearing in examples is wall-clock: `- **intro** (0:00-0:15): Opening shot`.
> That form is at odds with the approach the rest of these docs describe, where positions
> are anchored to the analyzed downbeat grid in bars and beats rather than to mm:ss (see
> [beats-and-bars](beats-and-bars.md)). Neither a beats-based nor a bars-based segment form
> has been confirmed against the server's parser from this client.
>
> Until it is: use the documented mm:ss form so the record round-trips, and **keep the
> beat/bar anchor and the source `fileId` alongside it** in the description text so the
> grid-derived position is not lost. Do not invent a syntax the parser may reject.

What matters regardless of syntax:

- **Use the user's names**, not machine labels. *"straw hat man"*, *"car chase"*,
  *"banging wall"* — not `segment-1`, and not only the analyzer's generic
  Intro/Verse/Drop/Breakdown/Outro.
- **Anchor to the grid**, not to a guess. Segment boundaries come from the analyzed
  downbeats of that exact audio file.
- **One kilde, one audio edit.** A grid — and therefore every segment boundary derived from
  it — is valid only for the specific file it was analyzed from. A remaster, a single edit,
  or a re-upload needs its own kilde and its own analysis. See
  [source-metadata-approach](source-metadata-approach.md).

Named segments are not merely descriptive. The server supports referencing a source **by
segment name** rather than by timestamp: a `{source:Alias:segment}` reference in markdown is
resolved to the underlying file and position, and an Overlay Segment track can name a phrase
directly instead of giving a file plus a beat offset (see
[komposition-v3](komposition-v3.md)). Those references resolve against the source file's
**analyzed downbeat grid** — which is exactly why segment names must be anchored to real bars
rather than to a guess, and why a source with no downbeat data cannot be referenced this way.

> **Not documented in this client.** The reference syntaxes above are verified against the
> server's parser, but they have no worked example in these docs, no `kli` command, and no
> contract test here. Treat the exact spelling as unconfirmed from this side and check against
> a real build before depending on it. The V1/V2 structure in
> [komposition-format](komposition-format.md) references sources by file ID.

### Update and delete

Use the standard komposition update and delete endpoints:

```
PUT /api/kompositions/{id}
DELETE /api/kompositions/{id}
```

Kilder use the same endpoints as regular kompositions — the `contentType` field
distinguishes them.

## File location fallback

Each kilde can declare a prioritized list of file locations (library cache, S3, YouTube,
etc.). The system resolves the first available location. If a YouTube source lacks a library
cache, the system triggers a download and updates the kilde document.
