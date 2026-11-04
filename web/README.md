# Nest Deploy web app

Second UI pass: a Vercel-style dashboard for Nest servers, with Vercel's sidebar layout and design tokens. Every screen uses sample data from `src/lib/mock.ts`. Nothing talks to Nest, GitHub, or Hack Club Auth yet.

## Run it

```bash
pnpm install
pnpm dev
```

The app opens on http://localhost:3000. Use `pnpm lint` and `pnpm build` before committing.

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
| `/` | Projects, with container usage, alerts and recent deployments |
| `/projects/[slug]` | Project overview: production deployment, runtime, summary cards, active branches |
| `/projects/[slug]/deployments` | Deployments for one project |
| `/projects/[slug]/deployments/[id]` | Deployment detail with collapsible build logs |
| `/new` | Import a repository and configure a project (simulated deploy) |
| `/deployments` | All deployments with a status filter |
| `/domains` | Add and remove domains (matches Nest's domain and port form) |
| `/logs` | Log viewer with a level filter |
| `/connect` | The SSH key flow for connecting a Nest server |
| `/login` | Hack Club Auth sign-in screen |

## Not wired yet

- Sign-in, the SSH connection test, deploy, redeploy, and rollback are placeholders.
- The public key on `/connect` is a sample string, not a real key.
- The brand mark is a placeholder ring.
- Search, filters, the Find palette (press `F`) and the domain form work, but only on the sample data in memory.
- Project thumbnails are a labelled placeholder, and the traffic and health cards show sample numbers.
