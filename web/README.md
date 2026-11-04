# Nest Deploy web app

First UI pass: a Vercel-style dashboard for Nest servers. Every screen uses sample data from `src/lib/mock.ts`. Nothing talks to Nest, GitHub, or Hack Club Auth yet.

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

Vercel's own component library is not published, and neither is its dashboard. This is an approximation of the Geist look built from public tools, not a copy of Vercel code.

## Design rules

- **Shape lock:** controls 6px, cards and menus 8px, badges and avatars fully round.
- **One accent:** blue `#0070f3` (`#3291ff` in dark mode) for focus rings and info. Status colors are used only for real state.
- **Borders over shadows:** cards use a 1px border. Rows in a list share one hairline.
- **Density:** 14px body text, 13px secondary text, mono for ids, ports, and numbers.
- **Motion:** none beyond hover and focus transitions and a pulse on the "Building" status. All motion respects `prefers-reduced-motion`.
- **Copy:** no em-dashes anywhere in the UI.
- **Accessibility:** every input has a visible label, errors sit under the field, and status is never shown by color alone.

## Routes

| Route | Screen |
| --- | --- |
| `/` | Projects, with container usage and alerts |
| `/projects/[slug]` | Production deployment, deployment history, runtime |
| `/deployments` | All deployments with a status filter |
| `/domains` | Add and remove domains (matches Nest's domain and port form) |
| `/logs` | Log viewer with a level filter |
| `/connect` | The SSH key flow for connecting a Nest server |
| `/login` | Hack Club Auth sign-in screen |

## Not wired yet

- Sign-in, the SSH connection test, deploy, redeploy, and rollback are placeholders.
- The public key on `/connect` is a sample string, not a real key.
- The brand mark is a placeholder ring.
- Search, filters, and the domain form work, but only on the sample data in memory.
