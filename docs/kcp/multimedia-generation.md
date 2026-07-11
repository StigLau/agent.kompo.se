# Multimedia Generation

Generate AI images through explicit generation endpoints. Generated files land in a
**staging area** before being promoted to your permanent media library.

## Image generation

```
POST /api/generate-image
Authorization: Bearer <token>
Content-Type: application/json

{
  "prompt": "A neon-lit cyberpunk cityscape at night",
  "resolution": "1080p",           // optional: 1080p, 720p, 4K, vertical_1080p
  "style": "cinematic",            // optional
  "save_to_library": true          // optional: auto-add to library
}
```

Response:

```json
{
  "success": true,
  "image": {
    "data": "base64...",
    "mimeType": "image/png",
    "width": 1920,
    "height": 1080
  },
  "file_id": "abc123xyz",
  "model": "gemini-2.0-flash"
}
```

Set `save_to_library: true` to get a `file_id` immediately (the image is both returned
inline and saved to the library).

## Staging area

Generated files that were **not** auto-saved to the library reside in staging. List them,
delete them, or promote selected files to the library.

### List staging files

```
GET /api/multimedia/staging
Authorization: Bearer <token>
```

Response:

```json
{
  "success": true,
  "files": [
    {
      "id": "abc123",
      "name": "301225-Sunset_Over_Mountains.png",
      "size": 1234567,
      "type": "image/png",
      "format": "png",
      "uploadDate": "2025-12-30T10:30:00Z",
      "downloadUrl": "https://s3...",
      "generationPrompt": "A sunset over mountains with orange sky",
      "generationStyle": "cinematic, high quality",
      "generationResolution": "1080p"
    }
  ],
  "count": 1
}
```

### Delete from staging

```
DELETE /api/multimedia/staging/{fileId}
Authorization: Bearer <token>
```

Response: `{ "success": true, "message": "File deleted from staging", "fileId": "abc123" }`

### Promote to library

```
POST /api/multimedia/promote
Authorization: Bearer <token>
Content-Type: application/json

{
  "fileIds": ["abc123", "def456"]
}
```

Response:

```json
{
  "success": true,
  "promoted": ["abc123", "def456"],
  "failed": []
}
```

## Async video generation (Gemini/Vertex)

Trigger asynchronous AI video generation via Gemini/Vertex and poll for the result.

### Create video generation task

```
POST /api/multimedia/tasks
Authorization: Bearer <token>
Content-Type: application/json

{
  "prompt": "A drone flying over a mountain at sunrise",
  "options": {}                 // optional
}
```

Response includes a `taskId` for polling.

### Poll task status

```
GET /api/multimedia/tasks/{taskId}
Authorization: Bearer <token>
```

Returns the task status and, when complete, a reference to the generated video file.

## Typical generation workflow

```
POST /api/generate-image
  → GET /api/multimedia/staging
    → POST /api/multimedia/promote
      → reference file_id in a kilde or komposition
```
