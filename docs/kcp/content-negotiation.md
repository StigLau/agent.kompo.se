# Content Negotiation

Kompo.ai endpoints return JSON by default. To get **LLM-optimized markdown responses**
instead, set the `Accept` header:

```
Accept: text/markdown
```

## Supported endpoints

Markdown negotiation is endpoint-specific. These endpoints are verified to return formatted
markdown for `Accept: text/markdown`:

| Endpoint | Markdown response |
|----------|-------------------|
| `GET /api/kompositions` | Komposition list as formatted markdown |
| `GET /api/kompositions/{id}` | Full komposition content as markdown |
| `GET /api/files/user` | File listing as formatted markdown |
| `GET /api/outputs` | Output listing as formatted markdown |
| `POST /api/multimedia/chat` | Chat response as markdown |
| `GET /api/multimedia/staging` | Staging file listing as markdown |

Some endpoints return JSON even when markdown is requested. In particular, deployed
`GET /api/jobs` currently returns JSON; consumers must accept that documented live behavior
rather than assume every `GET` endpoint negotiates markdown.

## Response headers

When markdown is requested and returned, the response includes:

```
Content-Type: text/markdown; charset=utf-8
Vary: Accept
```

## Token savings

Markdown responses omit JSON structural overhead (no nested objects, no metadata envelopes),
significantly reducing token consumption when ingested by an LLM.
