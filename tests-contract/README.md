# Contract tests

Contract tests exercise the real `kli` CLI against the deployed kompo.ai **test** environment. They spawn the CLI as a subprocess and assert on exit codes and output shape — no internal imports, no mocking.

## Prerequisites

1. **Invitation account** — you must have an account on the kompo.ai test environment (`https://test.ai.makeshitapp.com`).
2. **Auth token store** — run these commands once to log in:

   ```bash
   kli --env test auth/url     # prints a login URL
   kli --env test auth/complete "<pasted-callback-url>"
   ```

   This creates `~/.kompo/auth-test.json`. The test suite detects this file automatically.

## Running the tests

### Default tier (read-only, no side effects)

```bash
bun test tests-contract/
```

This runs health checks, tool manifest inspection, and read-only list commands (kompositions, library, jobs, outputs). No data is created or modified.

Tests that require auth are automatically **skipped** when no token store is detected — the suite will never fail because of missing credentials.

### Mutating tier (creates real data)

```bash
KOMPO_CONTRACT_MUTATING=1 bun test tests-contract/
```

> ⚠ **WARNING** — the mutating tier creates real data in the test environment. It uploads a tiny generated WAV file and triggers the full analysis pipeline (presigned S3 upload → processing → analysis job). This data persists in your test account.

For the complete compose → build → poll → stream flow, additionally set
`KOMPO_CONTRACT_FULL=1` and `KOMPO_CONTRACT_KOMPOSITION_FILE` to a valid local
`.v3.kompo.md` fixture that references the account's promoted Kilde. This tier is
not run by default because it consumes render compute.

CI runs the full gate when the repository secrets `KOMPO_TEST_AUTH_JSON` (the
contents of the test auth store) and `KOMPO_TEST_KOMPOSITION` (a valid fixture)
are configured. These secrets are written only to the runner and are never
committed or printed.

Mutating tests are skipped by default — they only run when the `KOMPO_CONTRACT_MUTATING=1` environment variable is explicitly set.

## Isolation from unit tests

Contract tests live in `tests-contract/` at the repo root, **not** under `tests/`. The default `bun test tests/` runs unit tests only and stays fast. Use the `test:contract` package script for contract tests:

```bash
bun run test:contract
```
