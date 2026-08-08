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
- `status` may be `"complete"`, `"draft"`, or omitted; treat it as descriptive metadata
- `content` is **REQUIRED** (never null) — contains a strict markdown structure
- `name` is extracted from the first H1 header
- Includes `fileReferences` JSON array with a fallback chain

## KLI

List the kilder available to your authenticated user:

```bash
kli sources
```

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
      "status": "draft",
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

> **Open gap — the shape of this section is not specified by a verified public contract.** The
> only form appearing in examples is wall-clock: `- **intro** (0:00-0:15): Opening shot`.
> Use that documented form until a public beat- or bars-based form is available; do not invent
> syntax.

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

V1/V2 kompositions reference sources by file ID; see
[komposition-format](komposition-format.md).

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
