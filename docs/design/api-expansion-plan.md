# Public API and agent expansion

Today the API covers projects (read), deployments (read, deploy, redeploy, cancel, rollback), runtime logs, domains (read) and server usage. The dashboard can do much more. This plan adds what an AI agent or script plausibly needs, and keeps the exclusions that protect the container.

## Stays excluded (browser only)
- Terminal and file changes (the shell and writes into the app).
- Removing leftovers on the container.
- Container permission switches.
- Token management, sessions, account deletion.

## Added

Each area gets its own scope. Read and write are separate, and anything that can reveal a secret never returns its value.

| Area | Endpoints | Scope |
| --- | --- | --- |
| Projects | `POST /projects` (create), `PATCH /projects/{id}` (settings: branch, commands, port, health path, auto-deploy), `DELETE /projects/{id}` | `projects:write` |
| Build output | `GET /deployments/{id}` (detail), `GET /deployments/{id}/logs` (build log lines) | `deployments:read` |
| Environment variables | `GET /projects/{id}/env` (names and targets only), `PUT /projects/{id}/env/{key}` (set; value write-only), `DELETE /projects/{id}/env/{key}` | `env:write` to change, `env:read` to list names |
| Domains | `POST /domains` (add, with the port and project), `POST /domains/{id}/verify` (DNS and app check), `DELETE /domains/{id}` | `domains:write` |
| Deploy hook | `POST /projects/{id}/hook/rotate` returns the new URL once; `DELETE` revokes | `deployments:write` |
| Notifications | `GET /projects/{id}/notify` (channel kind and events, never the URL), `POST /projects/{id}/notify/test` | `notifications:read` |
| Alerts | `GET /projects/{id}/alerts` (thresholds, channels, mute state, recent events) | `alerts:read` |
| Status page | `GET /projects/{id}/status-page` (published or not, the public URL) | `projects:read` |
| Analytics | `GET /projects/{id}/analytics?days=1..90` (totals, daily, top pages, top referrers) | `analytics:read` |
| Resources | `GET /servers/{id}/usage/history?hours=1..168` (server series), `GET /projects/{id}/resources` (per-project memory and CPU) | `resources:read` |
| Container | `GET /servers` (connected servers with status), `GET /servers/{id}/inventory` (read-only: projects, leftovers, listening ports) | `container:read` |
| Activity | `GET /activity?kind=&range=&limit=&cursor=` (the same filters and readable labels as the page; secrets hidden) | `activity:read` |

## Rules

- A token can read and change only what its scopes name, and only for its own user's projects, domains and servers (404 otherwise).
- Writes that change the running app (deploy, rollback, env changes, settings) are audited with the token id, the same way deploy triggers already are.
- Secret values (env values, hook URLs, notification URLs, token secrets) are never returned after they are set.
- The rate limits follow the existing buckets: reads 120 a minute, changes 30 a minute, a separate small bucket for anything that opens an SSH session.
- The OpenAPI document and the MCP tool list are generated from the same endpoint list, so they stay in step.
- Each new scope is shown on the Developer page with a plain label, and existing tokens keep their current scopes.

## Delivery

1. Server: new service functions in `api-v1.ts` (or split by area), routes, scopes in `api-tokens.ts`, audit labels for any new action names.
2. Generated docs: OpenAPI and MCP tools from the same list.
3. Tests: each endpoint's scope gate, ownership 404, secret values never returned, and that a token without a scope gets 403.
4. Developer page: the scope picker lists the new scopes.
