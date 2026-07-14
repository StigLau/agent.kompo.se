# Authentication

All authenticated endpoints require `Authorization: Bearer <token>` — a JWT identity token
obtained through AWS Cognito.

## Account access

Kompo.ai accounts are **invitation-only**. An existing user must invite you before you can
create an account.

## Login flow (PKCE paste-back via kli CLI)

Use the `@kompo/kli` CLI to authenticate:

```bash
# Step 1: get the login URL (PKCE code-challenge flow)
kli auth/url
# → Opens browser or prints a URL. Complete login in browser.

# Step 2: paste the callback URL (containing the authorization code)
kli auth/complete "<callback-url-from-browser>"
# → Exchanges code for JWT tokens. Stores them locally.

# Step 3: (automatic) token refresh on each invocation
# On every CLI command, kli checks if the stored idToken has more than
# a 30-second buffer remaining. If it does — used directly. If it's
# close to expiry — kli auto-refreshes using the stored refresh token
# before making the API call. If refresh fails — you are told to
# re-login.
#
# NOTE: The PKCE login session (auth/url → auth/complete) expires
# after 1 hour. You must complete the login within that window.
```

## Token format

The token is a standard Cognito JWT identity token (idToken). Pass it in the
`Authorization` header:

```
Authorization: Bearer <id-token>
```

## Token refresh

Token validity is checked on **each CLI invocation** (not via a background watcher):

1. If the stored idToken has more than a **30-second buffer** remaining → used directly.
2. If the token is within 30 seconds of expiry → the CLI auto-refreshes using the stored
   refresh token before making the API call.
3. If refresh fails (e.g., refresh token expired or revoked) → you are told to re-login
   via `kli auth/url` → `kli auth/complete`.

You can also refresh manually at any time:

```bash
kli auth/refresh
# → Uses the stored refresh token to obtain a new idToken.
```

## Environments

Each environment (production and test) has its **own Cognito user pool**. You must log in
separately for each environment using the `--env` flag:

```bash
kli --env prod auth/url      # Log in to production
kli --env test auth/url      # Log in to test (separate user pool)
```

Tokens are stored per-environment in `~/.kompo/auth-<env>.json`.
