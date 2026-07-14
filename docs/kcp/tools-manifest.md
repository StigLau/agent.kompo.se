# Tools Manifest

The tools manifest is a machine-readable description of every callable API operation:
HTTP method, path, input schema, and response shape. It is the canonical reference for
what the kompo.ai API accepts and returns.

The manifest is served at the tools discovery endpoint:

- **Production**: `https://ai.makeshitapp.com/api/tools`
- **Test**: `https://api.test.ai.makeshitapp.com/api/tools`

Agents should
fetch this to build a complete, typed picture of available operations without needing
to scrape documentation.

This endpoint is a public, unauthenticated bootstrap contract. Most API operations
require an `Authorization: Bearer <token>` header; health and incident diagnostics are
also public (see [authentication](authentication.md)).

A 401 from `/api/tools` is a deployment contract failure, not a normal first-time-user
state. KLI may try a stored credential after a 401 as a compatibility fallback for an
already-authenticated user, but `kli tools` remains non-zero without credentials and
`kli init` fails closed when discovery is incomplete.

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
