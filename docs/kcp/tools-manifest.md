# Tools Manifest

The tools manifest is a machine-readable description of every callable API operation:
HTTP method, path, input schema, and response shape. It is the canonical reference for
what the kompo.ai API accepts and returns.

The manifest is served at the tools discovery endpoint:

- **Production**: `https://api.ai.makeshitapp.com/api/tools`
- **Test**: `https://api.test.ai.makeshitapp.com/api/tools`

Agents should
fetch this to build a complete, typed picture of available operations without needing
to scrape documentation.

No authentication required — this endpoint exists for bootstrap discovery. All other API
endpoints require an `Authorization: Bearer <token>` header (see [authentication](authentication.md)).

## Key endpoint groups

The tools manifest describes operations across these groups:

| Group | Prefix |
|-------|--------|
| Health | `GET /api/health` |
| Chat | `POST /api/chat`, `POST /api/multimedia/chat` |
| Kompositions | `GET/POST/PUT/DELETE /api/kompositions` |
| Sources (kilder) | `GET/POST /api/kompositions/sources` |
| Files | `POST /api/upload/*`, `GET /api/files/user`, `DELETE /api/files/{id}` |
| Generation | `POST /api/generate-image`, `POST /api/multimedia/tasks` |
| Staging | `GET /api/multimedia/staging`, `POST /api/multimedia/promote`, `GET /api/multimedia/tasks/{taskId}` |
| Video build | `POST /api/create-video-from-komposition`, `POST /api/jobs` |
| Jobs | `GET/DELETE /api/jobs/*`, `GET /api/jobs` |
| Status | `GET /api/video/status/{jobId}`, `GET /api/jobs/{jobId}/status` |
| Outputs | `GET /api/outputs` |
| Library | `GET /api/library/search`, `GET /api/library/komposition/{id}/multimedia`, `POST /api/library/prune` |
| Chat messages | `GET/POST/DELETE /api/chat-messages/*` |
