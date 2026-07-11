# Kompositions Workflow

A *komposition* is a markdown document that describes a music video. It contains BPM,
beat timings, visual track definitions, and references to kilder (sources). You manage
kompositions through a standard CRUD API.

**Important**: the `name` field is **derived** from the first H1 header in `content`.
Do not send a separate `name` field — the API extracts it automatically.

## Endpoints

### List kompositions

```
GET /api/kompositions
Authorization: Bearer <token>
Accept: application/json  (or text/markdown)
```

Response:

```json
{
  "kompositions": [
    {
      "id": "uuid",
      "name": "My Video",
      "content": "# My Video\n\n...",
      "status": "draft",
      "contentType": "markdown",
      "thumbnailUrl": "...",
      "videoUrl": "...",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

### Create komposition

```
POST /api/kompositions
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "# My First Video\n\nCreate a video with...",
  "status": "draft",                  // optional, default: "draft"
  "contentType": "markdown"           // REQUIRED (no default)
}
```

Response:

```json
{
  "komposition": {
    "id": "uuid",
    "name": "My First Video",
    "content": "# My First Video\n\nCreate a video with...",
    "status": "draft",
    "contentType": "markdown",
    "createdAt": "2025-01-05T14:00:00Z",
    "updatedAt": "2025-01-05T14:00:00Z"
  }
}
```

If the H1 header is missing:

```json
{
  "error": "Invalid komposition structure",
  "message": "Content must start with '# Komposition Name' header",
  "validationErrors": ["Missing H1 header at start of content"]
}
```

### Get komposition

```
GET /api/kompositions/{id}
Authorization: Bearer <token>
```

Response: `{ "komposition": { id, name, content, status, contentType, ... } }`

### Update komposition

```
PUT /api/kompositions/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "# Updated Name\n\nNew content..."
}
```

The `name` is automatically updated from the new H1 header. You may also update
`status` (e.g. to mark as ready for build).

### Delete komposition

```
DELETE /api/kompositions/{id}
Authorization: Bearer <token>
```

Response: `{ "success": true }`
