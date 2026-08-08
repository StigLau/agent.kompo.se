---
name: kli-client-testing
description: Run or delegate safe read-only KLI client tests in this public repository. Use when validating CLI behavior, public/authenticated read contracts, or Pi delegation without uploads, renders, invitation claims, or production mutations.
allowed-tools: read grep find ls bash
---

# KLI client testing

This repository is public. Read `CLAUDE.md` before testing and preserve its public-repo,
wire-contract, and PKCE invariants.

## Read-only gates

Run these directly when appropriate:

```bash
bun test tests/
bun run contract:public
bun scripts/verify-access.ts --env test --require-producer
bun run contract:auth
```

`contract:auth` skips its mutating tiers unless the caller explicitly sets a mutating gate and
refuses to run if the local test token is expired. `verify-access` may use an existing local token
and refresh it when near expiry. Neither command is credential-free.

## Pi-delegated test runner

Use the project launcher for a bounded Pi delegate:

```bash
make pi-kli-readonly ARGS='Run contract-public, report pass/fail counts and confidence.'
```

The launcher starts Pi with built-in tools disabled and exposes only
`kli_readonly_test`. That tool can run exactly four actions:

- `unit` — `bun test tests/`
- `contract-public` — public deployed contract suite
- `verify-test` — authenticated, read-only test-environment access verification
- `contract-auth` — authenticated contract suite with mutating tiers forcibly disabled

Ask the delegate to run one or more named actions and return command, pass/fail/skip counts,
exit status, and confidence. The controller must independently rerun and interpret any result
used for a code or documentation decision.

## Never delegate or run without explicit approval

- Any production mutation.
- Test/sandbox uploads, promotion, invitation acceptance, komposition loading, chat, or render.
- `KOMPO_CONTRACT_MUTATING=1`, `KOMPO_CONTRACT_FULL=1`, or a full first-video scenario.
- Credential-file inspection, new login, token output, arbitrary shell commands, git mutations,
  or access to another repository.

For approved mutating work, make the environment and exact command explicit, then verify the
result separately.
