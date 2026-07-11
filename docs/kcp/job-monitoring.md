# Job Monitoring

After submitting a video build, poll the job status to track its progress through the
render pipeline.

## Status endpoints

### Legacy status endpoint

```
GET /api/video/status/{jobId}
Authorization: Bearer <token>
```

Response:

```json
{
  "job_id": "job-xxx-123456",
  "status": "PENDING|RUNNING|SUCCEEDED|FAILED",
  "created_at": 1701936000000,
  "output_files": [
    {
      "file_name": "job-xxx-123456.mp4",
      "download_url": "https://s3...",
      "shareable_url": "https://s3..."
    }
  ]
}
```

### Unified jobs API (preferred)

```
GET /api/jobs/{jobId}
Authorization: Bearer <token>
```

Response:

```json
{
  "job_id": "vb-abc123...",
  "type": "video_build",
  "status": "PENDING|RUNNING|SUCCEEDED|FAILED|CANCELLED",
  "current_phase": "parsing|compiling|submitted|processing",
  "created_at": "2025-01-10T12:00:00Z",
  "updated_at": "2025-01-10T12:05:00Z",
  "output_files": [
    {
      "file_name": "output.mp4",
      "s3_key": "...",
      "download_url": "https://..."
    }
  ],
  "error_message": "..."
}
```

### Alternative status-only endpoint

```
GET /api/jobs/{jobId}/status
Authorization: Bearer <token>
```

Response: `{ "job_id": "...", "status": "...", "output_files": [...] }`

## List jobs for a komposition

```
GET /api/kompositions/{kompositionId}/jobs
Authorization: Bearer <token>
```

Response:

```json
{
  "jobs": [
    {
      "job_id": "job-xxx-123456",
      "status": "SUCCEEDED",
      "created_at": "2025-12-22T10:30:00Z",
      "output_files": [...]
    }
  ]
}
```

## List all jobs

```
GET /api/jobs?type=video_build&limit=20&cursor=...
Authorization: Bearer <token>
```

Response:

```json
{
  "jobs": [ /* JobStatusResponse[] */ ],
  "next_cursor": "base64-encoded-cursor"
}
```

## Cancel a job

```
DELETE /api/jobs/{jobId}
Authorization: Bearer <token>
```

Response: `{ "success": true, "job_id": "...", "status": "CANCELLED" }`

## Polling strategy

Poll `GET /api/jobs/{jobId}/status` every 5–10 seconds until the status is `SUCCEEDED`
or `FAILED`. When succeeded, `output_files[0].download_url` contains the finished video.
