---
name: public-client-contracts
description: Build or review @kompo/kli, its public KCP discovery content, CLI commands, and deployed API contract tests. Activate for endpoint changes, KCP/docs drift, kli init/bootstrap, PKCE/auth boundaries, or client-to-service compatibility.
last_verified: 2026-07-11
---

# Public Client Contracts

`agent.kompo.se` is the public, agent-first **client** for kompo.ai. It owns the
`@kompo/kli` CLI, local project onboarding, PKCE token handling, markdown presentation, and
curated public KCP content. The deployed kompo.ai service owns endpoint paths, wire schemas,
authorization policy, jobs, rendering, and operations.

## The boundary

- Verify and mirror the deployed wire contract; never invent, rename, or improve it.
- `knowledge.yaml` and `docs/kcp/` describe only public, deployed behavior. Rewrite material
  rather than copying server-side docs, tests, skills, credentials, or operational details.
- A client fallback may preserve compatibility without changing the protocol (for example,
  retrying a discovery request with an already-stored token). It must not emulate or silently
  replace a server endpoint.
- Keep `health`, `tools`, `incident-download`, and `incident-replay` usable before login.
- Preserve PKCE-only login: callback `state` verification is mandatory; do not add password or
  credential fallbacks.

## Contract-change protocol

Before changing a CLI request, response parser, command help, KCP document, or public page:

1. Read `knowledge.yaml` and the relevant `docs/kcp/` unit.
2. Locate every CLI call site, formatter, test, README/Page mention, and manifest entry.
3. Verify permitted deployed behavior; redact tokens and account data from output.
4. Change code, docs, and focused tests together.
5. Search for stale endpoint paths, command names, and API domains across `src/`, `docs/`,
   `knowledge.yaml`, `README.md`, and `site/`.

Use exact server field names, request envelopes, status values, and endpoint paths. Presentation
formatting may be client-specific, but wire-level translation requires an observed contract.

## Contract-test tiers

- **Public/read-only:** health, discovery, and invalid-argument behavior. A promised public
  endpoint returning an unexpected error is a failure, not a passing soft assertion.
- **Authenticated/read-only:** list/get commands; local runs may skip when a valid token is
  absent.
- **Mutating opt-in:** upload, analysis, and source/Kilde creation. Require explicit opt-in and
  isolated data.
- **Full opt-in:** compose → build → poll → stream/download. Require a valid fixture and state
  its compute cost.

A CI job described as a full compatibility gate must fail its preflight if required credentials
or fixtures are absent, expired, or unusable. Each asserted stage must consume a real output
from the prior stage; pre-existing fixtures do not prove an upload-to-render chain.

## Public-repo checks

Before committing, run:

```bash
bun test tests/
bunx tsc --noEmit
bun pm pack --dry-run
git diff --check
```

Review changed source, docs, PR text, and artifact contents for credentials, test-account data,
private URLs, internal issue/process references, and operational details. This repository is
public: omit them rather than redacting them after the fact.
