# agent.kompo.se — Agent Instructions

Public, agent-first client for [kompo.ai](https://ai.makeshitapp.com): the `@kompo/kli` CLI plus the public KCP discovery manifest. The end user's LLM drives music-video creation from the CLI, in the user's own project directory. Vision and decisions: [epic #1](https://github.com/StigLau/agent.kompo.se/issues/1).

## Quick commands

```bash
bun test tests/                    # unit tests — must be 0 fail before any commit
bun src/cli.ts help                # full command reference
bun src/cli.ts --env test health   # smoke against test env (no login needed)
```

Runtime is **Bun** (never npm/node). TypeScript, strict mode.

## Non-negotiable invariants

1. **This repo is PUBLIC.** Everything committed is world-readable. Never commit: credentials or tokens, internal kompo.ai knowledge units or ops runbooks, internal env/infra details (AWS accounts, stack names, aws-gate), internal issue-process references, test-account details. When curating content from kompo.ai, rewrite around internal material — see the exclusion pattern in PR #9.
2. **Wire contracts are owned by the kompo.ai server.** This is a pure client: never invent, rename, or "improve" API endpoints, request/response shapes, or the komposition format syntax. `knowledge.yaml` + `docs/kcp/` must describe the deployed API truthfully — verify claims against real behavior, don't hand-wave (the "5-minute refresh" incident: docs invented CLI behavior that code contradicted).
3. **PKCE-only auth.** No credential fallbacks (the internal USER_PASSWORD_AUTH path was deliberately stripped). PKCE `state` verification in `auth/complete` is a security control (login-CSRF) — never weaken it; bare authorization codes are rejected by design because a skippable state check is no check.
4. **Public commands stay public.** `health`, `tools`, `incident-download`, `incident-replay` must never require login (`GET /api/tools` exists for bootstrap discovery before auth).
5. **Zero runtime dependencies.** Adding one is an architecture decision, not a convenience.

## Terminology

- **kilde** (plural **kilder**): a metadata-tagged, reusable media source (audio/video/image) with segment definitions — was "source komposition" internally. Wire-level identifiers (`source-audio`, endpoint paths, JSON fields) are unchanged.
- **komposition**: the markdown document describing a music video, written in BPM/beats, never milliseconds. Format specs in `docs/kcp/komposition-format.md` / `komposition-v3.md` are wire contracts — they must match kompo.ai's parser exactly.

## Layout

```
src/cli.ts        entry + dispatch (--env flag, validated against ENV_DEFAULTS)
src/auth.ts       PKCE paste-back, token store ~/.kompo/auth-<env>.json (0o600)
src/api.ts        mdFetch/jsonFetch (markdown-first via Accept: text/markdown), env→URL
src/workstate.ts  local project working-state
src/formatters.ts exported, unit-tested markdown formatters
src/commands/     one module per command group
tests/            bun test; formatters + arg/env parsing + auth pure functions
knowledge.yaml    public KCP manifest (curated 14 units); bodies in docs/kcp/
```

## Relationship to kompo.ai

This repo is the **canonical home** of the public client (extract-don't-copy, epic #1). The internal source (`kompo.ai/webapp/e2e/helpers/kompo-kli.ts`) is scheduled to be replaced by this package in kompo.ai's e2e suite (Phase 2), then deleted (Phase 3). Until then: if the kompo.ai API changes, this client and `docs/kcp/` must be updated deliberately — nothing syncs automatically.

## Working process

- **Issue-based.** Every change traces to an issue; `ref #N` in commits (never "Closes #N" — issues are closed explicitly after verification).
- **Delegated implementation.** Development goes to pi (`opencode-go/deepseek-v4-pro`); cheap mechanical work to `deepseek-v4-flash`. The controller (Claude) writes briefs, never trusts worker reports unexecuted: re-run tests, read diffs, grep for leakage, run an out-of-context PR eval (fresh pi process reading the diff) before any PR is called ready.
- **Merges require Stig's explicit grant.** No auto-merge, no "this also looks ready".
- **Feature branches always**; squash-merge; delete branches after merge.

## For non-Claude harnesses

`AGENTS.md` points here. To understand the kompo.ai service domain itself (not this repo), start with `knowledge.yaml` and follow the units.
