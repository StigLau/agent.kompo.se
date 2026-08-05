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
   blocks kompositions reference. *Tagging* here means capturing the track's **beat grid**
   and giving its structural parts **human-meaningful names** — the names the user will
   compose with. See [source-metadata-approach](source-metadata-approach.md).
5. **Compose a komposition** — create a markdown document (a *komposition*) that describes
   your music video: BPM, beat timings, visual tracks, and which kilder to pull from.
   You can compose via natural-language chat or the CRUD API directly. The user describes
   structure in **bars and beats** and the system does the timing arithmetic — see
   [beats-and-bars](beats-and-bars.md).
6. **Build, poll & download** — submit the komposition for rendering. Poll the job status
   until it succeeds, then download the finished `.mp4` from the outputs endpoint.

## Environments

The production frontend and API live at `https://ai.makeshitapp.com`; the API is path-routed
under `/api/*`.

## Quick health check

```bash
curl https://ai.makeshitapp.com/api/health
# → { "status": "healthy", "version": "2.0-typescript-full", "timestamp": "..." }
```

No authentication required.
