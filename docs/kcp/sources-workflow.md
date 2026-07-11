# Sources Workflow (Kilder)

A **kilde** (plural **kilder**) is a metadata-tagged, reusable multimedia source asset —
an audio track, video clip, or image — with segment definitions. Kilder are specialized
komposition records with `contentType` set to `"source-audio"`, `"source-video"`, or
`"source-image"`.

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
