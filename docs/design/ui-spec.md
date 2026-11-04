# Nest Deploy UI spec (locked)

Owner: lead designer. Status: **locked** for phase 2 and 3. Implementers build exactly this. If something here is impossible or wrong, stop and raise it with the lead through the main session; do not improvise around it.

All paths are relative to `web/src/` unless they start with `docs/` or `web/`.

This spec was written from a full read of the code. No screenshots were available. Anything marked **[visual]** has to be confirmed in a real browser by the reviewer.

---

## 0. Hard constraints (apply to every workstream)

1. Keep every route, every anchor id, every `id=` used by `aria-labelledby`, every API call, every data load, and all server code exactly as they are. Do not edit `app/api/**`, `server/**`, `proxy.ts`, `instrumentation.ts`, `components/api.ts`, `lib/status.ts`, `lib/site.ts`, `lib/sample.ts`, `lib/utils.ts`. You may move a data load inside a `<Suspense>` boundary (same call, same arguments) when the spec tells you to.
2. Existing anchor ids that must survive: homepage `#product #start #runtimes #security #faq #top`; docs sections `#overview #quickstart #servers #projects #deployments #env #logs #domains #github #hooks #notifications #monitoring #status-page #analytics #activity #security #selfhost #limits #troubleshooting` and each heading id `${id}-h`; settings headings `#run-heading #env-heading #hook-heading #notify-heading #status-page-heading #danger-heading`; account `#profile-heading #github-heading #sessions-heading #delete-account-heading`; `#analytics-setup`; app `#main`.
3. Every existing test keeps passing (`npx vitest run` from `web/`). `npx tsc --noEmit` and `npx eslint src` are clean.
4. No em dashes (U+2014) or en dashes used as separators (U+2013) in any visible copy. Use a period, comma, colon or parentheses. Loading labels end with the ellipsis character `…` ("Saving…"), never three dots. Code samples are not copy and keep their literal text.
5. Docs content stays true to the code. Do not add claims. Do not change a fact. New copy is allowed only where this spec gives it word for word.
6. WCAG 2.2 AA in light and dark: 4.5:1 for text under 18px (14px bold), 3:1 for large text and for UI boundaries and focus indicators.
7. Touch targets at least 40x40px below 640px (`max-sm:`). Inline text links inside prose are exempt.
8. No horizontal page scroll at 375px wide. Wide content (tables, code, logs) scrolls inside its own frame.
9. Every animation honours `prefers-reduced-motion` (section 3.6).
10. The homepage hero is approved and frozen: the `Hero` function in `app/(marketing)/page.tsx` and the CSS rules `.hero-wipe`, `.hero-rise`, `@keyframes hero-wipe`, `@keyframes hero-rise` stay byte-identical. `components/pixel-field.tsx` keeps its current behaviour.
11. No new npm dependencies. Everything here is buildable with what is in `web/package.json`: Tailwind 4.3, `tw-animate-css`, `@base-ui/react` 1.9 (it ships `toast`, `alert-dialog`, `dialog`), Phosphor, `next-themes`, React 19.3, Next 16.4. Read `web/AGENTS.md` and check `web/node_modules/next/dist/docs/` before using any Next API you have not used in this repo.
12. Stay in your files (section 7). Need something outside them? Ask the lead.

---

## 1. Design read and direction

**Design read.** Reading this as: a self-serve deploy dashboard for Hack Club teenagers and hobbyists who already know Vercel, plus a marketing site and a long-form docs page, with a calm, precise, Vercel-grade language, leaning toward Tailwind v4 utilities, Geist, hairline shadows, and the homepage's own pixel identity used as a signature rather than as decoration.

**Aesthetic name: "Lit hairlines".** The product is drawn in hairlines (1px shadow borders, Geist, a neutral gray scale, one blue accent) like Vercel. The Nest identity is the *lit pixel*: a single square of ink that switches on. It already exists in the homepage's pixel grid, the Pixelify display face, the NestMark logo and the hero's stepped scan. In this overhaul the lit pixel becomes the product's signature for *state*: something is in progress, something is current, something is here. It appears small, sharp and rarely.

Dials. Dashboard: variance 3, motion 3, density 6. Docs: variance 4, motion 3, density 4. Marketing below the hero: variance 7, motion 6, density 4. DFII 14 (impact 4, fit 5, feasibility 4, performance 4, consistency risk 3).

**Differentiation anchor.** With the logo removed you would still know it is Nest Deploy because: in-progress states are a 2x2 pixel scanner instead of a spinner, every project has a pixel identicon instead of a letter or Vercel's triangle, empty states sit on a faint fading pixel grid, the docs nav marks your place with a lit square, and section headings on public pages are set in Pixelify.

### 1.1 What stays Vercel-like (all dashboard surfaces)
- Shell: 256px sidebar on `lg+`, 56px sticky top bar, floating dock on phones.
- Geist Sans for all UI text, Geist Mono for code, ids, ports, commands, numbers in data.
- `--ds-*` gray scale and shadow-borders (`shadow-border`, `shadow-border-small`, `shadow-menu`, `shadow-modal`). Cards are `rounded-lg bg-card shadow-border-small`.
- Hairline lists (`hairline-y`), card header bars (`px-4 py-3 border-b`), footer bars (`bg-background-subtle border-t`).
- Blue (`--brand`) only for focus, links in context, the current-production pill and info tones.

### 1.2 What comes from the homepage identity, and exactly where
| Element | Where it appears | Where it never appears |
| --- | --- | --- |
| **PixelLoader** (2x2 squares lighting clockwise) | Building/queued status, pending buttons (Deploy, Test connection, Save), build log "running", empty log viewer "waiting" | Refresh buttons (they spin their own arrow icon), page loading (that is a skeleton) |
| **PixelAvatar** (5x5 mirrored identicon from the project slug) | Project cards and rows, project crumb and switcher, find palette project results, project page header | Users and servers (they keep initials avatars) |
| **Grid patch** (faint hairline grid masked into a soft ellipse) | Inside `EmptyState` only in the dashboard; docs hero; status page header band | Behind any data, table, list, log, form or card body |
| **Pixelify Sans** | Marketing headings (existing), docs `h1` and `h2`, login title, not-found "404", status page state headline | Anywhere in the dashboard (`(app)` and `(flow)`), body text, labels, buttons, data |
| **Lit square marker** (one solid square, 5 or 6px) | Docs nav current-section marker, docs list bullets, docs and marketing link tiles on hover (`lit-corner`), status page state glyph, homepage step track | Dashboard nav and tables |
| **Stepped (pixel) timing** `steps()` | Hero (existing), PixelLoader, not-found 404 scan | Any other transition. Everything else uses smooth curves |
| **Full pixel grid page background and PixelField** | Marketing layout (existing), login, not-found | Docs reading band, dashboard, status page |

### 1.3 Shape rule (one rule per surface family, followed everywhere)
- Dashboard, login, status page: controls 6px (`rounded-md`), cards, menus, toasts, code frames 8px (`rounded-lg`), dialogs and palette 12px (`rounded-xl`), pills and avatars full.
- Marketing and docs: frames are **square** (radius 0, `border`), because they sit on the pixel grid. Controls are 6px. Primary marketing CTAs stay pills (existing). Inline code 3px.

---

## 2. Tokens (`app/globals.css`, Foundation)

Keep every existing token. Make these changes and additions. Names are final.

### 2.1 Fixes to existing values
- `--ease-swift`: change to `cubic-bezier(0.23, 1, 0.32, 1)`. The old value overshoots (1.1); menus and the palette use it.
- `--subtle-foreground`: light `hsl(0 0% 43%)` (was gray-800 `hsl(0 0% 49%)`, which is 4.1:1 on white and fails AA). Dark `hsl(0 0% 54%)` (was 49%, which fails on `--ds-gray-100`). Measured: light 5.1:1 on white, 4.9:1 on `#fafafa`, 4.6:1 on gray-100; dark 5.7:1 on `#0a0a0a`, 5.0:1 on gray-100.
- Remove the duplicated `::selection` and `html { scrollbar-* }` blocks. Keep one of each: `::selection { background: color-mix(in oklab, var(--brand) 30%, transparent); color: inherit; }` and `html { scrollbar-width: thin; scrollbar-color: var(--ds-gray-500) transparent; }`.
- Delete the unused `@keyframes tick-line` and its `.tick-line` reduced-motion rules (no file uses them).

### 2.2 New colour and surface tokens (`:root`, with `.dark` overrides where given)
```css
:root {
  --destructive-foreground: #ffffff;           /* .dark: hsl(0 0% 4%) */
  --ds-shadow-border-hover: 0 0 0 1px #00000029, 0px 2px 2px #0000000a, 0 0 0 1px hsl(0 0% 98%);
                                                 /* .dark: 0 0 0 1px #ffffff3d, 0px 1px 2px #00000029, 0 0 0 1px hsl(0 0% 0%) */
  --prose: color-mix(in oklab, var(--foreground) 84%, var(--background));
  --code-bg: var(--ds-background-200);
  --skeleton-base: var(--ds-gray-100);
  --skeleton-highlight: var(--ds-gray-200);      /* .dark: var(--ds-gray-300) */
  --grid-line: color-mix(in srgb, var(--foreground) 8%, transparent);
  --pixel-lit: var(--foreground);

  /* Tones for Alert, Callout, Toast icons. Text inside a tone is always --foreground. */
  --tone-note-bg: var(--ds-gray-100);
  --tone-note-ring: var(--ds-gray-alpha-400);
  --tone-note-icon: var(--muted-foreground);
  --tone-info-bg: var(--ds-blue-100);
  --tone-info-ring: color-mix(in oklab, var(--ds-blue-700) 30%, transparent);
  --tone-info-icon: var(--brand-text);
  --tone-success-bg: var(--ds-green-100);
  --tone-success-ring: color-mix(in oklab, var(--ds-green-900) 30%, transparent);
  --tone-success-icon: var(--ds-green-900);
  --tone-warning-bg: var(--ds-amber-100);
  --tone-warning-ring: color-mix(in oklab, var(--ds-amber-900) 30%, transparent);
  --tone-warning-icon: var(--ds-amber-900);
  --tone-error-bg: var(--ds-red-100);
  --tone-error-ring: color-mix(in oklab, var(--ds-red-900) 30%, transparent);
  --tone-error-icon: var(--ds-red-900);

  /* Layers. Use these numbers; do not invent new z-index values. */
  --z-topbar: 30;   /* dashboard top bar */
  --z-header: 50;   /* marketing header, docs sticky bar uses 40 */
  --z-popover: 50;  /* menus, tooltips (Base UI positioners) */
  --z-dock: 60;     /* phone dock */
  --z-overlay: 300; /* find palette, dialogs */
  --z-toast: 350;
  --z-skip: 400;    /* skip links */
}
```
Register in `@theme inline` so utilities exist: `--color-destructive-foreground: var(--destructive-foreground); --color-reading: var(--prose);` (utility `text-reading`; it is not called `prose` because `text-prose` is the docs body size).

### 2.3 Type scale (`@theme inline`, Tailwind v4 `--text-*` with line-height, letter-spacing and weight)
These names avoid collisions with colour utilities (there is a `--color-card`, so never `text-card` for size).

| Utility | Size / line-height | Weight | Tracking | Role |
| --- | --- | --- | --- | --- |
| `text-title-1` | 28px / 36px | 600 | -0.025em | Dashboard page `h1` (PageHeader) |
| `text-title-2` | 20px / 28px | 600 | -0.02em | Section `h2` inside a page (settings cards, "Active Branches", connect "Add your server") |
| `text-title-3` | 14px / 20px | 500 | -0.01em | Card header bar titles ("Production Deployment", "Service", "Alerts") |
| `text-body` | 14px / 20px | 400 | 0 | Dashboard default (body already is this) |
| `text-body-lg` | 16px / 24px | 400 | -0.005em | Empty-state titles (with `font-semibold`), dialog titles |
| `text-label` | 13px / 18px | 400 | 0 | `dt` labels, helper text, meta lines, field labels |
| `text-caption` | 12px / 16px | 500 | 0 | Pills, badges, kbd, chart axis labels |
| `text-stat` | 32px / 40px | 600 | -0.03em | Analytics stat values, status page uptime (always `tabular`) |
| `text-docs-h1` | 64px / 64px (`max-sm:` 44px / 48px) | 500 | 0 | Docs `h1`, Pixelify |
| `text-docs-lead` | 18px / 28px | 400 | -0.005em | Docs intro and section intros |
| `text-docs-h2` | 30px / 36px (`max-sm:` 26px / 32px) | 500 | 0 | Docs `h2`, Pixelify |
| `text-docs-h3` | 18px / 28px | 600 | -0.015em | Docs `h3`, Geist |
| `text-prose` | 16px / 28px | 400 | 0 | Docs body paragraphs and list items |
| `text-docs-small` | 14px / 24px | 400 | 0 | Docs tables, callouts |
| `text-code` | 13px / 22px | 400 | 0 | Code blocks, logs use 13px / 20px (`.log-surface`) |

Write each as `--text-title-1: 1.75rem; --text-title-1--line-height: 2.25rem; --text-title-1--letter-spacing: -0.025em; --text-title-1--font-weight: 600;` and so on. Responsive variants are applied by the consumer with `max-sm:` overrides as noted. Marketing section `h2`s keep their existing clamp values.

Numbers that are compared or that update (usage, uptime, counts, ports, times) always get `tabular` (existing utility).

### 2.4 Spacing rhythm (4px base)
- Dashboard page: `px-4 lg:px-6`, `py-6` (existing). Vertical gap between blocks on a page: 24px (`space-y-6`). Grid gaps: 16px (`gap-4`).
- Card: header bar `px-4 py-3`, body `p-4`, footer bar `px-4 py-3`. Settings cards: `p-5`, footer `px-5 py-3` (existing). Do not mix within one card.
- Rows: `px-4 py-3` (min 48px tall), compact rows `px-3 py-2.5`.
- Field: label 13px, `mb-1.5`; helper/error 13px, `mt-1.5`. Field grid `gap-4`.
- Docs: 64px between sections, 40px above an `h3`, 16px between paragraphs, 8px between list items, 24px around code, tables and callouts.
- Marketing: sections `py-20 lg:py-28` (existing).
- Headings always have more space above than below.

### 2.5 Base layer additions
```css
@layer base {
  button:not(:disabled), [role="button"]:not([aria-disabled="true"]), summary, select, label[for] { cursor: pointer; }
  input[type="checkbox"], input[type="radio"] { width: 16px; height: 16px; accent-color: var(--brand); }
  :focus-visible { outline: 2px solid var(--ds-focus-color); outline-offset: 2px; } /* existing, keep */
  h1, h2, h3 { text-wrap: balance; } /* plus the existing letter-spacing */
  p { text-wrap: pretty; }
}
```
Do not add `scroll-padding-top` to `html`. Anchored targets use `scroll-mt-*` classes (they would add up).

---

## 3. Motion system

### 3.1 Principles
1. Motion gives feedback (a press, a copy), orientation (where content came from, where you are), or state (pending, changed, done). Nothing animates for decoration in the dashboard or docs.
2. Transform and opacity only, plus `filter: blur()` up to 2px as a bridge in `Swap`, `clip-path` in the existing hero, and `box-shadow`/`background-color`/`color` for hover states.
3. Default curve is `--ease-snappy` (strong ease-out). Exits are faster than entrances. No bounce, no overshoot, no springs.
4. Under 300ms for anything in the dashboard. Marketing scroll reveals may use 600ms.
5. The default state is visible. If JavaScript never runs, every element is on screen.

### 3.2 Tokens (`:root` and `@theme inline`)
```css
@theme inline {
  --ease-snappy: cubic-bezier(0.23, 1, 0.32, 1);   /* utility: ease-snappy. Default for everything */
  --ease-move:   cubic-bezier(0.77, 0, 0.175, 1);  /* utility: ease-move. On-screen movement (docs marker glide) */
  --ease-sheet:  cubic-bezier(0.32, 0.72, 0, 1);   /* utility: ease-sheet. Sheets and panels (mobile menu, toasts) */
}
:root {
  --dur-press: 100ms;   /* active scale in */
  --dur-fast: 150ms;    /* hover colour, tooltip, menu open, dialog exit */
  --dur-base: 200ms;    /* toggles, caret rotation, docs marker, panel open */
  --dur-enter: 220ms;   /* route content entrance */
  --dur-slow: 280ms;    /* list stagger item, accordion height, toast enter */
  --dur-reveal: 600ms;  /* marketing scroll reveal only */
  --stagger-step: 35ms; /* capped at 8 steps = 280ms */
}
```
Tailwind arbitrary use: `duration-(--dur-fast) ease-snappy`.

### 3.3 Keyframes (globals.css)
```css
@keyframes enter      { from { opacity: 0; transform: translateY(4px); } }
@keyframes enter-up   { from { opacity: 0; transform: translateY(8px); } }
@keyframes fade-in    { from { opacity: 0; } }
@keyframes swap-in    { from { opacity: 0; transform: translateY(3px); filter: blur(2px); } }
@keyframes grow-y     { from { transform: scaleY(0); } }
@keyframes pixel-blink { 0% { opacity: 1; } 25%, 100% { opacity: 0.25; } }
@keyframes skeleton-sweep { from { background-position: -100vw 0; } to { background-position: 100vw 0; } } /* replaces the old one */
@keyframes hairline-in { from { box-shadow: 0 1px 0 transparent; } to { box-shadow: 0 1px 0 var(--border); } }
```

### 3.4 Primitives (what to build, what each is for, where it is used)

| # | Primitive | Implementation | Spec | Purpose | Used on |
| --- | --- | --- | --- | --- | --- |
| M1 | **Route enter** | CSS class `.motion-enter` | `animation: enter var(--dur-enter) var(--ease-snappy) backwards; animation-delay: var(--enter-delay, 0ms);` | Orientation: new content arrives, replaces its skeleton without a pop | The content root of every dashboard route (list in 6.x), the `Configure` and import steps of `/new`, docs nothing, login card, status page content, domain instructions panel, inline edit forms |
| M2 | **Fade** | `.motion-fade` | `animation: fade-in var(--dur-base) var(--ease-snappy) backwards;` | Neutral appearance without movement | Result banners (connect "Reached your container"), toolbar notes |
| M3 | **Stagger** | Client component `components/motion/stagger.tsx` + CSS | Renders `as` (default `"ul"`) with `className={cn("motion-stagger", className)}`. CSS: `.motion-stagger:not([data-settled]) > * { animation: enter-up var(--dur-slow) var(--ease-snappy) backwards; animation-delay: calc(var(--i, 8) * var(--stagger-step)); }` with `:nth-child(1..8) { --i: 0..7 }`. On mount, `setTimeout(() => setSettled(true), 700)` sets `data-settled`, so children added later (filters, search, polling) never animate. Clean up on unmount. Props: `as?: "ul" \| "ol" \| "div"`, `className?`, `children`, plus pass-through `aria-*`. | Hierarchy on first view of a list | Project grid and list, `/deployments` and project deployment lists, activity groups, domains list, analytics stat tiles. Never logs, menus, palette results, docs |
| M4 | **Reveal on scroll** | Client component `components/motion/reveal.tsx` + CSS | Props: `as?` (default `"div"`), `className?`, `delay?: number` (ms, sets `--reveal-delay`), `variant?: "rise" \| "light"`, `children`. On mount: if reduced motion, do nothing. If the element's top is below `innerHeight - 100`, set `data-reveal="hidden"`, then an `IntersectionObserver` with `rootMargin: "0px 0px -100px 0px"` sets `data-reveal="shown"` once and disconnects. Elements already in view at mount never hide. CSS: `[data-reveal] { transition: opacity var(--dur-reveal) var(--ease-snappy), transform var(--dur-reveal) var(--ease-snappy); transition-delay: var(--reveal-delay, 0ms); } [data-reveal="hidden"] { opacity: 0; transform: translateY(16px); } [data-reveal-variant="light"][data-reveal] { transition-duration: 120ms; } [data-reveal-variant="light"][data-reveal="hidden"] { opacity: 0.15; transform: none; }` | Storytelling on the marketing page | Homepage sections below the hero only (6.3). Not docs, not dashboard |
| M5 | **Swap** (value change) | Client component `components/motion/swap.tsx` | `<Swap value={key}>{children}</Swap>` renders `<span className="inline-block" key={String(value)}>`; on every render after the first where `value` changed, the span gets `motion-swap` (`animation: swap-in 180ms var(--ease-snappy);`). First render never animates (track with a ref). | State: a live value changed | ServiceCard values (status, uptime, memory, restarts, health), domain status after Check, "Copy" to "Copied", docs code copy label, settings save status line |
| M6 | **Press** | Built into `Button` and `.pressable` utility | `.pressable { transition: transform 160ms var(--ease-snappy); } .pressable:active:not(:disabled):not([aria-disabled="true"]) { transform: scale(0.97); transition-duration: var(--dur-press); }` | Feedback that a press registered | Every `Button`, marketing pills, theme button, dock buttons, segmented items, docs tiles (scale 0.99 there via `active:scale-[0.99]`). Not menu items, not table rows, not nav links |
| M7 | **Hover surface** | Tailwind `hover:` (v4 gates `hover:` behind `@media (hover: hover)` already) | Rows and nav items: `transition-colors duration-(--dur-fast)` with `hover:bg-[var(--ds-gray-alpha-100)]`. Interactive cards: `.card-interactive { transition: box-shadow var(--dur-fast) var(--ease-snappy); } .card-interactive:hover { box-shadow: var(--ds-shadow-border-hover); }` | Affordance: this whole thing is clickable | Project cards, deployment and branch rows, recent deployments, docs tiles, repo rows |
| M8 | **Lit corner** | `.lit-corner` utility | `position: relative;` `::before` 6x6px square at `top: -1px; left: -1px` (sits on the frame corner), `background: var(--pixel-lit); opacity: 0; transition: opacity var(--dur-fast) steps(1, end);` visible on `:hover` (hover media) and `:focus-visible`. | Brand hover on link tiles | Docs "Start here" tiles, homepage CTA links tile if any. Only on elements that are links |
| M9 | **Disclosure** | `.disclosure` utility for native `<details>` | Same mechanics as the existing `.faq` (keep `.faq` untouched): `summary` flex, marker hidden, `cursor: pointer`, focus outline inset `-2px`; `.disclosure-caret` rotates `90deg` over `var(--dur-base)`; when `@supports (interpolate-size: allow-keywords)` and no-preference: `::details-content` animates `block-size` 0 to auto over `var(--dur-slow) var(--ease-snappy)` with `content-visibility` `allow-discrete`. | Orientation: content expands from its summary | Project "Runtime Settings", homepage (existing `.faq`) |
| M10 | **Menu / popover** | Edit `ui/dropdown-menu.tsx`, `ui/tooltip.tsx` classes | Menus open: `duration-(--dur-fast) ease-snappy data-open:fade-in-0 data-open:zoom-in-[0.97]`, origin from `--transform-origin` (keep); remove the `slide-in-from-*` classes. Close: `data-closed:duration-100 data-closed:fade-out-0 data-closed:zoom-out-[0.98]`. Tooltips: `TooltipProvider delay={400}` and `closeDelay={0}`; popup `duration-[125ms]`; `data-[instant]:animate-none` so moving between tooltips is instant. | Spatial origin of a menu | All dropdowns and tooltips |
| M11 | **Dialog** | `components/ui/alert-dialog.tsx` (Base UI `AlertDialog`) | Backdrop: `bg-black/30 dark:bg-black/60`, fade 150ms. Popup: centered, `w-[calc(100vw-32px)] max-w-[440px] rounded-xl bg-popover shadow-modal p-5`, enter `opacity 0 to 1, scale 0.97 to 1` over 200ms `ease-snappy` using Base UI `data-[starting-style]`, exit opacity only 120ms via `data-[ending-style]`. | Protected focus for destructive or disruptive actions | Restart service, rotate key, disconnect server, remove domain, delete env var |
| M12 | **Toast** | `components/ui/toast.tsx` (Base UI `Toast` with `Toast.createToastManager()`) | Enter from below: `translateY(calc(100% + 16px))` and `opacity 0` to rest, 280ms `ease-sheet`; exit `opacity 0, translateY(8px)` 160ms. Stack: max 3 visible, older toasts behind scaled `1 - index * 0.05` and offset `-index * 10px`; expand on hover or focus. Use the CSS variables and data attributes Base UI documents in `node_modules/@base-ui/react/toast/**/*.d.ts` (read them; do not guess). Swipe down or right to dismiss on touch. | Transient feedback for actions that have no inline place to report | Replaces every `window.alert` (6.x lists them). Heading-anchor "Link copied" in docs |
| M13 | **PixelLoader** | `components/ui/pixel-loader.tsx` + CSS | `<PixelLoader size="sm" \| "md" \| "lg" className? />`, `aria-hidden="true"` always (the caller provides text). A 2x2 grid of squares in `currentColor`: sm cell 3px gap 2px (8px footprint, same as a status dot), md cell 4px gap 2px (10px, for buttons), lg cell 6px gap 3px (15px, for empty waits). Order clockwise: top-left, top-right, bottom-right, bottom-left, each `animation: pixel-blink 800ms steps(1, end) infinite` with delays 0, 200, 400, 600ms. Reduced motion: no animation, top-left and bottom-right at opacity 1, the other two at 0.3. | State: work in progress, branded | `StatusDot` building and queued, `Button loading`, BuildLogs running, connect testing, "Waiting for the first log line" |
| M14 | **Skeleton shimmer** | `.skeleton-sweep` (rewrite) | `background-color: var(--skeleton-base); background-image: linear-gradient(90deg, transparent 35%, var(--skeleton-highlight) 50%, transparent 65%); background-size: 100vw 100%; background-repeat: no-repeat; background-attachment: fixed; animation: skeleton-sweep 1.6s linear infinite;` Fixed attachment makes one band of light pass across every block on the page together (iOS ignores `fixed` and sweeps per block, which is acceptable). Reduced motion: `background-image: none`, no animation. | State: loading, in the shape of what is coming | Every skeleton (section 4) |
| M15 | **Grow** | `.motion-grow-y` | `transform-origin: bottom; animation: grow-y 400ms var(--ease-snappy) backwards; animation-delay: var(--grow-delay, 0ms);` | Orientation for a chart appearing | Analytics daily bars (delay `min(i * 8, 240)` ms), on first mount only |
| M16 | **Header hairline on scroll** | `.scroll-hairline` | Inside `@supports (animation-timeline: scroll())`: `animation: hairline-in linear both; animation-timeline: scroll(root); animation-range: 0 48px;`. Without support: no hairline (current look). No JavaScript, no scroll listener. | State: the header now overlaps content | Marketing header |
| M17 | **Docs nav marker glide** | Docs-only, built by Docs with `--ease-move` | The lit square slides to the active item with `transform: translateY(var(--marker-y))` over `var(--dur-base)`. | Orientation: where you are in a long page | Docs left nav only |

Also in `globals.css`, Foundation adds these non-motion utilities used by several workstreams:
- `.grid-patch`: `background-image: linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px); background-size: 16px 16px; background-position: center; mask-image: radial-gradient(ellipse 60% 70% at 50% 40%, #000 15%, transparent 75%);` Always on an `aria-hidden` absolutely positioned layer, never on the element that holds text.
- `.log-surface`: `background: var(--code-bg); font-family: var(--font-geist-mono); font-size: 13px; line-height: 20px; font-variant-numeric: tabular-nums;` and `.log-surface .log-line { padding-inline: 16px; }`, `.log-surface .log-line:hover { background: var(--ds-gray-alpha-100); }` (inside `@media (hover: hover)`), `.log-surface ::selection { background: color-mix(in oklab, var(--brand) 30%, transparent); }`.
- `.link`: `text-decoration: underline; text-decoration-color: var(--ds-gray-alpha-500); text-underline-offset: 4px; text-decoration-thickness: 1px; transition: text-decoration-color var(--dur-fast) var(--ease-snappy);` hover and focus-visible: `text-decoration-color: currentColor`.
- `.row-focus`: for rows with a stretched link: `.row-focus:has(a:focus-visible, button:focus-visible) { outline: 2px solid var(--ds-focus-color); outline-offset: -2px; } .row-focus a:focus-visible { outline: none; }` (the stretched link's own outline is replaced by the row's).

### 3.5 Route transitions: decision
There are **no directional or cross-route view transitions**. Navigating the dashboard is a frequent action; sliding pages would make it feel slower. Instead every route's content root carries `motion-enter` (M1): a 4px rise and fade over 220ms when the content mounts, which covers both "skeleton replaced by content" and "cached page shown". `router.refresh()` and polling do not remount, so they never replay it. React `<ViewTransition>` is not used in this phase.

### 3.6 Reduced motion
Replace the current global block with:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    animation-delay: 0ms !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
    scroll-behavior: auto !important;
  }
  .skeleton-sweep { background-image: none !important; }
  [data-reveal] { opacity: 1 !important; transform: none !important; }
  .pixel-loader > * { animation: none !important; } /* static pattern defined in M13 */
}
```
Consequences that are intended: every state change still happens (colour, content, open/closed), just instantly. Components that run JavaScript animations (Reveal, the docs marker, smooth scrolling) also check `window.matchMedia("(prefers-reduced-motion: reduce)")` and skip.

### 3.7 Do not animate (hard rules)
1. **Keyboard shortcuts.** Opening the find palette with `F`, focusing the docs filter with `/`, closing anything with `Esc`, moving the highlight with arrow keys: all instant. The palette opened by clicking the Find button may fade (6.4). Activating a focused button with Enter or Space counts as a click.
2. **Typing.** Search and filter results update instantly. No stagger replays (Stagger's `data-settled` guarantees this).
3. **Streaming and polling.** Build log lines, runtime log lines, the 4s deployment refresh, the 30s service check, auto-refresh logs: nothing enters, slides or fades. Only `Swap` on a value that actually changed.
4. **Dense data while scrolling.** No scroll reveal anywhere in the dashboard or docs.
5. **Frequent navigation.** Sidebar active state, tab and segmented changes, the docs filter: instant colour change only (150ms colour transition allowed).
6. **Theme switching.** Keep `disableTransitionOnChange`.
7. **Layout properties.** Never transition `width`, `height`, `top`, `left`, `margin`, `padding`. The only height animation is `::details-content` block-size (M9), which the browser handles.
8. **`transition: all`** is banned. List properties. (`ui/button.tsx` and `ui/badge.tsx` currently use `transition-all`; Foundation fixes them.)
9. Nothing loops forever except PixelLoader while work is actually in progress and the skeleton sweep while loading.

---

## 4. Skeleton rules

1. Every route has exactly one skeleton that mirrors its final layout: same container widths, same grid, same card frames, same header bars, rows at the same heights. When data arrives nothing moves more than 4px.
2. Skeletons are built only from Foundation primitives in `components/ui/skeleton.tsx`:
   - `Skeleton` (`className`): `div.skeleton-sweep rounded-md`, `aria-hidden`.
   - `SkeletonText` (`size: "title-1" | "title-2" | "title-3" | "body" | "label" | "caption"`, `width` as a Tailwind width class, `lines?: number`, `className`): each line is a row exactly the role's line-height tall (36, 28, 20, 20, 18, 16px) containing a bar of 66% of that height, `rounded-sm`, so text and skeleton share vertical rhythm.
   - `SkeletonCircle` (`size` px).
   - `SkeletonCard` (`header?: boolean`, `footer?: boolean`, `className`, `children`): real card frame (`rounded-lg bg-card shadow-border-small`) with an optional header bar (`px-4 py-3 border-b`, title bar `SkeletonText size="title-3" width="w-32"`) and optional footer bar (`bg-background-subtle border-t px-4 py-3 h-[57px]`). The frame is not shimmering; only the bars inside are.
   - `SkeletonPageHeader` (`description?: boolean`, `actions?: number`, `leading?: boolean`): mirrors `PageHeader` (6.0) exactly: optional 40px rounded-md block, title bar `w-48`, description bar `w-72`, `actions` buttons as `h-8 w-24 rounded-md` blocks (`max-sm:h-10`).
   - `SkeletonRow` (`className`, `children`): `flex items-center gap-3 px-4 py-3 min-h-12`.
   - `LoadingRegion` (`label: string`, `className`, `children`): `<div role="status" aria-busy="true" className=...><span className="sr-only">{label}</span>{children}</div>`. Every skeleton's root is a `LoadingRegion`. Labels end with `…` ("Loading deployments…").
3. Widths of text bars vary per row from a fixed list (`["w-40","w-56","w-32","w-48","w-64","w-36"]`, cycle by index). Never random (it would differ between server and client).
4. No skeleton inside a skeleton, no spinner inside a skeleton, no "Loading…" visible text on a skeleton.
5. Skeleton components live in `components/skeletons/*.tsx` (Dashboard B). File names and exports are fixed:

| Route | File / export | Contents |
| --- | --- | --- |
| `/projects` | `skeletons/projects.tsx` `ProjectsSkeleton` | Grid `gap-6 lg:grid-cols-[300px_minmax(0,1fr)]`. Right column (first on phones): toolbar row (`Skeleton h-9 flex-1 max-sm:h-10`, segmented `h-8 w-[66px]`, button `h-9 w-[104px]`), then a container-query grid identical to the real one with 6 project card skeletons: `SkeletonCard` body `p-4` with row [32px rounded-md block, two `SkeletonText` lines body w-32 and label w-40, 8px circle right], commit line `SkeletonText body w-56`, footer `SkeletonText label w-40`, total height 132px. Left column: usage card (`header` with an extra label line; 3 rows each: label + value line, a 4px bar, a 28px sparkline block), alerts card (`header`, one body line). |
| `/projects/[slug]` | `skeletons/project-overview.tsx` `ProjectOverviewSkeleton` | `SkeletonPageHeader leading description actions={4}`; production card (`header`, body `dl` grid `sm:grid-cols-2 lg:grid-cols-3` of 6 fields: label w-16 + body w-32; the source field spans 2 cols with two lines), a 45px details row, `footer`; service card (`header` with two `h-7 w-24` buttons right, 5-field grid `lg:grid-cols-5`); resources card (`header` + 2-column grid of label line and 28px block); 2-column grid of two small cards (title line + 3 lines); "Active Branches" title bar `title-2 w-40` + list card with 3 `SkeletonRow`s. |
| `/projects/[slug]/deployments` | `skeletons/deployments.tsx` `DeploymentsSkeleton` (prop `showProject: boolean`) | `SkeletonPageHeader description`, segmented `h-8 w-[262px]`, list card with 6 rows (`showProject` false) or 8 rows (true) using the same `md:grid-cols-[...]` template as `DeploymentRow`: commit line, 8px circle + label w-14, pill `h-6 w-24 rounded-full`, mono line w-40, age w-12 + 24px circle, 28px menu block. On phones rows stack exactly like the real row (two lines). Used by both `/deployments` (`showProject`) and the project route. |
| `/projects/[slug]/deployments/[id]` | `skeletons/deployment.tsx` `DeploymentSkeleton` | `SkeletonPageHeader description actions={2}`; details card (`header`, 7-field `dl` grid as the real one); build logs card: 48px header row (caret, title w-24, duration w-12 right) + 40px toolbar row + 12 log line bars (`h-3` in 20px rows, mono widths cycling w-64/w-96/w-80/w-72/w-[28rem]/w-56, `max-w-full`). |
| `/projects/[slug]/analytics` | `skeletons/analytics.tsx` `AnalyticsSkeleton` | `SkeletonPageHeader description`; 2 stat cards (`sm:grid-cols-2`, label w-20, stat bar `h-8 w-24` in a 40px row); chart card: caption row (w-36 left, w-28 right) + `h-32` area holding 30 static bars (`flex items-end gap-[3px]`, heights from a fixed list of 30 percentages, `skeleton-sweep`), axis row; 2 top-list cards (`header`, 5 rows); setup card (title-2 w-40, 2 lines, 4 short lines, button). |
| `/projects/[slug]/settings` | `skeletons/settings.tsx` `SettingsSkeleton` | Same two-column grid as the real page (6.10): left nav 6 lines (`h-8` rows, hidden below `lg`); right: Build and Run card (title-2, label line, 2x2 field grid of label + `h-9` input, a full-width field, checkbox row, `footer`), Environment Variables card (title-2, description, form row of 3 inputs + button, 3 rows), 2 more cards with title + 2 lines + button. |
| `/deployments` | `skeletons/deployments.tsx` `DeploymentsSkeleton showProject` | See above. |
| `/logs` | `skeletons/logs.tsx` `LogsSkeleton` | `SkeletonPageHeader description actions={1}`; toolbar (select `h-9 w-48`, search `h-9 flex-1 max-w-80`, checkbox label w-36, button `h-8 w-24` right); `.log-surface` frame `rounded-lg shadow-border-small min-h-[320px]` with 14 line bars. |
| `/domains` | `skeletons/domains.tsx` `DomainsSkeleton` | `SkeletonPageHeader description actions={1}`; add-form card (3-column grid `md:grid-cols-[1fr_1fr_130px]` of label + input, `footer`); list card with 3 rows: left two lines (w-48 body, w-24 label), right status (circle + w-16) and three button blocks (`h-7 w-16`, `size-7`, `size-7`). |
| `/activity` | `skeletons/activity.tsx` `ActivitySkeleton` | `SkeletonPageHeader description`; day label `SkeletonText label w-16`; list card with 8 rows (text w-[60%] cycling, time w-12 right). |
| `/account` | `skeletons/account.tsx` `AccountSkeleton` | `mx-auto max-w-[720px]`; `SkeletonPageHeader description`; profile card (title-2, description, 2 rows in an inner bordered list), GitHub card (1 row), browsers card (2 rows + button), delete card (label, input + button). |
| `/connect` | `skeletons/connect.tsx` `ConnectSkeleton` | `mx-auto max-w-[720px]`; `SkeletonPageHeader description`; one server card (title-2 w-56 + status line, 3 buttons right); add-server card: title-2, 3 steps (24px square + title line + body line, the first with an input row), warning block `h-16 rounded-lg`. |
| `/new` | `skeletons/new-project.tsx` `NewProjectSkeleton` | `mx-auto max-w-[720px]`; title bar `h-10 w-80`, description line; section title-2; select `h-9 w-56`; search `h-9`; list card with 5 repo rows (20px circle, name w-48, button `h-8 w-20` right); URL form card. |
| `(app)` generic | `skeletons/generic.tsx` `GenericSkeleton` | `SkeletonPageHeader description` + one `SkeletonCard header` 256px tall. Only for routes without their own skeleton. |
| Shell | Built by Dashboard A inside `app/(app)/layout.tsx`, `top-bar.tsx`, `nav-list.tsx` | Sidebar skeleton: 56px top row (20px block + switcher bar), find bar `h-8`, 6 nav rows (16px block + w-24 bar), bottom 3 rows. Top bar skeleton: 56px with breadcrumb bar w-40 (desktop) or 40px block + centred w-24 (phone). Main: `GenericSkeleton`. Phone: dock placeholder pill `h-11 w-[150px] rounded-xl shadow-menu` at the dock position. |
| `/status/[key]` | Marketing, inline in its page | Mirrors 6.18: name bar title-1 w-48; state card (12px square + headline bar `h-8 w-48`, detail line, uptime line with stat bar); "Recent outages" title + 3 rows. |
| `/login` | Marketing, inline in its page | Mirrors 6.17: 40px mark block, title bar, card with `h-10` button block and two caption lines. |
| `/docs`, `/`, not-found | None | Static. |

---

## 5. Interaction vocabulary

Global focus language: **one ring everywhere**: `outline: 2px solid var(--ds-focus-color); outline-offset: 2px` from the base layer. Remove `outline-none` from any element that has no replacement. Replacements allowed: inset outline (`outline-offset: -2px`) for full-width rows, nav items and list options; input border plus glow (below). Grep for `outline-none`, `outline-hidden` and `focus:outline` in your files and justify each.

| Element | Rest | Hover (pointer only) | Focus-visible | Active / press | Disabled | Loading | Error | Success |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Button** (`ui/button`) | Variant styles as now | Variant hover, 150ms colour | Global ring, offset 2px | `scale(0.97)` in 100ms, out 160ms | `opacity-50`, `pointer-events-none`, `aria-disabled` when it must stay focusable | `loading` prop: `aria-busy="true"`, disabled, leading icon replaced by `PixelLoader md` (or prepended if no icon), label text changes to the "…ing…" form the caller passes. Width may grow; never jump layout of siblings (buttons sit at row ends) | `aria-invalid` red border (existing) | Caller swaps label with `Swap` ("Saved") for 1.6s |
| **Text link** | `.link` (underline at 40% alpha) or plain for nav | Underline to `currentColor` | Global ring | None | n/a | n/a | n/a | n/a |
| **Nav item** (sidebar, docs nav, settings nav) | `text-muted-foreground`, 32px tall (`max-sm:h-11` in the phone menu) | `bg-[var(--ds-gray-alpha-100)] text-foreground` | Inset ring | None | n/a | n/a | n/a | n/a |
| **Nav item current** | `bg-[var(--ds-gray-200)] text-foreground`, filled icon, `aria-current="page"` (in-page nav: `aria-current="location"`) | same | Inset ring | None | | | | |
| **Row with link** (deployment, branch, recent, repo) | Transparent | `bg-[var(--ds-gray-alpha-100)]` 150ms | `.row-focus` inset ring on the row | None | | | | |
| **Interactive card** (project card, docs tile) | `shadow-border-small` | `.card-interactive` ring darkens | Global ring offset 2px | `active:scale-[0.99]` on docs tiles only | | | | |
| **Input / textarea** | `border-input bg-transparent h-9 max-sm:h-10 max-sm:text-base` | `border-[var(--ds-gray-alpha-600)]` 150ms | `outline-none`, `border-[var(--ds-focus-color)]`, `shadow-[0_0_0_3px_color-mix(in_oklab,var(--ds-focus-color)_25%,transparent)]` | n/a | `opacity-50 cursor-not-allowed` | n/a | `aria-invalid="true"`, red border and red glow, message below with `id` referenced by `aria-describedby`, `role="alert"` only when it appears after submit | n/a |
| **Native select** (`ui/native-select`) | Same as input, `appearance-none`, `CaretDownIcon` 16px at right 10px, explicit `bg-background text-foreground` (Windows dark mode) | same | same | n/a | same | n/a | same | n/a |
| **Checkbox row** | Native 16px checkbox inside its `<label>`; the label is `inline-flex items-center gap-2 min-h-10 sm:min-h-8` | none | Global ring on the checkbox | n/a | `opacity-50` | | | |
| **Menu item** | Transparent, `min-h-8 max-sm:min-h-10` | Highlight `bg-accent` (Base UI `data-highlighted`, no transition so arrow keys feel instant) | Same highlight | None | `opacity-50` | | Destructive variant red | |
| **Segmented** | Item `h-7 max-sm:h-10 max-sm:min-w-10`, `text-muted-foreground` | `text-foreground` | Inset ring | `scale(0.97)` | | | | |
| **Segmented current** | `bg-[var(--ds-gray-200)] text-foreground`, `aria-pressed` | | | | | | | |
| **Card (static)** | `rounded-lg bg-card shadow-border-small` | none (never hover a non-interactive card) | n/a | n/a | | Skeleton | Error `Alert` inside the card body | |
| **Empty** | `EmptyState` (6.0) | | | | | | | |
| **Inline error** | `Alert tone="error"` with `role="alert"` when it appears after an action | | | | | | | |
| **Transient error** | `toast.error(message)` | | | | | | | |
| **Copy** | `CopyField` button "Copy" | | | | | | | Icon `CheckIcon`, label "Copied" via `Swap`, back after 1.6s, `aria-live="polite"` region announces "Copied" |

Tooltips are a supplement, never the only place information lives (the rollback tooltip text also appears as `aria-describedby`).

---

## 5.1 Foundation components (API is final)

Built by Foundation in phase 2. Everyone else uses them as specified.

- **`ui/button.tsx`**: base classes: replace `transition-all` with `transition-[background-color,color,box-shadow,opacity,transform] duration-(--dur-fast) ease-snappy`; remove `outline-none`, `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` (the global ring takes over); replace `active:not-aria-[haspopup]:translate-y-px` with `active:scale-[0.97] active:duration-(--dur-press)`. Sizes: `default` adds `max-sm:h-10 max-sm:px-3`, `sm` adds `max-sm:h-10`, `xs` adds `max-sm:h-10`, `icon`/`icon-sm`/`icon-xs` add `max-sm:size-10`, `icon-lg` adds `max-sm:size-10`. New variant `destructive-solid`: `bg-destructive text-destructive-foreground hover:bg-[color-mix(in_oklab,var(--destructive)_88%,var(--foreground))]`. New prop `loading?: boolean` (see section 5). Export unchanged names plus nothing else.
- **`ui/input.tsx`**: section 5 states. `h-9 max-sm:h-10`, `text-base md:text-sm` (existing), placeholder `text-muted-foreground`.
- **`ui/native-select.tsx`** (new): `NativeSelect` = `React.ComponentProps<"select">` wrapped in `div.relative`; same classes as Input plus `appearance-none pr-8`. Also export `nativeSelectClass` string.
- **`ui/skeleton.tsx`**: section 4.2 exports. Keep exporting `Skeleton`.
- **`ui/pixel-loader.tsx`** (new): M13.
- **`ui/pixel-avatar.tsx`** (new): `PixelAvatar({ seed: string, size: 16 | 20 | 32 | 40, className? })`. FNV-1a 32-bit hash of `seed`; 15 bits fill the left 3 columns of a 5x5 grid, mirrored to columns 4 and 5. If fewer than 5 or more than 12 cells are lit, flip the bits (keeps every avatar readable). SVG `viewBox="0 0 7 7"` with the 5x5 cells at offset 1 (padding), `shapeRendering="crispEdges"`, cells `fill="currentColor"` in `text-foreground`, tile `rounded-[4px]` (16, 20) / `rounded-md` (32) / `rounded-lg` (40), `bg-[var(--ds-gray-100)] shadow-border-base`, `aria-hidden="true"`. Deterministic: same seed, same picture, server and client.
- **`ui/empty-state.tsx`** (new): `EmptyState({ icon?: ReactNode, title: string, description?: ReactNode, action?: ReactNode, size?: "default" | "compact", className? })`. Default: `relative overflow-hidden rounded-lg bg-background shadow-border text-center px-6 py-14`, an `aria-hidden` `div.grid-patch.absolute.inset-0`, content `relative flex flex-col items-center`; icon in a `size-10 rounded-md bg-background shadow-border-small` tile, icon 20px `text-muted-foreground` (if no icon, `NestMark` 20px); title `mt-4 text-body-lg font-semibold`; description `mt-1 max-w-[46ch] text-muted-foreground`; action `mt-5 flex flex-wrap justify-center gap-2`. Compact: no grid patch, no frame, `py-8`, icon inline 16px left of the title, left-aligned, for use inside a card body. Title is a `<p>`, not a heading, unless the caller passes a heading level via `as="h2"`.
- **`ui/alert.tsx`** (new): `Alert({ tone: "note" | "info" | "success" | "warning" | "error", title?: ReactNode, children, action?: ReactNode, role?: "alert" | "status", className? })`. `flex gap-3 rounded-lg p-4 bg-[var(--tone-X-bg)] shadow-[0_0_0_1px_var(--tone-X-ring)]`, icon 16px `mt-0.5` (`InfoIcon`, `InfoIcon`, `CheckCircleIcon`, `WarningIcon`, `WarningCircleIcon`) in `--tone-X-icon`, text `text-foreground`, title `font-medium`, body below title `mt-0.5`. No coloured side border. `role` defaults to none.
- **`ui/alert-dialog.tsx`** (new): Base UI wrappers `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent` (portal, backdrop, popup), `AlertDialogTitle` (`text-body-lg font-semibold`), `AlertDialogDescription` (`mt-1.5 text-muted-foreground`), `AlertDialogFooter` (`mt-5 flex justify-end gap-2 max-sm:flex-col-reverse max-sm:[&>*]:w-full`), `AlertDialogClose`. Plus `ConfirmDialog({ trigger: ReactElement, title, description, confirmLabel, pendingLabel, tone?: "default" | "destructive", onConfirm: () => Promise<void> | void })`: trigger is passed as Base UI `render`; confirm button is `variant={tone === "destructive" ? "destructive-solid" : "default"}` with `loading` while `onConfirm` runs; on resolve the dialog closes; on throw it stays open and shows the message in an `Alert tone="error" role="alert"` above the footer. Initial focus on Cancel when destructive.
- **`ui/toast.tsx`** (new): exports `Toaster` (mount once) and `toast` with `toast.success(title, description?)`, `toast.error(title, description?)`, `toast.info(title, description?)`. Viewport: `fixed z-(--z-toast) bottom-4 right-4 w-[356px]`; below 640px `inset-x-4 w-auto bottom-[calc(76px+env(safe-area-inset-bottom))]` (clears the dock). Root: `rounded-lg bg-popover shadow-menu p-3 pr-10`, tone icon 16px, title `font-medium`, description `text-label text-muted-foreground`, close button `size-7 max-sm:size-10` top-right with `aria-label="Dismiss"`. Errors last 6s, others 4s, paused while hovered or focused. Errors are added with Base UI's `priority: "high"` (assertive), others with the default (polite).
- **`motion/stagger.tsx`, `motion/reveal.tsx`, `motion/swap.tsx`** (new): section 3.4.
- **`motion/use-scroll-spy.ts`** (new): `useScrollSpy(ids: string[], options?: { offset?: number }): string | null`. One `IntersectionObserver` with `rootMargin: \`-${offset}px 0px -60% 0px\`` (offset default 96) over the elements with those ids. Active id = the topmost intersecting element; when none intersect, the last element whose top is above the offset line (computed from the entries' `boundingClientRect`, no scroll listener); before the first element, the first id. Re-evaluates on `hashchange`. Returns null on the server.
- **`status-dot.tsx`**: keep `StatusDot({ state, showLabel, className })` exactly; `building` and `queued` render `PixelLoader size="sm"` in `text-[var(--status-building)]` (queued in `text-subtle-foreground`) instead of a dot; others keep the 8px round dot. Add `StatusIndicator({ tone: "ready" | "building" | "error" | "warning" | "neutral", label: ReactNode, pending?: boolean, className? })` with the same layout (8px dot or PixelLoader when `pending`, gap 8px, `font-medium tracking-[-0.01em]`).
- **`page-header.tsx`**: `PageHeader({ title: ReactNode, description?: ReactNode, actions?: ReactNode, leading?: ReactNode, className? })`. Layout: `mb-6 flex flex-wrap items-end justify-between gap-4`; left `flex min-w-0 items-center gap-4` with `leading` then a block holding `h1.text-title-1 truncate` and description `mt-1 max-w-[60ch] text-muted-foreground`; actions `flex flex-wrap items-center gap-2`. On phones actions drop below the title and stretch left-aligned.
- **`segmented.tsx`**: section 5 row; `transition-colors duration-(--dur-fast)`; remove `outline-none` and the ring classes, use the inset outline.
- **`copy-field.tsx`**: copy state with `Swap`; button `max-sm:h-10`; add an `sr-only` `aria-live="polite"` span that reads "Copied" (move `aria-live` off the button).
- **`ui/dropdown-menu.tsx`**, **`ui/tooltip.tsx`**, **`ui/badge.tsx`**: M10 and the `transition-all` fix.
- **`app/layout.tsx`**: mount `<Toaster />` inside `TooltipProvider`. Nothing else changes.
- **`lib/fonts.ts`** (new): `export const pixel = Pixelify_Sans({ variable: "--font-pixel", subsets: ["latin"] });`. Marketing switches its layout to import it and uses it in login, status and not-found.

---

## 6. Surface briefs

Each brief ends with acceptance criteria (AC). The reviewer checks every AC.

### 6.0 Shared dashboard conventions
- Content root of every dashboard route is `<div className="motion-enter">` (or the existing root element gets the class). Route files: `projects/page.tsx`, `projects/[slug]/page.tsx`, `projects/[slug]/deployments/page.tsx`, `projects/[slug]/deployments/[id]/page.tsx`, `projects/[slug]/analytics/page.tsx`, `projects/[slug]/settings/page.tsx`, `deployments/page.tsx`, `logs/page.tsx`, `domains/page.tsx`, `activity/page.tsx`, `account/page.tsx`, `connect/page.tsx`, `(flow)/new/page.tsx`. Apply it to the element that replaces the skeleton (inside the Suspense boundary).
- Every dashboard page has exactly one `h1` (PageHeader or equivalent). Card titles are `h2`.
- Contextual docs links: a ghost `Button` size `sm` rendered as a `Link`, label "Docs", trailing `ArrowUpRightIcon` 14px, `aria-label="Read the docs about <topic>"`, linking to the anchor given in each brief. Placed in PageHeader `actions` (or the card header for settings).
- Replace every `window.alert` with `toast.error`. Replace every `window.confirm` with `ConfirmDialog` using the exact same sentence as the title and description given in the brief.
- Every "..." in visible copy becomes "…".

### 6.1 Docs (`/docs`), most important surface

**Mode: Read.** The page should feel like a well-set manual: quiet, generous, fast to scan, impossible to get lost in. Identity lives in the Pixelify headings, the lit-square nav marker and the square bullets; everything else gets out of the way of the words.

**Information architecture.** One page, one route (`/docs`), all existing sections in the existing order and groups. Do not split into sub-routes (the proxy only allows `/docs` publicly, and anchors are linked from elsewhere).
- Groups and sections (titles unchanged): Start (How it works `#overview`, Quick start `#quickstart`); Use it (Servers, Projects and runtimes, Deployments, Environment variables, Logs, Domains); Automate (GitHub and previews, Deploy hooks, Notifications); Watch (Monitoring and uptime, Status page, Analytics, Activity and account); Reference (Security, Running your own, Limits, Troubleshooting).
- New `h3` ids (fixed; add them to the existing `H3`s, same text):
  `overview-push` (What happens on a push), `servers-connection` (How the connection works), `servers-manage` (Testing, rotating and removing), `projects-settings` (Settings), `projects-runtimes` (Runtimes), `projects-guarantees` (What every app can rely on), `deployments-states` (States), `deployments-actions` (Actions), `deployments-releases` (Releases and previews on disk), `deployments-previews` (Branch previews), `github-push` (Deploying on push), `github-pr-previews` (Pull request previews), `monitoring-service-card` (The Service card), `monitoring-resources` (Resource use), `monitoring-uptime` (Uptime checks and alerts), `analytics-setup-steps` (Setting it up), `analytics-data` (What you see), `analytics-privacy` (Privacy), `troubleshooting-connection` (Test connection fails), `troubleshooting-build` (The build fails), `troubleshooting-no-answer` (It built, but the app never answered), `troubleshooting-domain` (A domain stays on "Needs attention"), `troubleshooting-hook-409` (A deploy hook answers 409), `troubleshooting-pr-comment` (No comment appears on a pull request), `troubleshooting-alerts` (Alerts or notifications do not arrive).
- Single source of truth: `app/(marketing)/docs/_data/nav.ts` exports `DOCS_NAV: { group: string; sections: { id: string; title: string; subsections: { id: string; title: string }[] }[] }[]`. `Section` and `H3` take only an `id` and read their title from it, so nav and headings cannot drift.

**Layout.**
- Container `mx-auto w-full max-w-[1200px] px-4 sm:px-6`.
- **Docs hero** (transparent, sits on the marketing pixel grid): `pt-14 pb-12 lg:pt-20 lg:pb-16`. `h1` "Docs" in `font-pixel text-docs-h1`. Lead (existing sentence) `mt-5 max-w-[56ch] text-docs-lead text-muted-foreground`. Then the **Start here** tiles, `mt-10`: a square frame `grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-4`; each tile is a link `lit-corner card-interactive block bg-background p-5 min-h-[112px]` with title (`text-[15px] leading-[22px] font-semibold`) and a trailing `ArrowRightIcon` 16px that moves `translate-x-0.5` on hover (150ms), and a description `mt-1.5 text-[14px] leading-5 text-muted-foreground`. Tiles, exact copy:
  1. Quick start → `#quickstart`: "From nothing to a deployed app in four steps."
  2. Connect a server → `#servers`: "A server is one Nest account. You can connect more than one."
  3. Deploy hooks → `#hooks`: "Start a deployment from CI, a cron job or a script."
  4. Troubleshooting → `#troubleshooting`: "What to check when a step fails."
- **Reading band**: full-width (break out of the container) `bg-background border-y`, opaque, so the grid never sits behind text. Inner container as above with `grid lg:grid-cols-[232px_minmax(0,1fr)] gap-12 xl:gap-16 pt-12 pb-24 lg:pt-16`.
- **Article column**: `min-w-0 max-w-[760px]`. Prose elements (p, lists, callouts) `max-w-[68ch]`; code blocks and tables use the full 760px.

**Left nav (lg+).** Client component `_components/docs-nav.tsx`.
- `nav aria-label="Docs"`, `sticky top-[88px] max-h-[calc(100dvh-112px)] overflow-y-auto overscroll-contain pb-8 pr-2`.
- Filter field at top: `Input` `h-9 text-[13px]`, leading `MagnifyingGlassIcon` 16px, placeholder "Filter sections…", trailing `kbd` "/" (`text-caption` bordered, hidden while focused or filled), `aria-label="Filter docs sections"`, `aria-controls` the list. `/` focuses it when focus is not in a field (no animation). `Esc` clears and blurs.
- Groups: group label `text-[12px] leading-4 font-medium text-subtle-foreground mt-6 first:mt-4 mb-1.5 px-3` (a nav label, not an eyebrow above a heading). Items: `a` `block rounded-md px-3 py-1.5 text-[14px] leading-5 text-muted-foreground hover:text-foreground hover:bg-[var(--ds-gray-alpha-100)]`, inset focus ring.
- Current section (from `useScrollSpy` over the 19 section ids and the h3 ids, offset 96): link `text-foreground font-medium`, `aria-current="location"`. Its subsections expand beneath it: `pl-6 text-[13px] leading-5 py-1`, the current subsection `text-foreground`. Only the current section's subsections show (no animation; they simply appear).
- **Lit marker**: the list has a 1px rail (`border-l` at the items' left edge, `ml-px`). A 5x5px square `bg-[var(--pixel-lit)]` sits on the rail at the current item's vertical centre, positioned with `transform: translateY(var(--marker-y))`, `transition: transform var(--dur-base) var(--ease-move)`; `--marker-y` is measured from the active link's `offsetTop` in an effect when the active id or the layout changes (`ResizeObserver` on the list). Hidden while the filter has a query. Reduced motion: no transition.
- Filtering: case-insensitive substring match on section titles, subsection titles and group names. Matching sections show; a section matched only through a subsection shows with only the matching subsections. Count announced in an `sr-only aria-live="polite"` span ("3 sections"). No results: "No sections match “query”." and a ghost `Button size="sm"` "Clear filter".
- Clicking any nav link: `preventDefault`, `scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" })` on the target, `history.pushState(null, "", "#id")`, then `focus({ preventScroll: true })` on the target heading (headings get `tabIndex={-1}` and no visible focus ring for programmatic focus: `focus:outline-none` only on these headings, `focus-visible` still shows).

**Mobile and tablet (< lg).** Client component `_components/docs-mobile-nav.tsx`.
- A sticky bar inside the reading band: `sticky top-14 z-40 -mx-4 sm:-mx-6 h-12 border-b bg-background px-4 sm:px-6`. One full-width button: left "On this page" (`text-label text-muted-foreground`), then the current section title (`font-medium truncate`), right `CaretDownIcon` that rotates 180deg when open. `aria-expanded`, `aria-controls`.
- Panel: absolutely positioned under the bar, full bar width, `max-h-[70dvh] overflow-y-auto overscroll-contain bg-background shadow-menu border-b p-4`, contains the same nav (filter + groups, no marker, items `min-h-10` rows). Opens with `opacity 0 to 1, translateY(-4px) to 0` over 180ms `ease-snappy`; closes instantly. Closes on link click, `Esc` (focus returns to the bar button), or a click outside.
- Headings use `scroll-mt-24 max-lg:scroll-mt-32`.

**Typography for long-form reading.**
- `h2`: `font-pixel text-docs-h2 text-foreground` inside the section's first row, `scroll-mt-24 max-lg:scroll-mt-32`. Sections are `pt-16 mt-16 border-t first:mt-0 first:pt-0 first:border-t-0` (no `space-y` on the column).
- Section intro: `mt-3 text-docs-lead text-muted-foreground max-w-[68ch]`.
- `h3`: `mt-10 text-docs-h3 text-foreground scroll-mt-24 max-lg:scroll-mt-32`.
- Paragraphs: `mt-4 text-prose text-reading max-w-[68ch]` (`text-prose` is the 16/28 size, `text-reading` the `--prose` colour). `strong` is `font-semibold text-foreground`.
- Unordered lists: no native bullets; each `li` has `relative pl-5` and a `before:` 5x5px square `bg-[var(--subtle-foreground)]` at `top-[0.7em]` (the lit-square bullet). Ordered lists: native `list-decimal pl-5 marker:text-subtle-foreground marker:font-medium marker:tabular-nums`. Item spacing `space-y-2`, list `mt-4`.
- Inline code `C`: `rounded-[3px] bg-[var(--ds-gray-100)] px-1 py-px font-mono text-[0.875em] text-foreground shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-200)] [overflow-wrap:anywhere]`.
- Links in prose: `.link` and `font-medium text-foreground`. External links get `target="_blank" rel="noreferrer"` (existing) and an `sr-only` "(opens in a new tab)".

**Heading anchors.** `_components/heading-anchor.tsx` (client). Each `h2` and `h3` is wrapped `group relative`; after the text an `a href="#id"` with `LinkSimpleIcon` 16px, `aria-label="Link to <title>"`, `size-6 inline-flex items-center justify-center rounded-md text-subtle-foreground hover:text-foreground`. On `lg+` it is positioned `absolute -left-8 top-1/2 -translate-y-1/2`; below `lg` inline `ml-2 align-middle`. `opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-(--dur-fast)`. Hidden below 640px (`max-sm:hidden`), where the mobile nav covers jumping. Click: normal hash navigation plus `navigator.clipboard.writeText(location.href)` and `toast.success("Link copied")`; if the clipboard throws, only navigate.

**Code blocks.** `_components/code-block.tsx` (client for copy). Props `label: "Terminal" | "HTML"`, `code: string`.
- Square frame `mt-6 border bg-[var(--code-bg)]`. Header bar `flex h-10 items-center justify-between border-b px-3`: label `font-mono text-[12px] text-muted-foreground`; copy button `inline-flex h-7 max-sm:h-10 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-muted-foreground hover:bg-[var(--ds-gray-alpha-100)] hover:text-foreground pressable`, `CopySimpleIcon` 14px and "Copy", swapping to `CheckIcon` and "Copied" for 1.6s with `Swap`, `sr-only aria-live` "Copied".
- Body `pre` `overflow-x-auto p-4 text-code font-mono`, `tabIndex={0}` and `aria-label="<label> code"` so it can be scrolled by keyboard. Shell comments (text from `#` to end of line, outside quotes) render in `text-subtle-foreground`; nothing else is highlighted.
- Existing blocks: hooks curl → `Terminal`; analytics script tag → `HTML`; self-host commands → `Terminal`.

**Callouts.** `Callout({ tone: "note" | "tip" | "warning", title, children })`. Square frame `mt-6 max-w-[68ch] flex gap-3 p-4 bg-[var(--tone-X-bg)] shadow-[inset_0_0_0_1px_var(--tone-X-ring)]` (tip uses the success tokens), icon 16px `mt-1` (`InfoIcon`, `CheckCircleIcon`, `WarningIcon`), title `text-[14px] leading-6 font-semibold text-foreground`, body `text-docs-small text-foreground/85`. No left border bar. Tones for the existing notes: "What it does not do" note; "Your app has to listen on the right port" warning; "Taking access back" note; "Failed deploys are safe" tip; "Secrets in logs" warning; "Permissions for the comment" note; "Treat it like a password" warning. The closing "Still stuck?" paragraph becomes a note callout titled "Still stuck?" with the same sentence and links.

**Tables.** `Table({ head, rows, caption })` where `caption` is a short accessible name (the nearest `h3`, or the section title).
- Wrapper `mt-6 overflow-x-auto border`, `role="region"` `aria-label={caption}` `tabIndex={0}`; `table` `w-full border-collapse text-left text-docs-small`, 3-column tables `min-w-[560px]`, 2-column tables no minimum.
- `thead` `bg-background-subtle`; `th` `scope="col" border-b px-4 py-2.5 text-[13px] font-medium text-muted-foreground`.
- `td` `px-4 py-3 align-top`; first column `font-medium text-foreground sm:w-[34%]` (2-col) and `whitespace-nowrap` only `sm+`; other columns `text-reading`. Rows `divide-y`.

**Back to top.** At the end of the article: a `.link` "Back to top" with `ArrowUpIcon` 14px linking to `#top`, `mt-16 text-label`.

**Prev/next.** Not built. The page is one continuous document with a persistent section nav (desktop rail, mobile sticky bar); prev/next links would duplicate it and add noise after every section.

**Search.** The nav filter is the quick-jump. No full-text search.

**Motion on docs.** Only: nav marker glide (M17), anchor fade, copy `Swap`, mobile panel open, `card-interactive` and `lit-corner` on tiles, smooth scroll on nav clicks. No reveal, no stagger, no route enter.

**AC (docs).**
1. All 19 section ids and their `-h` ids exist and land with the heading fully visible below the sticky header (and the mobile bar). The 25 new `h3` ids exist exactly as listed.
2. Nav titles and heading titles come from `DOCS_NAV`; no section or `h3` title is typed twice.
3. Scrolling updates the current section in the nav within one frame of a heading crossing 96px from the top; the marker glides; subsections of the current section show. `aria-current="location"` is on exactly one link.
4. `/` focuses the filter; typing filters; `Esc` clears; zero results shows the empty message and the Clear button; the count is announced.
5. At 375px: no page-level horizontal scroll; the sticky "On this page" bar shows the current section; the panel opens, scrolls, closes on link click and `Esc`; every control in it is at least 40px tall.
6. Every code block copies its exact text and announces "Copied"; every table and code frame is keyboard-scrollable when it overflows.
7. Body prose is 16/28 at most 68ch wide; contrast of `--prose` on `--background` is at least 7:1 in light and dark (verify computed colours).
8. All seven callouts use the assigned tone; none has a side border; icons are Phosphor.
9. No copy changed except: the four tile descriptions, "Filter sections…", "On this page", "No sections match …", "Clear filter", "Back to top", "Link copied", "Still stuck?" title, the code labels, and the screen-reader strings.
10. Server-rendered HTML (`curl http://localhost:3100/docs`) contains every section's full text (client components only wrap navigation and copy).

### 6.2 Marketing header and footer (`app/(marketing)/layout.tsx`)
- Load `pixel` from `lib/fonts.ts`.
- Header: keep structure, height 56, `sticky top-0 z-(--z-header) bg-background-subtle scroll-hairline`. Nav links `text-[14px] text-muted-foreground hover:text-foreground transition-colors`; the Docs link gets `aria-current="page"` and `text-foreground` on `/docs` (small client component `components/marketing/marketing-nav.tsx` using `usePathname`).
- **Phone menu** (below `md`): a 40px ghost icon button (`ListIcon`, `aria-label="Open menu"`, `aria-expanded`) before the theme button. It opens a panel under the header: `absolute inset-x-0 top-14 border-b bg-background-subtle shadow-menu`, rows `h-11 px-6 text-[15px]` for each NAV item, GitHub, and Log in; opens with M1-style fade and 4px rise over 180ms, closes instantly on link click, `Esc` (focus returns to the button) or outside click. Lives in `components/marketing/mobile-menu.tsx`.
- "Log in" and "Dashboard" small buttons get `max-sm:h-10`; the theme button `max-sm:size-10`.
- Footer: keep the four columns and copy. Links `w-fit py-1 max-sm:py-2.5` for 40px targets. No new rules or borders (a previous fix removed doubled rules; do not reintroduce them).
- AC: header shows a hairline only after scrolling (in Chromium; elsewhere none) [visual]; on a phone every nav destination is reachable from the header; `aria-current` on Docs at `/docs`; no layout shift when the menu opens; skip link still targets `#top`.

### 6.3 Homepage below the hero (`app/(marketing)/page.tsx`)
The hero function, its classes and its inline styles do not change. Everything after `<Hero />` may.
- **Reveal**: wrap the content block of each section (heading plus its frame) in one `Reveal` (M4). Not per paragraph. Sections: product showcase, Start, logs showcase, Runtimes, Security, FAQ, CTA.
- **Showcase**: the feature list items get the lit-square bullet (as docs lists, square `bg-foreground`). The demo frame gains a header bar `h-10 border-b px-4 flex items-center font-mono text-[12px] text-muted-foreground` reading "Deployments" (product) and "Build logs" (logs). The frames contain the real `DeploymentsView` and `BuildLogs` components with `demo` / sample data (unchanged props).
- **Start**: above the three steps (md+), a step track: a 1px horizontal hairline across the frame top with an 8x8px square at the start of each column; each square is a `Reveal variant="light"` with delays 0, 150, 300ms, so the squares switch on one after another when the section appears. No numbers, no "Step 1". Phones: squares sit left of each step title instead, same reveal.
- **Runtimes, Security, FAQ**: layout unchanged. Do not add hover effects to non-interactive tiles.
- **CTA**: the terminal frame's three lines are each a `Reveal variant="light"` with delays 0, 500, 1100ms; the last line gets a 6px lit square before "live on your Nest". Primary pill in the CTA section: add `hover:bg-[color-mix(in_oklab,var(--foreground)_86%,var(--background))]` and `transition-[transform,background-color]`. The hero's buttons are not touched.
- AC: hero byte-identical (`git diff` shows no change inside `function Hero`); each section reveals once, 100px into the viewport, and is fully visible with JavaScript disabled and with reduced motion; at most one Reveal per section block plus the step squares and terminal lines; no eyebrow labels added; all anchors intact; 375px clean.

### 6.4 Dashboard shell (Dashboard A)
**Sidebar (`components/sidebar.tsx`, lg+)**
- Top row exactly 56px (`h-14 border-b px-2 flex items-center gap-1`) so it lines up with the top bar's hairline: `NestMark` 20px inside a 32px `Link href="/projects"` (`aria-label="Nest Deploy home"`, rounded-md, hover gray-alpha-100), then `ServerSwitcher` (flex-1, `h-9`).
- Below: `FindButton` in `p-2` (`h-8`, remove `outline-none`; `kbd` "F").
- Nav (`nav-list.tsx`): items per section 5. Project context: the back link, then a project label row `px-2 pt-3 pb-1 flex items-center gap-2 text-[12px] text-subtle-foreground` with `PixelAvatar size={16}` and the name.
- Bottom group (`border-t p-2`): "Docs" (`Link href="/docs"`, `BookOpenTextIcon`), "Nest guides" (external, trailing `ArrowUpRightIcon` 12px `text-subtle-foreground`), `UserMenu`.
- `lib/nav.ts`: project "Overview" icon becomes `HouseLineIcon` (the triangle is Vercel's logo; do not use it). `findTargets` adds Pages: "Account" `/account`, "New project" `/new`, "Docs" `/docs`, and every target gets an `icon` field (projects use `PixelAvatar` in the palette, not an icon).

**Top bar (`components/top-bar.tsx`)**
- `h-14 sticky top-0 z-(--z-topbar) border-b bg-background-subtle`.
- Desktop (lg+): left is a breadcrumb `nav aria-label="Breadcrumb"` with an `ol`: "Projects" link; in a project: `/` separator (`text-[var(--ds-gray-alpha-500)]`, `aria-hidden`), then a **project switcher** (`DropdownMenu` trigger: `PixelAvatar 16` + name + `CaretUpDownIcon`; items: every project from `useAccount().projects` with `PixelAvatar 16` and a `CheckIcon` on the current one, separator, "All projects", "New project"), then `/` and the sub-page label ("Overview", "Deployments", "Analytics", "Settings", or "Deployment" + the short id in mono on the detail page) with `aria-current="page"`. Team pages (`/projects`, `/deployments`, `/logs`, `/domains`, `/activity`, `/connect`, `/account`) show a single crumb: the page title from `navFor` ("Projects" on `/projects`), `aria-current="page"`. The centred title is removed on desktop.
- Phones: left a 40px back chevron (existing logic) or a 40px NestMark home link; centre the title (existing, truncated); right a 40px ghost icon button `PlusIcon` (`aria-label="Create new"`) opening the same Create New menu. Remove the duplicate NestMark on the right.
- Right on desktop: "Create New" menu (existing).

**Mobile dock (`components/mobile-dock.tsx`)**
- Position `bottom-[calc(16px+env(safe-area-inset-bottom))]`, `z-(--z-dock)`. Buttons `h-11` with `pressable`.
- Menu sheet: on open, focus moves to the first nav link; `Esc` and the toggle close it and return focus to the toggle; while open, set `inert` on the element marked `data-app-content` (add that attribute to the shell's content wrapper in `app/(app)/layout.tsx`). Enter: content `opacity 0, translateY(8px)` to rest over 220ms `ease-sheet`; close instantly. Nav rows `h-11`.

**Find palette (`components/find-palette.tsx`)**
- `useFind().open` becomes `open(options?: { instant?: boolean })`; the `F` shortcut calls `open({ instant: true })`, buttons call `open()`. When instant, the panel and overlay render with no animation classes. Otherwise overlay `fade-in` 150ms and panel `fade-in zoom-in-[0.98]` 150ms `ease-snappy`. Close is always instant.
- Overlay `bg-[color-mix(in_oklab,var(--ds-background-200)_70%,transparent)]`, no blur. Panel `rounded-xl shadow-modal`, `top` 12vh (8vh on phones), `w-[calc(100vw-32px)] max-w-[560px]`.
- Input `h-12 text-base sm:text-[15px]`, placeholder "Find pages and projects…".
- Options `h-9 max-sm:h-11 gap-2.5` with a 16px leading icon (nav icon or `PixelAvatar 16`), label, and on the active option a trailing `kbd` "↵" (`text-caption`). Active `bg-[var(--ds-gray-200)]`, no transition.
- Footer bar (hidden below 640px) `h-9 border-t px-3 text-caption text-muted-foreground`: `kbd`s for "↑ ↓ Move", "↵ Open", "Esc Close".
- `Tab` keeps focus on the input (prevent default); focus returns to the opener on close (existing).
- Shell skeletons as in section 4.
- **AC (shell)**: sidebar top row and top bar share one continuous hairline at 56px [visual]; every nav item, Find, switcher and user menu show a visible focus ring; breadcrumb and switcher work by keyboard; pressing `F` opens the palette with no animation, clicking Find animates; dock menu traps focus via `inert`, returns focus, and every row is 44px; no TriangleIcon remains in the app.

### 6.5 Projects overview (`/projects`, Dashboard A)
- Wrap the data in `Suspense` with `ProjectsSkeleton` (move the existing awaits into an inner async component; same calls).
- Layout unchanged (`lg:grid-cols-[300px_minmax(0,1fr)]`, projects first on phones).
- Toolbar: search (`flex-1 min-w-[200px]`, placeholder "Search projects…"), segmented grid/list, "Add New" primary. On phones search takes a full row.
- Grid view: wrapper `@container`, list `grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-3`, rendered with `Stagger as="ul"`.
- **ProjectCard** (`project-card.tsx`): `card-interactive rounded-lg bg-card p-4 shadow-border-small h-full flex flex-col gap-4`, focus ring offset 2px. Header row: `PixelAvatar seed={slug} size={32}`, name (`font-medium tracking-[-0.01em] truncate`), address (`text-label text-muted-foreground truncate`), `StatusDot` right. Middle: `GitCommitIcon` 16px, short sha `font-mono text-[12px] text-muted-foreground`, commit message truncated (or "Deployment in progress" / "Not deployed yet"). Footer `mt-auto text-label text-muted-foreground`: `GithubLogoIcon`, repo, one `·`, age.
- List view: `ProjectCard variant="row"`: inside one `rounded-lg bg-card shadow-border-small` list with `hairline-y`; each row is a stretched link with `row-focus` and hover surface: `PixelAvatar 20`, name, address (hidden below sm), commit (hidden below md), age, status.
- Empty states with `EmptyState`: no server (icon `HardDrivesIcon`, title "Connect your Nest server", existing description, action primary "Connect a server" `/connect`); no projects (icon `GitBranchIcon`, title "No projects yet", existing description, action "Add your first project" `/new`); no search match (`size="compact"`, title "No projects match “query”", description "Try a project name, repository, or domain.", action outline "Clear search").
- Side cards: headers `text-title-3`. Alerts: none → compact line with `CheckCircleIcon` 16px in `text-[var(--ds-green-900)]` and "Nothing needs attention."; items use `StatusIndicator` (error for down and failing, warning for pressure) above their sentence. Recent deployments rows: hover surface and `row-focus`.
- UsageCard: unchanged structure; meter bars `transition-[width]` is not allowed, leave static; numbers `tabular`.
- **AC**: skeleton swaps for content with no jump larger than 4px [visual]; cards stagger once on load and never on search or view switch; 1, 2, 3 columns follow the container width; empty states render for each case (dev user has no server, check `/projects` signed in via dev login).

### 6.6 Project overview (`/projects/[slug]`, Dashboard A)
- Fallback `ProjectOverviewSkeleton`.
- New page header: `PageHeader leading={<PixelAvatar seed={slug} size={40} />} title={project.name} description={address link (.link) or "Port N"}` with actions in this order: GitHub icon button (outline, existing `aria-label`), `RollbackButton`, `DeployButton` ("Redeploy"/"Deploy"), "Visit" (primary, only with an address, `ArrowUpRightIcon`). Actions move out of the production card header.
- Failed banner: `Alert tone="error" role="status"` with the existing sentence and `.link` "See the log".
- Production card: header "Production Deployment" (`text-title-3`) plus `StatusIndicator` for the live deployment on the right; body `dl` as now; "Runtime Settings" uses `details.disclosure` with `.disclosure-caret`; footer bar unchanged.
- `ServiceCard`: values wrapped in `Swap`; Restart uses `ConfirmDialog` (title "Restart the service?", description "The app is offline for a few seconds.", confirm "Restart", pending "Restarting…", tone default); the post-restart message stays inline (`role="status"`) and uses `Swap`; "Check now" keeps its spinning arrow; status uses `StatusIndicator` (running ready, starting building pending, failed error, others neutral) instead of the custom `DOT` map with the undefined `--ds-green-700`.
- Domains and Container cards equal height (`h-full`), Active Branches title `text-title-2`, rows hover surface plus `row-focus`.
- **AC**: one `h1` (project name); actions reachable and 40px on phones; restart confirm is a dialog with focus trap and returns focus to Restart; status values crossfade only when they change [visual].

### 6.7 Project deployments and deployment detail (Dashboard A)
- `/projects/[slug]/deployments`: fallback `DeploymentsSkeleton showProject={false}`; `PageHeader` (existing copy); `DeploymentsView`.
- **DeploymentsView/DeploymentRow** (also used by `/deployments` and the homepage demo; keep props `deployments`, `showProject`, `demo` and the demo behaviour): list rendered with `Stagger as="ul"`; rows hover surface and `row-focus` (not in demo); building rows show `StatusDot` (PixelLoader); empty states via `EmptyState` (no deployments: icon `CubeIcon`, title "No deployments yet", existing description) and compact for an empty filter ("No {filter} deployments", existing description).
- `DeploymentActions`, `DeployButton`, `RollbackButton`: errors via `toast.error` (same fallback strings); buttons use `loading`; labels "Starting…".
- `/projects/[slug]/deployments/[id]`: fallback `DeploymentSkeleton`. `PageHeader title={<>Deployment <span className="font-mono">{id.slice(0, 8)}</span></>} description={commit message}` with actions Visit (primary) and `DeploymentActions`. Remove the in-page breadcrumb (the top bar has it; phones have the back chevron). Error `Alert tone="error"` with `d.error`. Details card header "Details" (`h2.text-title-3`).
- **BuildLogs** (also used by the homepage; keep props): header row `h-12`, caret `transition-transform duration-(--dur-base)`; running state `PixelLoader size="md"` with `sr-only` "Running"; panel open/close instant; log area `.log-surface` with each line a `p.log-line`; empty text "Waiting for the first log line…" with `PixelLoader sm` when active; line count `tabular`, no `Swap`; search input `h-8 max-sm:h-10`, placeholder "Find in logs…".
- **AC**: no animation on streamed lines; homepage demos render exactly as before apart from the new styling [visual]; detail page has one `h1`.

### 6.8 Connect a server (`/connect`, Dashboard A page; skeleton by B)
- `PageHeader title="Connect a Nest server"` with the existing description and a Docs link to `/docs#servers-connection`.
- ServerCard: title row `text-title-2` host; `StatusIndicator` (connected ready, error error, pending neutral "Waiting for the key"); actions Test connection (primary, `loading`, "Connecting…"), New key (outline, `ConfirmDialog` with title "Generate a new key?" and description "The old key stops working once you remove it in the Nest dashboard, and you must add the new one." confirm "Generate key"), Disconnect (ghost, `ConfirmDialog tone="destructive"` title "Disconnect {name}?" description "Your running apps are not touched. Remove the key from the Nest dashboard to end our access." confirm "Disconnect").
- Errors `Alert tone="error" role="alert"`; "Reached your container" block `motion-fade`; issues as `Alert` (warning or error) list.
- Add-server card: steps in an `ol`; each step marker is a `size-6 rounded-md bg-[var(--ds-gray-100)] shadow-border-base text-caption tabular` square with its number (numbers carry real order here). Warning box → `Alert tone="warning"`.
- **AC**: both confirms are dialogs; no `window.confirm` left; 40px targets on phones.

### 6.9 New project flow (`/new`, `(flow)` layout, Dashboard A; skeleton by B)
- Flow header (`app/(flow)/layout.tsx`): `h-14 border-b bg-background-subtle`, NestMark 40px link, switcher, centred "New Project", and on the right a ghost `Button` link "Cancel" to `/projects`. Its Suspense fallback mirrors it (56px bar with blocks).
- Page: `h1` `text-[32px] leading-10 font-semibold tracking-[-0.03em]` (existing copy "Let's build something new"), notice → `Alert tone="info" role="status"`.
- Import: `NativeSelect` for the GitHub account; repo search placeholder "Search repositories…"; repo list loading → a card with 5 `SkeletonRow`s matching repo rows (not a 160px block); rows hover surface; "Private" as `Badge variant="outline"`; Import buttons 40px on phones. Connect GitHub panel unchanged copy.
- Configure step root `motion-enter`; selects via `NativeSelect`; error `Alert tone="error" role="alert"`; Deploy button `loading`, label "Starting deployment…"; back link `h-10`. No docs link in this flow (keep it focused).
- **AC**: switching between import and configure animates once each way; no layout jump when repos load [visual].

### 6.10 Project settings (`/projects/[slug]/settings`, Dashboard B)
- Fallback `SettingsSkeleton`.
- Layout: `mx-auto grid max-w-[936px] gap-10 lg:grid-cols-[176px_minmax(0,720px)]`. Left (lg+): `components/settings-nav.tsx` (client), `nav aria-label="Settings sections"`, `sticky top-[80px]`, links (nav item style, section 5) to `#run-heading` "Build and Run", `#env-heading` "Environment Variables", `#hook-heading` "Deploy Hook", `#notify-heading` "Notifications", `#status-page-heading` "Status Page", `#danger-heading` "Delete Project", current one from `useScrollSpy` (offset 80) with `aria-current="location"`. Below lg the nav is hidden.
- `settings-ui.tsx` Card: `h2.text-title-2` with `scroll-mt-20`; optional `docsHref` prop rendering the contextual Docs link at the card header's right; optional `tone="danger"` (frame `shadow-[0_0_0_1px_var(--tone-error-ring)]`, footer `bg-[var(--tone-error-bg)]`). `selectClass` re-exports `nativeSelectClass`.
- Docs links: env → `/docs#env`, hook → `/docs#hooks`, notifications → `/docs#notifications`, status page → `/docs#status-page`, build and run → `/docs#projects-settings`.
- Save status lines use `Swap`; Save buttons `loading` with "Saving…"; checkbox rows per section 5.
- Env var delete: `ConfirmDialog tone="destructive"` title "Delete {KEY}?", description "Deployments after this one will not have it.", confirm "Delete", errors via the dialog. (Same API call.)
- Delete Project card `tone="danger"`; Delete button `destructive-solid` when enabled.
- Project automation cards (`project-automation.tsx`): same Card upgrades, `loading` buttons, "Sending…", placeholder "https://discord.com/api/webhooks/…".
- **AC**: settings nav scroll-spies and every link lands with its heading visible under the top bar; all card ids unchanged; no `window.alert` left.

### 6.11 Deployments (`/deployments`, Dashboard B)
- `loading.tsx` → `DeploymentsSkeleton showProject`. Page: `motion-enter` root, `PageHeader` (existing copy) with Docs link `/docs#deployments`, `DeploymentsView` (A's component, unchanged props).
- **AC**: matches 6.7 list behaviour.

### 6.12 Logs (`/logs`, Dashboard B)
- `loading.tsx` → `LogsSkeleton`. `PageHeader` with Docs link `/docs#logs`.
- Toolbar: `NativeSelect` (`w-48 max-sm:w-full`, keep the `sr-only` label), search (`flex-1 max-w-80 max-sm:max-w-none`, placeholder "Search the last 1000 lines…"), checkbox row "Refresh every 5s", Refresh outline button (spinning icon while loading) at the right.
- When auto refresh is on, show `StatusIndicator tone="ready" label="Live"` next to the checkbox.
- Error: `Alert tone="error" role="alert"`.
- Viewer: `.log-surface rounded-lg shadow-border-small max-h-[70vh] min-h-[320px] overflow-auto py-3`, lines `p.log-line whitespace-pre-wrap break-all`. First load (no lines yet and loading): 14 skeleton line bars inside the viewer instead of "Loading…". Later loads keep the old lines visible. Empty: centred `text-muted-foreground font-sans` existing sentences.
- No projects: `EmptyState` icon `ListDashesIcon`, title "No logs yet", description "Logs appear here once you have a project.", action "New project" `/new`.
- **AC**: auto refresh never animates or flashes the list; viewer scrolls internally at 375px.

### 6.13 Domains (`/domains`, Dashboard B)
- `loading.tsx` → `DomainsSkeleton`. `PageHeader` with Docs link `/docs#domains`.
- Add form: `NativeSelect`; domain input `aria-invalid` and `aria-describedby` to the footer message when the error belongs to it; port placeholder "3000"; Add button `loading` "Adding…".
- Instructions: `Alert tone="info"` titled "Next: finish setup for {domain}" with the ordered steps and `CopyField`s, `motion-enter`.
- List: `Stagger as="ul"` card with rows; status `StatusIndicator` (valid ready "Valid", pending neutral "Not checked", invalid error "Needs attention") wrapped in `Swap` keyed by status; Check (outline sm, spinning icon while checking); Edit and Remove icon buttons (40px on phones). Remove uses `ConfirmDialog tone="destructive"` title "Remove {domain}?", description "This removes the record from Nest Deploy.", confirm "Remove"; errors go to the dialog. Inline edit form `motion-enter`, Save `loading`. Notes `role="status"` with `Swap`.
- Empty list: `EmptyState` icon `GlobeSimpleIcon`, title "No domains recorded yet", description "Add one above. Nest maps domains to ports on its own dashboard, so add it there too." No server: `EmptyState` icon `HardDrivesIcon`, title "Connect a server first", description "Then you can record domains for it.", action "Connect a server".
- **AC**: rows on phones wrap so the three actions stay on one line under the name, no horizontal scroll; no destructive action without a dialog.

### 6.14 Activity (`/activity`, Dashboard B)
- `loading.tsx` → `ActivitySkeleton`. `PageHeader` (existing copy).
- Group entries by UTC calendar day of `e.at`. Group heading `h2` `mb-2 mt-6 first:mt-0 text-label font-medium text-muted-foreground`: "Today", "Yesterday" (relative to the server's current UTC date) or `Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })`. Each group is a card list (existing row markup); the first group uses `Stagger as="ol"`, later groups plain `ol`. `time` keeps `timeAgo` and gains `title` with the full UTC date and time.
- Empty: `EmptyState` icon `ClockCounterClockwiseIcon`, title "No activity yet", description "Deploys, setting changes and restarts show up here."
- **AC**: day grouping renders identically on server and client (it is server-only); no hydration warnings.

### 6.15 Account (`/account`, Dashboard B)
- `loading.tsx` → `AccountSkeleton`. Layout unchanged (`max-w-[720px]`), Card upgrades from 6.10.
- Sessions: "This browser" becomes `Badge variant="outline"`; Sign out buttons `loading` "Signing out…".
- Delete Account card `tone="danger"`, button `destructive-solid` when the name matches, "Deleting…".
- **AC**: ids unchanged; 40px targets on phones.

### 6.16 Analytics (`/projects/[slug]/analytics`, Dashboard B)
- Fallback `AnalyticsSkeleton`. `PageHeader` with Docs link `/docs#analytics`.
- No data: `EmptyState` icon `ChartLineUpIcon`; when on: title "Nothing counted yet", description "Add the snippet below to your site, redeploy, and visit a page."; when off: title "Analytics is off", description "Turn it on below to get a snippet for your site.", action outline link "Set up analytics" to `#analytics-setup`.
- Stats: `Stagger as="div"` `grid gap-4 sm:grid-cols-2`; value `text-stat tabular`.
- Chart: new client `components/analytics-chart.tsx` replacing `DailyBars` (same data). Bars `motion-grow-y` with `--grow-delay` per M15 on first mount; hover on a bar (pointer) sets a readout in the caption: "{4 Nov}: {n} views, {m} visitors" (default text "Busiest day: N"), the hovered bar full opacity and the others `opacity-60`; empty days keep the 1% stub at 0.2 opacity. Axis labels formatted with `Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })` from the `YYYY-MM-DD` strings. Keep the `role="img"` summary label.
- Top lists: rows hover surface; numbers `tabular`.
- **AC**: bars grow once, never on refresh; readout works with a mouse; chart summary remains for screen readers.

### 6.17 Login (`/login`, Marketing)
- Keep the masked `PixelField` background and structure. Load `pixel`; title "Log in to Nest Deploy" in `font-pixel text-[28px] leading-8 font-medium`.
- Entrance once: mark, title, card each `motion-enter` with `--enter-delay` 0, 60, 120ms.
- Card `rounded-lg bg-card p-6 shadow-border-small`; error `Alert tone="error" role="alert"`; Hack Club button `Button size="lg"` full width (40px). When Hack Club is not configured render a disabled `Button` (not a focusable anchor) and show the existing explanation as `Alert tone="note"`.
- Dev sign-in unchanged copy; input and button 40px on phones.
- Fallback mirrors the final layout (section 4).
- **AC**: no focusable disabled link; Pixelify loads only on this route among dashboard-adjacent pages.

### 6.18 Public status page (`/status/[key]`, Marketing)
- Background `bg-background-subtle`; a top band `relative h-56 -mb-56` with an `aria-hidden` `page-grid` layer (30px cells) masked `linear-gradient(to bottom, #000, transparent)`, static (no PixelField).
- Column `max-w-[640px] px-4 py-16`. `h1` project name `text-title-1` (Geist).
- State card `rounded-lg bg-card p-6 shadow-border-small`: a 12x12px **square** glyph (`--status-ready`, `--status-error` or `--ds-gray-600`) and the headline in `font-pixel text-[32px] leading-9 font-medium`; detail line as now. Uptime: number `text-stat tabular` followed by the existing sentence in `text-label text-muted-foreground`.
- Outages list: rows as now; an ongoing outage shows `StatusIndicator tone="error" label="ongoing"`.
- Footer link unchanged.
- **AC**: no invented data (no uptime bars); content `motion-enter`; skeleton matches; 375px clean.

### 6.19 Not found (`app/not-found.tsx`, Marketing)
- Keep the masked mono `PixelField`. "404" in `font-pixel text-[clamp(5rem,14vw,9rem)] leading-none` with the stepped wipe: reuse the existing `hero-wipe` class (do not edit its CSS).
- `h1` "This page could not be found" `text-[24px] leading-8 font-semibold tracking-[-0.025em]`; new line below `text-muted-foreground`: "The link may be old, or the page may have moved."
- Buttons as now (`max-sm:h-10`).
- **AC**: wipe plays once with motion allowed, static with reduced motion.

---

## 7. Workstreams and file ownership

Every file that may change belongs to exactly one workstream. Files not listed are frozen. New files may only be created at the paths listed. Foundation lands and is signed off before the other four start; the four then run in parallel.

### 7.1 Foundation (lands first)
**May edit:**
- `app/globals.css`
- `app/layout.tsx`
- `components/ui/button.tsx`
- `components/ui/input.tsx`
- `components/ui/skeleton.tsx`
- `components/ui/dropdown-menu.tsx`
- `components/ui/tooltip.tsx`
- `components/ui/badge.tsx`
- `components/ui/avatar.tsx`
- `components/ui/card.tsx`
- `components/ui/separator.tsx`
- `components/status-dot.tsx`
- `components/page-header.tsx`
- `components/segmented.tsx`
- `components/copy-field.tsx`
- `components/sparkline.tsx`
- `components/nest-mark.tsx`
- `components/theme-toggle.tsx`
- `components/theme-button.tsx`
- `components/theme-provider.tsx`

**May create:**
- `lib/fonts.ts`
- `components/ui/native-select.tsx`
- `components/ui/pixel-loader.tsx`
- `components/ui/pixel-avatar.tsx`
- `components/ui/empty-state.tsx`
- `components/ui/alert.tsx`
- `components/ui/alert-dialog.tsx`
- `components/ui/toast.tsx`
- `components/motion/stagger.tsx`
- `components/motion/reveal.tsx`
- `components/motion/swap.tsx`
- `components/motion/use-scroll-spy.ts`

**Tasks, in order:**
1. Tokens (2.1 to 2.5): fixes, new tokens, type scale, base layer, remove dead CSS and duplicates. Keep the hero CSS and `.faq` byte-identical.
2. Motion tokens, keyframes and utilities (3.2 to 3.4, M1 to M16 CSS), `.grid-patch`, `.log-surface`, `.link`, `.row-focus`, `.lit-corner`, `.disclosure`, `.scroll-hairline`, `.card-interactive`, `.pressable`, and the reduced-motion block (3.6).
3. `ui/button.tsx` (press, focus, touch sizes, `loading`, `destructive-solid`), `ui/input.tsx`, `ui/native-select.tsx`, `ui/badge.tsx`, `ui/dropdown-menu.tsx`, `ui/tooltip.tsx`.
4. `ui/pixel-loader.tsx`, `ui/pixel-avatar.tsx`, `status-dot.tsx` (StatusDot + StatusIndicator).
5. `ui/skeleton.tsx` (section 4.2).
6. `ui/empty-state.tsx`, `ui/alert.tsx`.
7. `ui/alert-dialog.tsx` (+ `ConfirmDialog`), `ui/toast.tsx`, mount `Toaster` in `app/layout.tsx`.
8. `motion/stagger.tsx`, `motion/reveal.tsx`, `motion/swap.tsx`, `motion/use-scroll-spy.ts`.
9. `page-header.tsx`, `segmented.tsx`, `copy-field.tsx`, `lib/fonts.ts`.
10. Verify existing pages still render (curl every route, section 8.4), run the checks, and list every export with its signature in the hand-off so other workstreams can rely on it.

### 7.2 Docs
**May edit:** `app/(marketing)/docs/page.tsx`
**May create:**
- `app/(marketing)/docs/_data/nav.ts`
- `app/(marketing)/docs/_components/prose.tsx` (C, P, H2/Section, H3, List, Table, Callout)
- `app/(marketing)/docs/_components/code-block.tsx`
- `app/(marketing)/docs/_components/heading-anchor.tsx`
- `app/(marketing)/docs/_components/docs-nav.tsx`
- `app/(marketing)/docs/_components/docs-mobile-nav.tsx`
- `app/(marketing)/docs/_components/start-tiles.tsx`

**Tasks, in order:**
1. `_data/nav.ts` with groups, sections and the 25 `h3` ids. Make `Section` and `H3` read titles from it.
2. Prose primitives (`prose.tsx`): typography, lists with square bullets, inline code, tables, callouts with the assigned tones.
3. `code-block.tsx` with copy and labels; convert the three `Pre` blocks.
4. `heading-anchor.tsx`; add anchors to every `h2` and `h3`.
5. Page layout: hero, Start here tiles, opaque reading band, two-column grid, back to top, "Still stuck?" callout.
6. `docs-nav.tsx`: filter, groups, scroll-spy, subsections, lit marker, smooth scroll and focus.
7. `docs-mobile-nav.tsx`: sticky bar and panel.
8. Self-review against 6.1 AC at 375, 768, 1024, 1440px widths by reading the rendered HTML and the classes; run checks.

### 7.3 Dashboard A (shell and project pages)
**May edit:**
- `app/(app)/layout.tsx`
- `app/(flow)/layout.tsx`
- `app/(app)/projects/page.tsx`
- `app/(app)/projects/[slug]/page.tsx`
- `app/(app)/projects/[slug]/deployments/page.tsx`
- `app/(app)/projects/[slug]/deployments/[id]/page.tsx`
- `app/(app)/connect/page.tsx`
- `app/(flow)/new/page.tsx`
- `lib/nav.ts`
- `components/sidebar.tsx`
- `components/top-bar.tsx`
- `components/nav-list.tsx`
- `components/mobile-dock.tsx`
- `components/find-palette.tsx`
- `components/server-switcher.tsx`
- `components/user-menu.tsx`
- `components/account-context.tsx`
- `components/account-loader.tsx`
- `components/projects-view.tsx`
- `components/project-card.tsx`
- `components/usage-card.tsx`
- `components/service-status.tsx`
- `components/project-resources.tsx`
- `components/deployments-view.tsx`
- `components/deployment-row.tsx`
- `components/deployment-actions.tsx`
- `components/deploy-button.tsx`
- `components/rollback-button.tsx`
- `components/build-logs.tsx`
- `components/connect-flow.tsx`
- `components/new-project-flow.tsx`

**May create:** `components/project-switcher.tsx`

**Tasks, in order:**
1. Shell: sidebar (56px top row, NestMark, Docs link), `lib/nav.ts` (icons, find targets), nav-list focus and project label, top bar (breadcrumb, project switcher, phone Create button), mobile dock (focus, inert, sheet motion, safe area), find palette (instant vs animated open, icons, footer, Tab handling), shell skeletons, `data-app-content`.
2. Projects overview: Suspense + `ProjectsSkeleton`, toolbar, container-query grid with Stagger, ProjectCard (card and row variants with PixelAvatar), empty states, side cards.
3. Project overview: PageHeader with actions, Alert, production card, disclosure, ServiceCard (Swap, ConfirmDialog, StatusIndicator), branches.
4. Deployments list and row, actions, deploy and rollback buttons (toasts, loading), project deployments page, deployment detail page, BuildLogs.
5. Connect flow and new project flow and `(flow)` layout.
6. Replace inline Suspense fallbacks with B's skeleton exports (`ProjectsSkeleton`, `ProjectOverviewSkeleton`, `DeploymentsSkeleton`, `DeploymentSkeleton`). If B has not landed them yet, keep the old fallback until it has; the final diff must use B's.
7. Confirm the homepage still renders `DeploymentsView demo` and `BuildLogs` sample correctly; run checks.

### 7.4 Dashboard B (other pages, all loading states and route skeletons)
**May edit:**
- `app/(app)/deployments/page.tsx`
- `app/(app)/logs/page.tsx`
- `app/(app)/domains/page.tsx`
- `app/(app)/activity/page.tsx`
- `app/(app)/account/page.tsx`
- `app/(app)/projects/[slug]/analytics/page.tsx`
- `app/(app)/projects/[slug]/settings/page.tsx`
- `app/(app)/loading.tsx`
- `app/(flow)/loading.tsx`
- `components/logs-view.tsx`
- `components/domains-view.tsx`
- `components/account-view.tsx`
- `components/analytics-setup.tsx`
- `components/project-settings.tsx`
- `components/project-automation.tsx`
- `components/settings-ui.tsx`

**May create:**
- `app/(app)/deployments/loading.tsx`
- `app/(app)/logs/loading.tsx`
- `app/(app)/domains/loading.tsx`
- `app/(app)/activity/loading.tsx`
- `app/(app)/account/loading.tsx`
- `app/(app)/connect/loading.tsx`
- `components/skeletons/projects.tsx`
- `components/skeletons/project-overview.tsx`
- `components/skeletons/deployments.tsx`
- `components/skeletons/deployment.tsx`
- `components/skeletons/analytics.tsx`
- `components/skeletons/settings.tsx`
- `components/skeletons/logs.tsx`
- `components/skeletons/domains.tsx`
- `components/skeletons/activity.tsx`
- `components/skeletons/account.tsx`
- `components/skeletons/connect.tsx`
- `components/skeletons/new-project.tsx`
- `components/skeletons/generic.tsx`
- `components/analytics-chart.tsx`
- `components/settings-nav.tsx`

**Tasks, in order:**
1. **First, before anything else:** every skeleton in `components/skeletons/` with the exact export names in section 4, built to mirror the final layouts in section 6 (read A's briefs for A's pages). Tell the lead when they exist, so A can import them.
2. All `loading.tsx` files (generic, flow, and the six new leaf ones).
3. `settings-ui.tsx` (Card upgrades, danger tone, docs link, select class), then project settings, automation cards, settings nav, analytics setup.
4. Analytics page and `analytics-chart.tsx`.
5. Deployments page, logs page and `logs-view.tsx`.
6. Domains page and `domains-view.tsx`.
7. Activity page (grouping), account page and `account-view.tsx`.
8. Run checks; render every route you own signed in.

### 7.5 Marketing
**May edit:**
- `app/(marketing)/layout.tsx`
- `app/(marketing)/page.tsx` (everything except the `Hero` function)
- `app/(auth)/login/page.tsx`
- `app/status/[key]/page.tsx`
- `app/not-found.tsx`
- `components/pixel-field.tsx` (frozen behaviour; edit only if the lead approves a specific bug fix)

**May create:**
- `components/marketing/marketing-nav.tsx`
- `components/marketing/mobile-menu.tsx`
- `components/marketing/step-track.tsx`
- `components/marketing/terminal-cta.tsx`

**Tasks, in order:**
1. Layout: font import from `lib/fonts.ts`, `scroll-hairline`, nav current state, phone menu, touch targets, footer targets.
2. Homepage below the hero: Reveals, showcase bullets and frame bars, Start step track, CTA terminal and pill hover.
3. Login.
4. Status page.
5. Not found.
6. Run checks; confirm the hero diff is empty.

### 7.6 Frozen (nobody edits without the lead)
`app/api/**`, `server/**`, `proxy.ts`, `instrumentation.ts`, `components/api.ts`, `lib/status.ts`, `lib/site.ts`, `lib/sample.ts`, `lib/utils.ts`, `app/favicon.ico`, `web/drizzle/**`, `web/package.json`, `web/next.config.ts`, every test file.

### 7.7 Cross-workstream contracts
- A keeps `DeploymentsView({ deployments, showProject, demo })`, `DeploymentRow`, and `BuildLogs({ deploymentId, initialLines, rawState, duration })` working as they do today for B's `/deployments` and Marketing's homepage.
- B's skeleton export names are fixed (section 4). A imports them and changes nothing in them.
- Foundation's exports are fixed (section 5.1). If a primitive is missing a variant you need, ask the lead; do not fork it locally.

---

## 8. Review checklist (lead sign-off)

### 8.1 Every workstream
- [ ] Diff touches only the workstream's files (section 7). No frozen file changed.
- [ ] `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` all pass from `web/`; output pasted in the hand-off.
- [ ] `C:/Users/jerem/.claude/skills/impeccable/scripts/impeccable detect --json <changed files>` run once at the end; every finding fixed or explained.
- [ ] No em or en dash separators in visible copy (`grep -rn "—\|–"` on changed files); no `...` in visible copy (only `…`).
- [ ] No `transition-all` or `transition: all`; no animated `width`/`height`/`top`/`left`/`margin`.
- [ ] Every `outline-none`/`outline-hidden` has a focus-visible replacement.
- [ ] Every animation is one of M1 to M17 and appears only where section 3.4 allows; nothing in the "do not animate" list (3.7) moves.
- [ ] Reduced motion: every animation collapses per 3.6; JS-driven motion checks the media query.
- [ ] Contrast: every new text/background pair computed in light and dark (4.5:1 small text, 3:1 large and UI); tones use `--foreground` text.
- [ ] Touch: every control below 640px is at least 40x40 (read the `max-sm:` classes).
- [ ] 375px: nothing forces page width past the viewport (long ids `truncate`/`break-all`, grids collapse, tables and code scroll in their own frames).
- [ ] Icons are Phosphor only, `aria-hidden` when decorative; icon-only buttons have `aria-label`.
- [ ] Semantics: one `h1` per page, headings in order, lists are lists, buttons for actions, links for navigation.
- [ ] Copy unchanged except where the spec gives new strings word for word.
- [ ] Hand-off lists exactly what changed per file.

### 8.2 Foundation
- [ ] Token values and names exactly as section 2; old `--subtle-foreground` replaced; hero CSS and `.faq` byte-identical (`git diff` on those lines empty).
- [ ] Each primitive's API matches 5.1; `Stagger` never animates children added after 700ms; `Reveal` content visible without JS; `Swap` silent on first render; `useScrollSpy` has no scroll listener.
- [ ] `PixelAvatar` deterministic (same SVG on server and client; no hydration warning).
- [ ] Toast and AlertDialog use Base UI APIs as documented in `node_modules/@base-ui/react`, are keyboard and screen-reader correct (focus trap, Esc, focus return, live announcement).
- [ ] Skeleton shimmer is one shared sweep across blocks [visual]; static under reduced motion.
- [ ] All existing pages still render 200 and look as before apart from intended token changes.

### 8.3 Surfaces
- [ ] Docs: all 6.1 AC.
- [ ] Dashboard A: 6.4 to 6.9 AC; skeleton imports from B; homepage demos intact; no `window.alert`/`window.confirm` in A's files.
- [ ] Dashboard B: 6.10 to 6.16 AC; every route in section 4 has its skeleton and it mirrors the page (compare the skeleton JSX side by side with the page JSX: same container, grid, card frames, row heights); no `window.alert` in B's files.
- [ ] Marketing: 6.2, 6.3, 6.17 to 6.19 AC; `Hero` untouched; Pixelify only where 1.2 allows.

### 8.4 Render check recipe (no screenshots available)
```sh
# sign in once with the dev login
curl -s -c /tmp/nd.jar -o /dev/null -H "Origin: http://localhost:3100" -d "name=dev" http://localhost:3100/api/auth/dev
# fetch a route and inspect markup (ids, aria, classes, copy)
curl -s -b /tmp/nd.jar http://localhost:3100/projects > /tmp/projects.html
```
Routes: `/`, `/docs`, `/login`, `/status/<any>` (404 path is fine), `/nope`, `/projects`, `/deployments`, `/logs`, `/domains`, `/activity`, `/account`, `/connect`, `/new`, and a project's pages if a project exists. Each must return 200 (or the expected 404/307) with no error overlay markup. Note that streamed Suspense content arrives later in the response body, not inside `<main>`; search the whole document. Anything that needs eyes (alignment, motion feel, shimmer, colours) is marked [visual] and goes on the list for the main session to confirm in a browser.

### 8.5 Sign-off rule
A workstream is signed off only when every box above is ticked with evidence (command output, file and line, or computed values). Anything marked [visual] is listed explicitly as "needs a browser check" in the sign-off, not silently passed.
