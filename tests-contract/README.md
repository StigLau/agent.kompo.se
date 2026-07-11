# Contract tests

Contract tests exercise the real `kli` CLI against the deployed kompo.ai **test** environment. They spawn the CLI as a subprocess and assert on exit codes and output shape — no internal imports, no mocking.

The suite is split into two independent entry points:

| Script | What it covers | Auth required |
|---|---|---|
| `contract:public` | Health, `/api/tools`, bogus-env | No |
| `contract:auth` | Kompositions, library, jobs, outputs (plus mutating/full tiers) | Yes |

## Prerequisites

1. **Invitation account** — you must have an account on the kompo.ai test environment (`https://test.ai.makeshitapp.com`).
2. **Auth token store** — run these commands once to log in:

   ```bash
   kli --env test auth/url     # prints a login URL
   kli --env test auth/complete "<pasted-callback-url>"
   ```

   This creates `~/.kompo/auth-test.json`. The auth gate detects this file automatically.

## Running the tests

### Public gate (no credentials needed)

```bash
bun run contract:public
```

Runs health, `/api/tools` manifest, and bogus-env checks. Always runs in full. **The `/api/tools` test will FAIL (non-zero exit) if the server returns 401** — this is correct and desired: `/api/tools` is a public bootstrap endpoint that must never require authentication. A red result here indicates a server-side contract breach, not a missing-login problem.

### Authenticated gate (credentials required)

```bash
bun run contract:auth
```

**When credentials are missing or expired, this script exits non-zero and prints "GATE DID NOT RUN"** with the reason. Silent green skips are removed — a missing-credentials result is deliberately noisy so it cannot be mistaken for full coverage.

When auth is present, all read-only tests (kompositions, library, jobs, outputs) run unconditionally.

### Mutating tier (creates real data)

```bash
KOMPO_CONTRACT_MUTATING=1 bun run contract:auth
```

> ⚠ **WARNING** — the mutating tier creates real data in the test environment. It uploads a tiny generated WAV file and triggers the full analysis pipeline (presigned S3 upload → processing → analysis job). This data persists in your test account.

### Full tier (render compute)

For the complete compose → build → poll → stream flow, additionally set
`KOMPO_CONTRACT_FULL=1` and `KOMPO_CONTRACT_KOMPOSITION_FILE` to a valid local
`.v3.kompo.md` fixture that references the account's promoted Kilde. This tier is
not run by default because it consumes render compute.

## Isolation from unit tests

Contract tests live in `tests-contract/` at the repo root, **not** under `tests/`. The default `bun test tests/` runs unit tests only and stays fast. Use the contract scripts above for contract tests.
