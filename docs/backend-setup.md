# Backend setup

How to run Nest Deploy for real: what to register, what to configure, and how the pieces fit.

## Quick start (local, no accounts needed)

```bash
cd web
pnpm install
pnpm setup        # writes .env.local with a fresh APP_SECRET and DEV_LOGIN=1
pnpm dev          # http://localhost:3000, with the deployment worker built in
```

Open the app and use the **Development sign-in** form. It only appears when `DEV_LOGIN=1` and the build is not a production build.

To try deploys without a Nest account, run a stand-in container:

```bash
pnpm fake-nest    # in a second terminal
```

Then add these to `.env.local` (the script prints the exact `UNIT_DIR`):

```
NEST_HOST=127.0.0.1
NEST_PORT=2222
UNIT_DIR=<printed by pnpm fake-nest>
```

`fake-nest` accepts the public key of every server saved in your local database and runs the commands on Linux (WSL on Windows). It is a development tool, never a substitute for a real Nest container.

## Environment variables

| Name | Required | Purpose |
| --- | --- | --- |
| `APP_SECRET` | yes | 32+ characters. Encrypts SSH private keys and environment variables. **Back it up.** Losing it makes every stored key unreadable, and changing it does the same. |
| `APP_URL` | yes | Public URL of the site, used for OAuth redirects. |
| `DATABASE_URL` | no | SQLite file, default `file:./data/nest-deploy.db`. |
| `HACKCLUB_CLIENT_ID`, `HACKCLUB_CLIENT_SECRET` | for login | From a Hack Club Auth app. |
| `DEV_LOGIN` | no | `1` allows the fake sign-in outside production builds. |
| `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` | for private repos and push-to-deploy | From a GitHub App. The private key may use `\n` escapes. |
| `RUN_WORKER` | no | `1` runs the deployment queue inside the web process. `0` means run `pnpm worker` yourself, for example on another machine. |
| `WORKER_CONCURRENCY` | no | Parallel deployments, default 2. One project never builds twice at once. |
| `BUILD_RUNNER` | no | `docker` (default) or `local`. |
| `BUILD_IMAGE_NODE`, `BUILD_IMAGE_PYTHON` | no | Images for the build sandbox. |
| `BUILD_TIMEOUT_SECONDS` | no | Default 900. |
| `NEST_HOST`, `NEST_PORT` | no | Defaults `hackclub.app` and `22`. Only change for testing. |
| `UNIT_DIR` | no | Where systemd units are written on the container. Default `/etc/systemd/system`. |

## Hack Club Auth

1. Open <https://auth.hackclub.com/developer/apps> and create an app.
2. Redirect URI: `<APP_URL>/api/auth/callback`.
3. Put the client id and secret in `HACKCLUB_CLIENT_ID` and `HACKCLUB_CLIENT_SECRET`.

New apps start as `community_untrusted`, so users see a warning banner during consent. After the app is finished, ask Nora to promote it to `community_trusted`. The app asks for `openid`, `profile` and `email` only. It never receives anything that grants access to a Nest container.

Unverified: the token endpoint is called with a form-encoded body, and PKCE parameters are sent. The Hack Club docs show JSON-style examples and do not mention PKCE. If login fails at the token step, check this first.

## GitHub App

Needed for private repositories, the repository picker, and deploying on every push. Public repositories can be deployed without it by pasting a URL.

Create an app at <https://github.com/settings/apps/new>:

- **Homepage URL:** your `APP_URL`.
- **Callback URL:** `<APP_URL>/api/github/callback`.
- **Setup URL:** `<APP_URL>/api/github/callback`, with "Redirect on update" on.
- **Request user authorization (OAuth) during installation:** on. This is how Nest Deploy learns which installations belong to which user.
- **Webhook URL:** `<APP_URL>/api/webhooks/github`, with a random secret saved as `GITHUB_WEBHOOK_SECRET`.
- **Repository permissions:** Contents: read-only. Metadata: read-only.
- **Subscribe to events:** Push. (Installation events arrive without a subscription.)

Generate a private key and put the PEM in `GITHUB_APP_PRIVATE_KEY`. Copy the App ID, slug, client id and client secret into the matching variables.

A pushed branch that matches a project's production branch deploys to production. Any other branch builds a preview on its own port; only the newest two previews are kept.

## What runs where

```
browser ──> Next.js app ──> SQLite          (users, servers, projects, logs, jobs)
                │
                └─ queue ──> worker ──> git clone ──> build sandbox (Docker)
                                  │
                                  └──────── SSH ──> Nest container: unpack, systemd, health check
```

- The **worker** builds on the machine it runs on, never on Nest, so builds do not use your container's 2 GB of RAM.
- A **release** is a folder `~/.nest-deploy/<project>/releases/<id>` on the container. `current` is a symlink to the live one. A deploy unpacks, installs production dependencies, writes the service file, points `current` at the new release, restarts, and waits for the port to answer. If it does not, the symlink is switched back and the old release is restarted.
- **Rollback** switches `current` back to an earlier release that is still on disk. The newest five production releases are kept.
- **Previews** run as `nd-<project>-pv-<id>.service` on ports 20000 to 29999. Nest maps domains to ports on its own dashboard with no API, so mapping a preview to a domain is manual.
- Everything Nest Deploy puts on a container lives under `~/.nest-deploy` and in `nd-*.service` units. Removing those removes it.

## Security notes

- **Build sandbox.** `BUILD_RUNNER=docker` runs install and build in a container with 2 GB of memory, 2 CPUs, no added capabilities and `no-new-privileges`. `local` runs user code directly on the host and is for development only; the worker warns at startup.
- **Network from builds.** Builds have normal outbound network access, because installing dependencies needs it. Run the worker on a machine with nothing private reachable from it.
- **SSH keys.** One ed25519 key per server. Stored sealed with AES-256-GCM, bound to the server's id. The host key is pinned on first connection, and a change aborts the connection before anything is sent.
- **Root.** SSH into Nest lands in a root shell in the user's own container, so this key is effectively root there. The Connect page says so before the user adds it. Removing the key in the Nest dashboard revokes access.
- **Sessions.** Random tokens in an httpOnly, SameSite=Lax cookie. Only a hash is stored. Writes also check the `Origin` header.
- **Webhooks.** Accepted only with a valid HMAC signature over the raw body.
- **Deploy hooks.** `POST /api/hooks/deploy/:token` starts a deployment for scripts and CI. The token is shown once; only its SHA-256 is stored, so a copy of the database cannot be turned into working URLs. Creating a new one replaces the old one. A call is refused with 409 while a deployment for that project is still queued or running, and an optional `{ "branch" }` body is validated like a branch name. Unknown tokens answer exactly like missing ones.
- **Notifications.** The project's Discord or Slack webhook URL is sealed at rest and never returned by the API. Because the server posts to it, only `https` URLs on `discord.com`, `discordapp.com` (including `ptb.` and `canary.`) and `hooks.slack.com` with those services' own path shapes are accepted: no ports, credentials or query strings. Redirects are refused and the request times out after 5 seconds, so it cannot be used to reach internal addresses. A failing webhook is logged and never affects the deployment.
- **Repositories.** Only `https://github.com/...` URLs can be cloned.
- **Logs.** Environment variable values and tokens are masked before log lines are stored.

## HTTP API

All routes except auth and the webhook need a signed-in session. Errors are `{ "error": { "code", "message" } }`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/me` | Current user |
| `GET /api/servers`, `POST /api/servers` | List, or create a server (returns the public key to paste) |
| `GET /api/servers/:id`, `DELETE` | One server, or disconnect |
| `POST /api/servers/:id/test` | Connect, pin the host key, probe the container |
| `POST /api/servers/:id/rotate-key` | New key |
| `GET /api/servers/:id/usage` | Live CPU, memory and disk |
| `GET /api/projects`, `POST` | List, or create |
| `GET /api/projects/:id`, `PATCH`, `DELETE ?remote=1&data=1` | Read, update, delete (optionally also from the server) |
| `POST /api/projects/:id/deploy` | Queue a deployment `{ branch? }` |
| `POST /api/projects/:id/hook`, `DELETE` | Create (or replace) the deploy hook, which returns its URL once, or revoke it |
| `PUT /api/projects/:id/notify` `{ url, on }`, `DELETE`, `POST .../notify/test` | Set, clear or test the Discord or Slack notification |
| `GET /api/projects/:id/env`, `POST`, `DELETE /api/projects/:id/env/:envId` | Environment variables (names only are returned) |
| `GET /api/projects/:id/runtime-logs?lines=` | Service output from journald |
| `GET /api/deployments?project=` | Deployments |
| `GET /api/deployments/:id`, `/logs?after=`, `/stream` | One deployment, its log, a live server-sent event stream |
| `POST /api/deployments/:id/redeploy`, `/rollback`, `/cancel` | Actions |
| `GET /api/domains`, `POST`, `DELETE /:id`, `POST /:id/verify` | Domain records and DNS check |
| `GET /api/github/installations`, `/repos?installation=` | GitHub state |
| `POST /api/webhooks/github` | GitHub webhook |
| `POST /api/hooks/deploy/:token` | Deploy hook (public, the token is the credential) `{ branch? }` |

## Tests

```bash
pnpm test
```

The suite includes a mock Nest container: an in-process SSH server that runs commands on real Linux. On Windows it uses the first WSL distro, because Git Bash cannot create real symlinks, which the release switch needs. Set `TEST_WSL_DISTRO` if yours is not called `Ubuntu`.

## Not verified against a real Nest container

These are assumptions that held in the mock and still need one run against `hackclub.app`:

- The bastion forwards plain exec channels (uploads use `cat`, not SFTP).
- The container runs systemd as PID 1 and SSH lands as root.
- Writing units to `/etc/systemd/system` and `systemctl restart` work for that user.
- Docker-based builds have not been run end to end on a machine with Docker. The build step is covered by running it with no build command.
