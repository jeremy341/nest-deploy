# Decision log

Newest decisions are at the bottom. Each entry says what was decided and why. When a decision changes, add a new entry rather than rewriting the old one.

1. **Website, not a CLI.** The first version is a website where users sign in, connect a Nest server and GitHub, and deploy and manage projects. The CLI-first plan from the original idea was dropped.
2. **Version 1 is the full scope in `planning/02-decided-feature-scope.md`.** It includes traffic analytics, previews, custom domain automation, multiple runtimes, team access, and advanced monitoring. The user chose to keep everything in Version 1 after we suggested a pilot-first cut.
3. **Sign-in with Hack Club Auth.** Hack Club Auth identifies the user only. It doesn't grant access to their Nest container. Hackatime OAuth is a later option for hours tracking.
4. **Connect Nest with a dedicated SSH key.** The site generates an ed25519 key. The user pastes the public key into the Nest dashboard's SSH Keys page and clicks Test connection. The site then runs `ssh <nest-username>@hackclub.app`.
5. **The stored key grants root.** The bastion logs in to the container as root, so the site's key is effectively root on the user's container. The user accepted this. Users can revoke the key in the Nest dashboard at any time. The Decided Feature Scope documents this.
6. **Manual key paste for now.** No public API exists for SSH keys, and we decided not to reverse-engineer the dashboard's requests. The paste stays manual until Nest offers an API.
7. **Build outside Nest.** Nest containers are small (2 vCPUs, 2 GB RAM). Builds should run on our own workers, and only the finished artifact goes to Nest. This is planned, not yet tested.
8. **Docker considered, not decided.** A Docker image pins the runtime and dependencies. Rootless Docker inside a Nest container is unverified, so Docker versus plain release directories is still open.
9. **Repo created and made public.** The repo is `jeremy341/nest-deploy`. The folder name has a space, but the repo name uses a hyphen because GitHub doesn't allow spaces.

## Superseded or inconsistent text in the planning docs

- `planning/01-original-idea.md` still describes an agent running in each user's container in its architecture section. Decision 4 replaces it with the SSH key flow. Update that section when the architecture is finalized.
- The planning documents keep their original `[[wiki links]]`. They don't resolve on GitHub, so treat them as plain references to the notes they name.

## UI stack (added 2026-11-04)

10. **Next.js, TypeScript, Tailwind v4, shadcn/ui, Geist.** There is no official Vercel component library, so the dashboard is built from the public pieces closest to it: shadcn/ui components (copied into the repo and restyled), Geist Sans and Mono, and Geist-style color tokens. Icons come from Phosphor. See `web/README.md` for the design rules.
11. **First UI pass uses sample data only.** Every screen reads from `web/src/lib/mock.ts`. Sign-in, the SSH test, and deploy actions are placeholders until the backend exists.
12. **Second UI pass follows Vercel's current dashboard.** The layout is a left sidebar plus top bar (not top tabs), and the colors, shadows, spacing and motion come from the custom properties Vercel's dashboard serves, so values can be diffed. Dark-mode hue scales were not readable and are estimates. Captures used for this are kept locally and not committed (`reference/` is gitignored).

## Backend (added 2026-11-04)

13. **One Next.js process plus a queue.** API routes, pages and the deployment worker can run in a single process (`RUN_WORKER=1`), with the worker also runnable on its own. State lives in SQLite through libsql (prebuilt binaries; `better-sqlite3` needs a compiler on Windows).
14. **Release folders and a symlink, not Docker, on Nest.** A deploy unpacks to `~/.nest-deploy/<project>/releases/<id>`, switches `current`, restarts a systemd unit and health-checks it; failure reverts the symlink. This answers the earlier "Docker or release folders" question with release folders, because rootless Docker inside a Nest container is still unverified.
15. **Builds happen off Nest, in Docker.** The worker clones and builds in a resource-limited container and ships a tarball. Production dependencies are installed on Nest, so native modules match the server.
16. **Uploads use an exec channel, not SFTP.** The bastion's SFTP support is unknown; `cat` over exec works if exec works.
17. **Previews are real services on their own ports.** Newest two kept per project. Mapping a preview to a domain stays manual.
18. **Domains are recorded, not configured.** There is no Nest API for mapping a domain to a port, so Nest Deploy tells the user what to enter and checks DNS.
19. **Hack Club Auth for identity only, GitHub App for repositories.** The GitHub App's user authorization is used once, to learn which installations belong to a user, and the user token is not stored.

## Brand and homepage (added 2026-11-04)

20. **Ember orange is the one accent.** Chosen because it is warm, reads as hearth and nest, sits close to Hack Club's red without being error red, and stays legible as a fill on both black and white. Black and white remain the base. A pixel mark (a bowl with one ember pixel) and a pixel face used only for the wordmark and step numerals carry the personality.
21. **The homepage lives at `/`, the dashboard at `/projects`.** The homepage is public; everything else still needs a session.
22. **The homepage is drenched in ember, with authored pixel art.** The first version (dark, one neon accent, tiles, numbered steps, an accordion) read as generated, so it was replaced. The hero is a pixel-art nest with three eggs you can hatch; the page leads with what a manual deploy looks like, shows features as plain rows, and states the SSH key's root access up front. Display face is Bricolage Grotesque; Geist stays the face of the app.

