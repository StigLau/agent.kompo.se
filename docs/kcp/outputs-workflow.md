# Outputs Workflow

List and download your finished, rendered video outputs.

## List all outputs

```
GET /api/outputs
Authorization: Bearer <token>
Accept: application/json  (or text/markdown)
```

Response:

```json
{
  "outputs": [
    {
      "operation_id": "job-xxx-123456",
      "file_name": "job-xxx-123456.mp4",
      "s3_key": "user/{userId}/produced/job-xxx-123456.mp4",
      "size": 12345678,
      "last_modified": "2025-12-22T10:30:00Z",
      "download_url": "https://s3...",
      "url": "https://s3...",
      "is_final": true
    }
  ]
}
```

- `download_url` — presigned S3 URL for direct download.
- `url` — alternative URL for the same asset.
- `is_final` — `true` for permanent outputs, `false` for ephemeral/temporary renders.

## Download a video

```bash
curl -H "Authorization: Bearer <token>" https://api.ai.makeshitapp.com/api/outputs | \
  jq -r '.outputs[0].download_url' | \
  xargs curl -o my-video.mp4
```

## Also see

- [job-monitoring](#job-monitoring) — for per-job output URLs (available immediately
  when a job reaches `SUCCEEDED`).

`GET /api/outputs` is the canonical endpoint for listing all finished videos across
all kompositions.
