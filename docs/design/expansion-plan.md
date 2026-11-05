# Expansion plan: existing features

Source: the list of gaps in the previous message. Each item is an expansion of a feature that already exists, not a new product area.

## Waves

Work is split by file ownership so agents never edit the same file in parallel. Schema changes (`web/src/server/db/schema.ts`, `web/drizzle/`) belong to one agent at a time.

### Wave 1 (parallel)

**A. Alerts (owns schema, monitor, notify, project alerts UI)**
- Configurable thresholds for disk and memory (default 90%), and CPU load share (default 90% of cores).
- Configurable down rule: consecutive failed checks before alerting (default 2), and an optional response-time limit.
- Per-project alert channels: choose which events go to the webhook (down, recovery, resource warnings, deploy results).
- Mute: pause all alerts for a project for 1 hour, 1 day, or until resumed.
- Alert history: what fired, when, and whether it recovered.
- Migration `0005_*`.

**B. Logs and deployments (no schema changes)**
- Logs: time range (last hour, 24 hours, 7 days where the journal has it), level filter (info, warn, error), and download as text.
- Deployments: select two deployments and compare commit, branch, duration, env and state side by side.
- Deployments: bulk actions on selected rows (cancel queued or running, and delete old previews).

**C. Domains and projects (no schema changes)**
- Domains: an "app answers" check that requests the domain over HTTPS and reports the status code, alongside the existing DNS check. Certificate status shown as "not verified yet" until the check passes.
- Projects: clone settings from another project on the same server (copies build and run settings and the root directory, never variables or secrets).
- Projects: monorepo help. When the root directory is set, show which package.json or lockfile it found, and offer a "build only when this folder changes" option on push.

### Wave 2 (after A commits its migration)

**D. Environment variables.** Per-branch scoping, bulk import from `.env` text, and a record of which variable names each deployment received (names only).

**E. Analytics and status.** Time-of-day view, per-page trend, excluding your own visits by a per-browser opt-out cookie set from the dashboard, and multi-service status pages.

**F. Notifications, activity and account.** Notification events chosen per type, activity filters by project and action with CSV export, and personal access tokens for the public API.

## Rules for every agent
- Load the skills named in the team plan that apply (`project-frontend`, `impeccable`, `design-taste-frontend`, `accessibility`, `web-design-guidelines`).
- Keep existing routes, API responses and tests working. Add fields, do not rename them.
- Every new user-facing text is plain, with no em dashes.
- Add tests for the logic (thresholds, filters, parsing, cloning rules).
- Run `npx tsc --noEmit`, `npx eslint src` and `npx vitest run` from `web/`. Report anything flaky separately.
- Do not commit. The main session reviews and commits.
