# Kompo.ai — Service Overview

Kompo.ai is an LLM-guided music video composition platform. You describe what you want in
natural language, upload source files, and the platform composes, renders, and delivers a
finished music video.

## What you can do with kompo.ai

The API surface supports six workflow flows:

1. **Bootstrap & discovery** — the [tools manifest](https://ai.makeshitapp.com/api/tools) describes every callable
   operation, its HTTP method, path, and input schema.
2. **Authentication** — request an account (invitation-only), then log in via `kli auth/url`
   → `kli auth/complete <callback-url>` (PKCE paste-back flow). The CLI auto-refreshes
   tokens via `kli auth/refresh`.
3. **Upload** — upload audio, video, and image files to your media library via presigned
   S3 URLs.
4. **Analyze & tag kilder** — create a *kilde* (a metadata-tagged, reusable media source
   with segment definitions) that references your uploaded files. Kilder are the building
   blocks kompositions reference.
5. **Compose a komposition** — create a markdown document (a *komposition*) that describes
   your music video: BPM, beat timings, visual tracks, and which kilder to pull from.
   You can compose via natural-language chat or the CRUD API directly.
6. **Build, poll & download** — submit the komposition for rendering. Poll the job status
   until it succeeds, then download the finished `.mp4` from the outputs endpoint.

## Environments

| Environment | Frontend | API |
|-------------|----------|-----|
| Production | https://ai.makeshitapp.com | https://ai.makeshitapp.com (path-routed /api/*) |
| Test | https://test.ai.makeshitapp.com | https://api.test.ai.makeshitapp.com |

## Quick health check

```bash
curl https://ai.makeshitapp.com/api/health
# → { "status": "healthy", "version": "2.0-typescript-full", "timestamp": "..." }
```

No authentication required. Also available at the root `/health` path on environments with
an `api.` subdomain.
