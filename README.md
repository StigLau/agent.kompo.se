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

## Quickstart

### Install

The `@kompo/kli` npm package is not yet published. Clone and install locally:

```bash
git clone https://github.com/StigLau/agent.kompo.se.git
cd agent.kompo.se
bun install
```

Bun is the only supported runtime. The CLI entry point is `src/cli.ts` — run it directly with `bun src/cli.ts <command>`. (When published, the binary name will be `kli`.)

### First commands (no login needed when public discovery is healthy)

```bash
bun src/cli.ts help                # Full command reference
bun src/cli.ts --env test health   # Check API health and KCP discovery
bun src/cli.ts --env test tools    # Fetch the public API tools manifest
bun src/cli.ts --env test auth/status
bun src/cli.ts init                # Fetch discovery and write AGENTS.md
```

`health` reports API availability and KCP discovery as separate summaries. It exits non-zero when the API itself is unavailable; a degraded KCP summary means discovery is incomplete, but the service may still be partly functional. `tools` and `init` are public bootstrap operations; an HTTP 401 from `/api/tools` is a deployment contract failure, not a prompt to paste credentials into a command.

`kli init` fetches the knowledge manifest and the API tools manifest, checks auth status, and writes an agent-readable `AGENTS.md` project context file in the current directory. If any discovery step fails — the tools manifest, the knowledge manifest, or a manifest with 0 units — `kli init` exits non-zero and writes no file; pass `--allow-partial` to write the context file anyway with a prominent warning banner marking it incomplete.

### Environments

Use `--env` to target a deployment. The default is `prod`. The `KOMPO_ENV` environment variable overrides the default; the `--env` flag overrides both.

| Env | API base URL |
|-----|-------------|
| `prod` | `https://ai.makeshitapp.com` |
| `test` | `https://api.test.ai.makeshitapp.com` |
| `sandbox-use2` | `https://use2.sandbox.makeshitapp.com` |
| `sandbox-eun1` | `https://eun1.sandbox.makeshitapp.com` |

### Login

KLI uses a PKCE paste-back login flow — open a browser, log in, paste the callback URL back into the terminal:

```bash
bun src/cli.ts auth/url                         # Print a login URL
# Open the URL in a browser and log in.
# After login, copy the full address-bar URL.
bun src/cli.ts auth/complete "<callback-url>"   # Paste the callback URL
```

Tokens are stored in `~/.kompo/auth-<env>.json` with permission `0600`. Run `bun src/cli.ts auth/status` to check current login state and token expiry.

### Testing

**Unit tests:**

```bash
bun test tests/
```

**Contract tests** exercise the real CLI against the deployed test environment:

```bash
bun run contract:public  # No credentials required — health, tools, env checks
bun run contract:auth    # Authenticated gate — refuses to pass without valid tokens
```

`contract:auth` requires a valid token store at `~/.kompo/auth-test.json` (created by `auth/url` + `auth/complete` with `--env test`). Both suites target the `test` environment.

Run all contract tests with `bun run test:contract`.

## Status

Early scaffold. Vision and roadmap: [issue #1](https://github.com/StigLau/agent.kompo.se/issues/1).

## License

MIT
