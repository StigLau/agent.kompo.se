# Authentication

All authenticated endpoints require `Authorization: Bearer <token>` — a JWT identity token
obtained through AWS Cognito.

## Account access

Kompo.ai accounts are **invitation-only**. An existing user must invite you before you can
create an account.

## Roles

The ID token carries a `cognito:groups` claim — the role(s) your account was invited with
(e.g. `viewer`, `producer`, `admin`). Every authenticated account can upload media and
request analysis regardless of role, but **creating a komposition** (`POST /api/kompositions`,
and the `kli workstate/load-file` step that leads to it) requires **producer** role — role
below that gets a `401 InsufficientPermissions`. `kli auth/status` and the `auth/complete`
output show your role(s) and warn if you're below producer. Role is assigned by whoever
invites you and isn't self-service — ask them to re-invite you with producer role, or (if
they're an admin) have them grant it directly.

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

Each deployment environment has its **own Cognito user pool**, so login is per-environment
using the `--env` flag (default `prod`):

```bash
kli auth/url                 # Log in to the default environment (production)
kli --env <env> auth/url     # Log in to a different environment
```

Tokens are stored per-environment in `~/.kompo/auth-<env>.json`.
