# UI overhaul plan

Goal: make every surface of Nest Deploy feel designed and enjoyable to use. That means a docs page that is a pleasure to read, motion that gives feedback and orientation (entrances, hovers, presses, state changes), skeletons that match each page's real layout, and consistent layouts. The product keeps a Vercel-like dashboard structure (sidebar, top bar, cards, hairlines, Geist), and the lead designer has freedom to bring in the homepage's own identity (the pixel grid, the pixel display face, the lit squares) where it helps.

Backup of the tree before this work: `~/nest-deploy-backups/pre-ui-overhaul-*.tgz`.

## Team

| Role | Model | Owns |
| --- | --- | --- |
| Lead designer, orchestrator and reviewer | Opus 5.5, high effort | Every design decision. Writes and locks `docs/design/ui-spec.md`, reviews all work against it, and sends work back until it is right. |
| Foundation implementer | Sonnet 5.5, high effort | Shared tokens, motion primitives, skeleton primitives, hover and press patterns. Lands first. |
| Docs implementer | Sonnet 5.5, high effort | `/docs`. |
| Dashboard implementer A | Sonnet 5.5, high effort | App shell (sidebar, top bar, mobile dock, find palette), projects overview, project pages, connect and new-project flows. |
| Dashboard implementer B | Sonnet 5.5, high effort | Deployments, logs, domains, activity, account, analytics, settings, and every route's `loading.tsx`. |
| Marketing implementer | Sonnet 5.5, high effort | Homepage below the hero (the hero itself is approved and stays), marketing header and footer, login, public status page, not-found. |

The main session dispatches agents and relays messages. The lead decides; implementers do not change the spec on their own, and they raise disagreements with the lead.

## Phases

1. **Audit and spec (lead).** Read every surface and the skills listed below. Write `docs/design/ui-spec.md`: the design direction, tokens, type scale, the motion system (durations, easings, what animates and why, reduced motion), skeleton rules, the hover/press/focus vocabulary, per-surface briefs with acceptance criteria, and the exact files each workstream owns.
2. **Foundation (foundation implementer).** Build the shared primitives the spec names, for example reveal-on-scroll, staggered entrance, skeleton shapes, press and hover utilities, and route transition rules. Everyone else builds on these, so this lands before phase 3.
3. **Surfaces (four implementers in parallel, disjoint files).** Each one implements its brief, then reviews its own work against the spec and the skills, improves it, and repeats until it meets every acceptance criterion.
4. **Review loop (lead).** The lead reviews each workstream's diff and the rendered pages (the dev server runs on `http://localhost:3100`) and sends specific fixes back. Work loops until the lead signs off.
5. **Final verification (main session).** Type-check, lint, the full test suite, render checks of every route, and a summary to the user.

## Rules for every agent

- **Load the skills before acting.**
  - Everyone: `project-frontend`, `impeccable`, `design-taste-frontend`.
  - Motion work: `emilkowal-animations`.
  - Accessibility and states: `accessibility`, `web-design-guidelines`.
  - Visual direction: `frontend-design`.
  - Reviews: `critique` and `frontend-design-review`.
  - Defects found on the way: `project-code-quality`.
- **Read `web/AGENTS.md`.** This Next.js version differs from older ones. Check `node_modules/next/dist/docs/` before using an unfamiliar API.
- **Existing stack:**
  - Tailwind v4, shadcn on `@base-ui/react`, Phosphor icons, Geist, and the `--ds-*` tokens in `globals.css`.
  - Prefer CSS for motion. Add a dependency only if the lead approves it and `package.json` is checked first.
- **Motion must be purposeful.**
  - Motion should give feedback, orientation or hierarchy.
  - Use transform and opacity only, mostly under 300ms, with an ease-out by default.
  - Every animation respects `prefers-reduced-motion`.
  - Nothing animates on keyboard-initiated actions, such as opening the find palette with a shortcut.
- **Skeletons match the final layout** of the page they stand in for, so nothing jumps when data arrives.
- **Accessibility is not optional.**
  - Use semantic elements and visible focus.
  - Meet WCAG AA contrast in light and dark.
  - Touch targets of at least 40px on phones.
  - No horizontal scroll at 375px.
- **Behaviour stays put.**
  - Do not change APIs, data loading or server code to solve a presentation problem.
  - Keep every existing route, anchor id and test passing.
- **Copy.**
  - No em dashes in visible copy.
  - Keep the plain, specific voice.
  - Do not invent features. The docs must stay true to the code.
- **Stay in your files.** If you need a change in someone else's file, ask the lead.
- **Finish with green checks.** Run `npx tsc --noEmit`, `npx eslint src` and the relevant `npx vitest run` from `web/`, and list exactly what changed.
