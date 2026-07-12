# File Management

Upload files to your media library through a presigned-URL flow. Files become available
for referencing in kilder and kompositions.

## Upload flow (3 steps)

### Step 1: Request a presigned URL

```
POST /api/upload/presigned-url
Authorization: Bearer <token>
Content-Type: application/json

{
  "fileName": "video.mp4",
  "contentType": "video/mp4",
  "fileSize": 1048576
}
```

Response:

```json
{
  "uploadUrl": "https://s3...",
  "fileId": "uuid",
  "key": "user/{userId}/{fileId}/video.mp4"
}
```

### Step 2: Upload to S3

`PUT` the file bytes directly to the `uploadUrl` (presigned S3 URL). No kompo.ai
authentication header is needed for this step — the URL itself is the credential.

### Step 3: Confirm the upload

```
POST /api/upload/complete
Authorization: Bearer <token>
Content-Type: application/json

{
  "fileId": "uuid",
  "fileName": "video.mp4",
  "fileSize": 1048576,
  "contentType": "video/mp4"
}
```

Response: `{ "success": true, "fileId": "uuid" }`

### CLI command coverage

`kli upload-media <path>` is the video/image-specific shortcut for this three-step flow. `kli upload-analyze <path>` remains the audio shortcut that also triggers analysis. The presigned-URL upload flow documented above works for any allowed content type (video, audio, image); if you need another content type, call these HTTP endpoints directly with your stored bearer token.

## Library management

### List files

```
GET /api/files/user
Authorization: Bearer <token>
Accept: application/json  (or text/markdown)
```

Response:

```json
{
  "files": [
    {
      "id": "uuid",
      "name": "video.mp4",
      "size": 1048576,
      "type": "video/mp4",
      "s3Key": "user/...",
      "uploadDate": "..."
    }
  ]
}
```

### Delete a file

```
DELETE /api/files/{fileId}
Authorization: Bearer <token>
```

Response: `{ "success": true }`

## Library search

```
GET /api/library/search?q={query}&type={type}
Authorization: Bearer <token>
```

Response:

```json
{
  "results": [
    {
      "fileId": "file-456",
      "name": "My Video",
      "type": "video",
      "originUrl": "...",
      "cachedAt": "...",
      "usedIn": ["kompo-789"]
    }
  ]
}
```

`type` can filter by `audio`, `video`, or `image`.

## Check komposition multimedia cache

See which source files a komposition references and their cache status.

```
GET /api/library/komposition/{kompoId}/multimedia
Authorization: Bearer <token>
```

Response:

```json
{
  "kompositionId": "uuid",
  "multimedia": [
    {
      "sourceId": "src-123",
      "sourceName": "My Video",
      "sourceType": "youtube",
      "originUrl": "https://youtube.com/...",
      "fileId": "file-456",
      "status": "cached|missing|stale",
      "s3Key": "library/user/file-456/video.mp4"
    }
  ],
  "summary": { "cached": 1, "missing": 0, "stale": 0 }
}
```

Each source shows whether its file is `cached` (present in library), `missing` (not yet downloaded), or `stale` (needs refresh).

## Library prune

```
POST /api/library/prune
Authorization: Bearer <token>
Content-Type: application/json

{
  "scope": "user",
  "dryRun": true
}
```

Removes stale library entries whose S3 objects no longer exist. Always run with
`dryRun: true` first.
