# Video Build Workflow

Submit a komposition for video rendering. The platform parses the komposition markdown,
resolves kilder, downloads assets, and runs ffmpeg to produce the final video.

## Submit a build

### Legacy endpoint

```
POST /api/create-video-from-komposition
Authorization: Bearer <token>
Content-Type: application/json
```

Three request formats are accepted:

**Format 1 — komposition object:**
```json
{
  "komposition": {
    "id": "uuid",
    "content": "# My Video\n\n..."
  }
}
```

**Format 2 — separate fields:**
```json
{
  "komposition_id": "uuid",
  "markdown": "# My Video\n\n..."
}
```

**Format 3 — string (content only):**
```json
{
  "komposition": "# My Video\n\n..."
}
```

Response (cache hit):
```json
{
  "cache_hit": true,
  "job_id": "job-xxx-123456",
  "strict_json": { "...": "..." }
}
```

Response (new job):
```json
{
  "success": true,
  "job_id": "job-xxx-123456",
  "workflow": "step-functions|direct-batch",
  "execution_arn": "arn:aws:states:...",
  "graph_stats": {
    "total_nodes": 15,
    "download_nodes": 5
  },
  "instruction_cache_hit": false,
  "ephemeral": false,
  "graph_key": "batch-jobs/{userId}/{jobId}/graph.json"
}
```

**Options:**
- `ephemeral: true` — output to temporary storage with 1-hour presigned URLs (for previews).

### YouTube download job (unified jobs API)

```
POST /api/jobs
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "youtube_download",
  "params": {
    "url": "https://youtube.com/watch?v=...",
    "quality": "720p",
    "cookies": "optional-cookie-string"
  }
}
```

Downloads a YouTube video and adds it to your library. Poll status via
[job-monitoring](#job-monitoring).

### Unified jobs API — video build (preferred)

```
POST /api/jobs
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "video_build",
  "params": {
    "komposition_id": "uuid",
    "content": "# My Video\n\n...",
    "ephemeral": false,
    "pipeline": "kompostrict"
  }
}
```

Response (202 Accepted):
```json
{
  "job_id": "vb-abc123...",
  "type": "video_build",
  "status": "PENDING",
  "current_phase": "submitted",
  "execution_arn": "arn:aws:states:...",
  "created_at": "2025-01-10T12:00:00Z"
}
```

## Caching

The system caches rendered outputs by komposition content hash. If you submit the same
komposition content (same markdown, same viewport) again, you get back the existing
`job_id` immediately with `cache_hit: true` — no re-render.

## Next step

After submitting a build, poll the job status. See [job-monitoring](#job-monitoring).
