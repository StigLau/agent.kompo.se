# agent.kompo.se

**Muse, LYTD and KLI — in a box.** The agent-first client for [kompo.ai](https://ai.makeshitapp.com): tools for efficient creation of music videos where *your* LLM augments *you*, from the CLI, in the context of your music/video project.

Your agent authenticates against the kompo.ai service (your persisted kompositions, audio/video content, semantic graph, video builds) — no web UI required. The system is self-describing via [KCP](https://github.com/StigLau/knowledge-context-protocol): an agent discovers the domain, the available tools, and the server-side API, then works your project directly.

## The flows

1. **Bootstrap** — `kli init` fetches the knowledge manifest and writes agent-readable project context
2. **Authenticate** — PKCE paste-back login, no cloud credentials needed
3. **Upload** — audio and video content
4. **Analyze & tag** — metadata extraction (BPM, beat grid, MusicDNA) → tagged **Kilder** (source catalog entries)
5. **Compose** — create kompositions from your kilder, written in beats, not milliseconds
6. **Build** — render the video (async), poll, preview, iterate
7. **Download** — fetch the finished production

## Status

Early scaffold. Vision and roadmap: [issue #1](https://github.com/StigLau/agent.kompo.se/issues/1).

## License

MIT
