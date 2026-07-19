# First-video scenario

Preconditions: Bun, `ffprobe` (from ffmpeg), the two calibrated audio files in
`media/`, and one-time human PKCE authentication for `sandbox-use2`.

## Operator-provisioned auth (alternative)

Instead of interactive PKCE login, an operator's internal tooling may
provision `~/.kompo/auth-<env>.json` directly with JSON in this shape:

```json
{"idToken":"...","accessToken":"...","refreshToken":"...","expiresAt":0}
```

The file must have mode `0600`, and `expiresAt` must be a millisecond epoch
timestamp. The scenario's auth stage accepts any valid token store regardless
of how it was provisioned.

Run the deterministic rails-mode scenario from the repository root:

```bash
bun scenarios/first-video/run.ts
```

It stops at the first failed stage and writes a redacted JSON and Markdown report
to `reports/`. Media and reports are deliberately gitignored.

For LLM mode, make a scratch project directory, hand the LLM
[`PLAYBOOK.md`](PLAYBOOK.md), and have it follow the commands exactly. Use the
same `fixtures.json` calibration data. Verify an output independently with:

```bash
bun scenarios/first-video/verify.ts output.mp4 --expect-duration <seconds> --tolerance 0.5 --resolution 1920x1080
```

The expected seconds are the sum of `beats × 60 / measured BPM` for the two
ordered segments. Inspect the rails-mode report as the audit trail.
