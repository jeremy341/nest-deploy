# Container features: what is already there, and what to add

## What happens today

- **Connecting** checks which tools exist (systemd, tar, curl, node, python) and disk space. It does not look at anything else on the container.
- **Running apps Nest Deploy did not start** are invisible. Their ports are not checked against projects, so a project can be set to a port another process already holds, and the failure only shows at deploy time as a failed health check.
- **Apps from earlier** (a project record deleted without removing its service, a server record removed, or a new account on the same container) keep their `nd-<slug>.service` units and release folders. Nothing finds them, so they keep running and use disk.
- **Preview ports** are allocated only against Nest Deploy's own records, so a preview can pick a port something else is using.

## Goals

1. **Container inventory** (team level, `/container`): what is on the container, grouped into managed projects, orphaned Nest Deploy services and folders, and other listening ports. Shows disk per folder and warns about port clashes. Orphans can be stopped and removed, with confirmation. Nothing is deleted without an explicit confirm.
2. **File manager** (per project, `/projects/[slug]/files`): browse, read, write, create folder, rename, delete and upload/download, scoped to the project's own folder. Writes to `shared/` persist across deploys. Writes to a release folder are shown with a warning that the next deploy replaces them.
3. **Terminal** (per project, `/projects/[slug]/terminal`): an interactive shell on the container, starting in the project's folder.

## Guardrails (all three)

- Every path is normalised and must stay inside the project's folder. Reject `..`, absolute paths outside the folder, and symlinks that resolve outside it.
- Every write request is same-origin (existing `handle` wrapper) and authenticated (`authed()`), and the server checks the project belongs to the signed-in user.
- Deletes and overwrites show a confirmation dialog. Overwrites of files over 1 MB and any delete of a directory need the typed name.
- Audit log entries for: inventory deletes, file deletes and overwrites, terminal session open and close (never keystrokes or output).
- File contents and terminal output are never logged on the server.
- Read limit: 1 MB for text preview. Upload limit: 50 MB, streamed to the container with the existing `writeFile` path.

### Terminal specifics (the risky one)

The shell runs as whatever user Nest gives the SSH key, which is root in the user's own container. A session is therefore a root shell in a browser, so it is treated as high risk:

- Opening a terminal is an explicit click. The page shows "You are connected as root on <name>.hackclub.app" while it is open.
- Sessions end after 10 minutes with no input, or after 60 minutes total. The server enforces both.
- One terminal session per user per project at a time.
- Output is sent over Server-Sent Events. Input is sent with a POST that is same-origin and carries the session id, which is random and checked against the signed-in user.
- The server holds the SSH shell in memory. Sessions are removed on close, on timeout, and when the SSH connection drops.

## Dependencies

- `@xterm/xterm` (6.x) and `@xterm/addon-fit` (0.11.x), both MIT. Added only for the terminal page.
- No other new dependencies.

## Ownership (disjoint files, no agent edits another's)

- **A: Container inventory.** `web/src/server/inventory.ts`, `web/src/server/ssh/inventory-probe.ts`, `web/src/app/(app)/container/**`, `web/src/app/api/servers/[id]/inventory/**`, `web/src/app/api/servers/[id]/orphans/**`, `web/src/components/container-*.tsx`, and tests.
- **B: File manager.** `web/src/server/files.ts` (+ `files-paths.ts`), `web/src/app/api/projects/[id]/files/**`, `web/src/app/(app)/projects/[slug]/files/**`, `web/src/components/file-manager*.tsx`, and tests.
- **C: Terminal.** `web/src/server/terminal.ts`, `web/src/server/ssh/shell.ts` (new, the interactive shell wrapper), `web/src/app/api/projects/[id]/terminal/**`, `web/src/app/(app)/projects/[slug]/terminal/**`, `web/src/components/terminal*.tsx`, and tests.
- **Lead (main session):** `web/src/lib/nav.ts`, `web/package.json`, `web/src/server/audit.ts` labels, and the project sub-navigation. Agents must not edit these.

## Review

After the three agents finish, a separate review pass checks each area against the guardrails above, the design system, keyboard and screen-reader use, and 375px layouts. Findings go back to the owning agent until it is clean.
