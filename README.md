# agent.kompo.se

**Make music videos with your LLM, from the terminal.** `kli` is the agent-first command-line client for [kompo.ai](https://ai.makeshitapp.com): you bring audio and footage plus an LLM agent, kompo.ai analyzes your media (BPM, beat grid, MusicDNA), and your agent composes a beat-timed *komposition* that the platform renders into a finished video. No web UI in the loop — the whole flow runs in your own project directory, and the service is self-describing via [KCP](https://github.com/StigLau/knowledge-context-protocol) so your agent can discover every operation on its own.

## The flows

1. **[Bootstrap](docs/kcp/tools-manifest.md)** — `kli init` fetches the knowledge manifest and writes agent-readable project context
2. **[Authenticate](docs/kcp/authentication.md)** — PKCE paste-back login, no cloud credentials needed (composing in step 5 additionally requires producer role — see `auth/status`)
3. **[Upload](docs/kcp/file-management.md)** — audio and video content
4. **[Analyze & tag](docs/kcp/media-analysis.md)** — metadata extraction (BPM, beat grid, MusicDNA) → tagged **Kilder** (source catalog entries)
5. **[Compose](docs/kcp/komposition-format.md)** — create kompositions from your kilder, written in beats, not milliseconds
6. **[Build](docs/kcp/video-build-workflow.md)** — render the video (async), poll, preview, iterate
7. **[Download](docs/kcp/outputs-workflow.md)** — fetch the finished production

## Quickstart

### Install

The `@kompo/kli` npm package is not yet published. Clone and install locally:

```bash
git clone https://github.com/StigLau/agent.kompo.se.git
cd agent.kompo.se
bun install
```

Bun is the only supported runtime. The CLI entry point is `src/cli.ts` — run it directly with `bun src/cli.ts <command>`, or use `bun run kli -- <command>`. (When published, the binary name will be `kli`.)

A small public `Makefile` provides the same safe shortcuts (`make help`). It deliberately contains no server deployment or operator commands.

### First commands (no login needed when public discovery is healthy)

```bash
bun src/cli.ts help                # Full command reference
bun src/cli.ts health               # Check API health and KCP discovery
bun src/cli.ts tools                # Fetch the public API tools manifest
bun src/cli.ts auth/status
bun src/cli.ts init                # Fetch discovery and write AGENTS.md
bun src/cli.ts komposition-template my-video.kompo.md  # Write a local skeleton
```

`health` reports API availability and KCP discovery as separate summaries. It exits non-zero when the API itself is unavailable; a degraded KCP summary means discovery is incomplete, but the service may still be partly functional. `tools` and `init` are public bootstrap operations; an HTTP 401 from `/api/tools` is a deployment contract failure, not a prompt to paste credentials into a command.

`kli init` fetches the knowledge manifest and the API tools manifest, checks auth status, and writes an agent-readable `AGENTS.md` project context file in the current directory. If any discovery step fails — the tools manifest, the knowledge manifest, or a manifest with 0 units — `kli init` exits non-zero and writes no file; pass `--allow-partial` to write the context file anyway with a prominent warning banner marking it incomplete.

`komposition-template` creates a local V1/V2 starting point only; replace its placeholder file IDs with your uploaded media IDs before loading it. For the exact format, use [komposition-format](docs/kcp/komposition-format.md) or [komposition-v3](docs/kcp/komposition-v3.md).

Full zero-to-first-video walkthrough: [docs/kcp/getting-started.md](docs/kcp/getting-started.md) — also served at https://agent.kompo.se/docs/kcp/getting-started.md.

### Environments

The default environment is production. `--env` and the `KOMPO_ENV` variable select others — `kli help` lists the known names; maintainers find the mapping in `src/api.ts` (`ENV_DEFAULTS`).

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

**Account access check** verifies the public discovery surface plus read-only authenticated
commands against both production and test. It never writes data or stores credentials:

```bash
bun run verify:access -- --public-only  # Public health + tools only
bun run verify:access -- --require-producer  # Also require login and a producer-capable role
# Equivalent: make verify-access ARGS='--public-only'
```

Contract tests run against a non-production environment and need a maintainer account — see [`tests-contract/README.md`](tests-contract/README.md).

## For LLM agents

`kli init` writes an `AGENTS.md` context file into your project — tools operations, knowledge units, auth status — sourced from the same discovery chain your agent could run itself: fetch [`knowledge.yaml`](knowledge.yaml) for the unit map, follow `path` into `docs/kcp/*.md` for the unit bodies, then fetch the API's own `/api/tools` manifest for typed operations. The same corpus is live at [agent.kompo.se](https://agent.kompo.se) for agents fetching over HTTP instead of from a clone. One thing worth knowing specifically here: the published `@kompo/kli` npm package ships `knowledge.yaml` and `docs/kcp/` inside the tarball, so once installed, an agent has the whole discovery corpus on local disk before making any network call.

## Status

Working client, pre-npm-publish. The end-to-end flow (upload → analyze → compose → render → verify) is validated by [`scenarios/first-video/`](scenarios/first-video/). Vision and roadmap: [issue #1](https://github.com/StigLau/agent.kompo.se/issues/1).

## License

MIT
