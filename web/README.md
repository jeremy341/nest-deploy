# Nest Deploy web app

A Vercel-style dashboard and the backend behind it: Hack Club sign-in, SSH to a Nest container, builds, releases, rollbacks, GitHub webhooks. See [docs/backend-setup.md](../docs/backend-setup.md) for setup, security notes and the API.

## Run it

```bash
pnpm install
pnpm setup     # creates .env.local (random APP_SECRET, DEV_LOGIN=1)
pnpm dev       # http://localhost:3000, deployment worker included
```

Other commands: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm worker` (standalone worker), `pnpm fake-nest` (a stand-in Nest container for local trials).

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16 (App Router, Cache Components) | Same framework Vercel's own dashboard style comes from, with server components by default. |
| Language | TypeScript | Strict mode, typed props for every component. |
| Styling | Tailwind CSS v4 | Design tokens live as CSS variables in `src/app/globals.css`. |
| Components | shadcn/ui (Base UI primitives) | The components are copied into `src/components/ui`, so they can be restyled freely. |
| Font | Geist Sans and Geist Mono via `next/font/google` | The same typeface Vercel uses. Self-hosted at build time, SIL Open Font License. |
| Icons | Phosphor (`@phosphor-icons/react`) | One icon family. Server components import from `/dist/ssr`. |
| Theming | `next-themes` | Light, dark, and system, with no flash on load. |

Vercel's Geist docs name a component package (`@vercel/geistcn`), but it is not on the public npm registry, and the dashboard's code is not published either. The colors, spacing, shadows and motion timing in `src/app/globals.css` (the `--ds-*` variables) are values read from the custom properties Vercel serves to every browser; dark-mode hue scales that could not be read are estimates and marked `est.`. Everything else is built from public tools, not copied from Vercel code.

## Design rules

- **Layout:** a 256px left sidebar and a 56px top bar on desktop (switching to project links inside a project). Below 1024px the sidebar becomes a floating Find / menu pill and a full-screen menu. Import (`/new`) has no sidebar, as on Vercel.
- **Brand:** one accent, ember orange (`--brand`), used for buttons, pixels, focus and the current-production pill. Black and white carry everything else; status colors stay for status only. Text on ember is near-black; ember as text on a light page uses the deeper `--brand-text`.
- **Pixel grid:** `components/pixel-field.tsx`. Hover swells and lights pixels, click or tap drops a ring of light, and an idle drop falls now and then. It sleeps when offscreen or idle and has a static, no-wave mode for reduced motion.
- **Shape lock:** controls 6px, cards and menus 8px, badges and avatars fully round.
- **One accent:** blue `#0070f3` (`#3291ff` in dark mode) for focus rings and info. Status colors are used only for real state.
- **Borders are box-shadows:** `shadow-border`, `shadow-border-small`, `shadow-menu` and `shadow-modal` utilities wrap the `--ds-shadow-*` tokens. Rows in a list share one hairline.
- **Type:** 14px / 20px UI text at weight 500 with -0.02em tracking, 13px secondary text, Geist Mono for ids, ports, and logs.
- **Motion:** menus and the Find palette use Vercel's `cubic-bezier(.175, .885, .32, 1.1)` at .2 to .3s, skeletons use a sweep, and the "Building" dot pulses. All motion respects `prefers-reduced-motion`.
- **Copy:** no em-dashes anywhere in the UI.
- **Accessibility:** every input has a visible label, errors sit under the field, and status is never shown by color alone.

## Routes

| Route | Screen |
| --- | --- |
| `/` | Public homepage: what it is, how it works, security, FAQ (pixel grid hero) |
| `/projects` | Dashboard home: projects, container usage, alerts and recent deployments |
| `/projects/[slug]` | Project overview: production deployment, runtime, summary cards, active branches |
| `/projects/[slug]/deployments` | Deployments for one project |
| `/projects/[slug]/deployments/[id]` | Deployment detail with collapsible build logs |
| `/new` | Import a repository and configure a project (simulated deploy) |
| `/deployments` | All deployments with a status filter |
| `/domains` | Add and remove domains (matches Nest's domain and port form) |
| `/logs` | Log viewer with a level filter |
| `/connect` | The SSH key flow for connecting a Nest server |
| `/login` | Hack Club Auth sign-in screen |

## Backend layout

| Path | What it holds |
| --- | --- |
| `src/server/db` | Drizzle schema and SQLite (libsql) connection; migrations in `drizzle/` |
| `src/server/auth` | Hack Club OAuth, hashed sessions, current user |
| `src/server/ssh` | ed25519 keys, SSH session wrapper, container probe |
| `src/server/deploy` | Build runner, release scripts, pipeline (deploy, revert, rollback, prune) |
| `src/server/jobs.ts` | Durable queue and worker loop |
| `src/server/github` | GitHub App auth, repository listing, webhooks |
| `src/server/projects.ts`, `servers.ts`, `domains.ts` | Services used by the API and the pages |
| `src/server/queries.ts` | Read models for the dashboard |
| `src/app/api` | REST routes |
| `worker/`, `scripts/` | Standalone worker, setup, fake Nest |

## Not done yet

- Project screenshots on the overview. It shows live deployment details instead.
- Traffic analytics and monitoring charts: there is no data source for them yet.
- Team access, and building from hosts other than GitHub.
- Domain mapping inside Nest is manual, because Nest has no API for it. Nest Deploy records the intent, shows exact steps, and checks DNS.
- Not yet run against a real Nest container or with Docker builds; see the end of [docs/backend-setup.md](../docs/backend-setup.md).
