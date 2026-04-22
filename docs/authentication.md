# Authentication

modbus2mqtt supports three authentication modes. The active mode is decided at startup based on environment variables — there is no UI toggle.

## Mode resolution (first match wins)

1. **Home Assistant add-on** — `HASSIO_TOKEN` env var is present (set automatically by the supervisor). Access is granted based on the source IP (`127.0.0.1`, `::1`, `172.30.32.*`, `172.30.33.*`); no user login is needed.
2. **OIDC / OpenID Connect** — `OIDC_ENABLED=true` and the other `OIDC_*` variables are set. Users log in through the configured OIDC provider; the server stores a HttpOnly session cookie. See [OIDC setup](#oidc-setup) below.
3. **Open access (default)** — neither of the above. All API endpoints are reachable without authentication. Intended for development, trusted LANs, or deployments behind another auth-enforcing proxy.

The previous built-in username/password login (bcrypt + JWT in `sessionStorage`) and the `noAuthentication` YAML flag have been removed. If you upgrade an older standalone install, remove `username` / `password` / `noAuthentication` from `secrets.yaml` / `modbus2mqtt.yaml` — they are ignored.

## OIDC setup

Works with any OIDC-compliant provider: Keycloak, Zitadel, Auth0, Authentik, Okta, Google, GitLab etc.

### 1. Register an OIDC application at your provider

- **Type**: Confidential Web App (Authorization Code flow with client secret)
- **Redirect URI**: `https://<host>:<port>/api/auth/callback`
  - For local dev with the default HTTPS port: `https://localhost:3443/api/auth/callback`
  - For Docker/HA behind a reverse proxy: use the externally-reachable URL
- **Post-logout redirect URI**: `https://<host>:<port>/` (optional — only used if the provider supports RP-initiated logout)
- **Scopes**: `openid email profile`

Your provider returns a `client_id` and `client_secret` — keep the secret safe, it is only shown once.

### 2. Configure modbus2mqtt

Set these environment variables before starting the server:

| Variable | Purpose | Example |
|---|---|---|
| `OIDC_ENABLED` | Switch OIDC on | `true` |
| `OIDC_ISSUER_URL` | Your provider's issuer URL | `https://auth.example.com` |
| `OIDC_CLIENT_ID` | From step 1 | `…` |
| `OIDC_CLIENT_SECRET` | From step 1 | `…` |
| `OIDC_CALLBACK_URL` | Full callback URL (must match step 1) | `https://modbus2mqtt.example.com/api/auth/callback` |
| `OIDC_SESSION_SECRET` | 32+ random chars used to sign session cookies | `openssl rand -hex 32` |

If `OIDC_SESSION_SECRET` is omitted, modbus2mqtt falls back to the local `secrets.txt` in the SSL directory. That works but means the secret is file-based — set the env var explicitly for reproducible deploys.

### 3. Verify

Open the web UI; you should be redirected to the provider's login page. After a successful login, the top-right of the header shows your username and a logout button. The backend logs the session start:

```
info oidc: [oidc] OIDC authentication: ENABLED — issuer=… client_id=… callback=…
info oidc: [oidc] User logged in: <name or sub>
```

## Docker / Home Assistant / Proxmox specifics

- **Docker** — pass the variables via `-e OIDC_ENABLED=true -e OIDC_ISSUER_URL=…` or an env file. See [installation-docker.md](installation-docker.md).
- **Home Assistant add-on** — OIDC is **not** used inside the add-on; the supervisor handles authentication. Leave the `OIDC_*` variables unset.
- **Proxmox LXC** — the [Proxmox install guide](installation-proxmox.md) runs modbus2mqtt as a systemd unit; put the `OIDC_*` lines into the unit's `EnvironmentFile=` directive.

## Zitadel dev helper

For local development against a Zitadel instance there is a helper at [scripts/create-zitadel-dev-oidc-app.sh](../scripts/create-zitadel-dev-oidc-app.sh) that:

- fetches the admin PAT from the PVE host (or reads `ADMIN_PAT` env)
- creates the project `modbus2mqtt` if missing and ensures the `admin` role exists
- creates the OIDC web app `modbus2mqtt-dev` with callback `https://localhost:3443/api/auth/callback`
- optionally creates a test user (`test` / `Test123!`) with `ORG_OWNER` + project `admin` grant
- prints a paste-ready VS Code launch config entry

Usage:

```sh
./scripts/create-zitadel-dev-oidc-app.sh                      # defaults
DEV_USERNAME=volkmar DEV_EMAIL=volkmar@example.com \
  ./scripts/create-zitadel-dev-oidc-app.sh                    # custom user
DEV_USERNAME= ./scripts/create-zitadel-dev-oidc-app.sh        # skip user creation
```

Re-runs are idempotent. The `client_secret` is only retrievable at creation time — to rotate it, delete the app in the Zitadel console and re-run the script.

## HTTPS and redirect_uri pitfalls

If TLS certificates (`fullchain.pem`, `privkey.pem`) are present in the SSL directory, modbus2mqtt serves HTTPS on port `3443` and redirects plain HTTP from port `3000` to HTTPS (301). When that redirect is active, the OIDC callback **must** be registered as `https://…:3443/api/auth/callback` at the provider — otherwise the provider rejects the token exchange with `invalid_grant: redirect_uri does not correspond`.

## Troubleshooting

- **Endless redirect loop to the provider** — the cookie is being dropped. Check that `OIDC_CALLBACK_URL` matches the scheme (`http`/`https`) and host your browser is actually using; cookies set on one origin are not sent to another.
- **`redirect_uri does not correspond`** — the URL registered at the provider differs from `OIDC_CALLBACK_URL`. Adjust one of them so they match exactly, including scheme and port.
- **`invalid_client`** — `OIDC_CLIENT_SECRET` is wrong or the app was deleted. Rotate the secret and update the env var.
- **Logs contain `[oidc] Callback error`** — modbus2mqtt prints structured context (active config + request info + serialized error cause) immediately before the error line. Look at the `cause` field for the provider's explanation.
