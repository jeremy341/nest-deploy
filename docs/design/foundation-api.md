# Foundation API (landed)

Built by the Foundation workstream from `ui-spec.md`. Use these instead of writing your own. Paths are relative to `web/src/components/` unless stated.

## Components

- **`ui/button`: `Button`, `buttonVariants`**
  - Variants: `default | brand | outline | secondary | ghost | destructive | destructive-solid | link`.
  - Sizes: `default | xs | sm | lg | icon | icon-xs | icon-sm | icon-lg`. Every size is at least 40px on phones.
  - `loading?: boolean`: sets aria-busy, disables the button, and shows a PixelLoader in place of the leading icon. Pass the "Saving..." label as children.
  - `render={<Link .../>}` works.
  - Press scale and the global focus ring are built in.
- **`ui/input`: `Input`, `fieldClass`.**
- **`ui/native-select`: `NativeSelect`** takes the `<select>` props plus `selectClassName`. `className` goes on the wrapper (set widths there).
- **`ui/pixel-loader`: `PixelLoader({ size?: "sm"|"md"|"lg" })`.** Decorative. It replaces spinners and pulses.
- **`ui/pixel-avatar`: `PixelAvatar({ seed, size?: 16|20|32|40 })`.** A deterministic identicon. Decorative, so put the name beside it.
- **`ui/skeleton`**
  - `Skeleton({ className })`
  - `SkeletonText({ size?: "title-1"|"title-2"|"title-3"|"body"|"label"|"caption", width?, lines? })`
  - `SkeletonCircle({ size })`
  - `SkeletonCard({ header?, footer?, children })`: you supply the body padding.
  - `SkeletonPageHeader({ description?, actions?, leading? })`
  - `SkeletonRow({ children })`
  - `LoadingRegion({ label, children })`: the aria-busy wrapper.
  - `SKELETON_WIDTHS`, `skeletonWidth(i)`.
  - All blocks share one sweep.
- **`ui/empty-state`: `EmptyState({ icon?, title, description?, action?, size?: "default"|"compact", as?: "p"|"h2"|"h3" })`.** It sits on the faint pixel-grid patch.
- **`ui/alert`: `Alert({ tone: "note"|"info"|"success"|"warning"|"error", title?, children, action?, role? })`.**
- **`ui/alert-dialog`**
  - Parts: `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogClose`.
  - `ConfirmDialog({ trigger: ReactElement, title, description?, confirmLabel, pendingLabel, tone?: "default"|"destructive", onConfirm: () => Promise<void>|void })`.
    - It closes on success and stays open with an inline error if `onConfirm` throws.
    - It can't be dismissed while pending.
    - A destructive dialog focuses Cancel first.
- **`ui/toast`: `toast.success(title, description?)`, `toast.error(...)`, `toast.info(...)`, `toast.dismiss(id?)`.**
  - Client components only. `Toaster` is already mounted in the root layout.
  - Use it for transient results. Form validation stays inline.
- **`motion/stagger`: `Stagger({ as?: "ul"|"ol"|"div", ... })`.** A one-time staggered entrance for lists. Do not use it on filtered or searched lists, logs or menus.
- **`motion/reveal`: `Reveal({ as?, delay?, variant?: "rise"|"light" })`.** Scroll reveal, for marketing and docs only.
- **`motion/swap`: `Swap({ value, children })`.** Crossfades when `value` changes, and never on the first render.
- **`motion/use-scroll-spy`: `useScrollSpy(ids, { offset? }): string | null`.** `ids` must be in document order. It uses IntersectionObserver, not a scroll listener.
- **`status-dot`**
  - `StatusDot`: same props as before. It shows a PixelLoader for building and queued.
  - `StatusIndicator({ tone: "ready"|"building"|"error"|"warning"|"neutral", label, pending? })`.
- **`page-header`: `PageHeader({ title, description?, actions?, leading? })`.**
- **`lib/fonts` (in `web/src/lib/`): `pixel`** (Pixelify Sans, `--font-pixel`). Public pages only.

## CSS utilities (Tailwind `@utility`, variants work)

- **Motion:** `motion-enter` (reads `--enter-delay`), `motion-fade`, `motion-stagger`, `motion-swap`, `motion-grow-y` (reads `--grow-delay`).
- **Interaction:**
  - `pressable`: already includes colour transitions, so do not add `transition-*`.
  - `card-interactive`, `lit-corner`, `link`, `row-focus`.
- **Disclosure:** `disclosure` goes on a `<details>` or on a wrapper around one, and `disclosure-caret` goes on the caret icon.
- **Surfaces:** `skeleton-sweep`, `scroll-hairline`, `grid-patch`, `log-surface` (with `.log-line` children), `shadow-border-base`, `shadow-border`, `shadow-border-small`, `shadow-menu`, `shadow-modal`.
- **Easing:** `ease-snappy`, `ease-move`, `ease-sheet`.
- **Type scale:** `text-title-1|2|3`, `text-body`, `text-body-lg`, `text-label`, `text-caption`, `text-stat`, `text-docs-h1`, `text-docs-lead`, `text-docs-h2`, `text-docs-h3`, `text-prose`, `text-docs-small`, `text-code`.
  - Colour: `text-reading`.
  - `cn()` in `@/lib/utils` knows these sizes, so `cn("text-title-1", "text-muted-foreground")` keeps both.
- **Plain CSS hooks:** `[data-reveal]`, `[data-reveal-variant]`.

## Custom properties

- **Durations:** `--dur-press|fast|base|enter|slow|reveal`, `--stagger-step`.
- **Easing:** `--ease-snappy|move|sheet`.
- **Layers:** `--z-topbar|header|popover|dock|overlay|toast|skip`.
- **Colour:** `--destructive-foreground`, `--ds-shadow-border-hover`, `--prose`, `--code-bg`, `--skeleton-base|highlight`, `--grid-line`, `--pixel-lit`, `--tone-{note,info,success,warning,error}-{bg,ring,icon}`.

## Notes

- Keyframes are prefixed `nd-`, so they don't collide with `tw-animate-css`'s `enter` and `exit`.
- `shadow-border-base` was missing before, so outline buttons, Segmented and a few others now show the hairline they were written for.
- Reduced motion is handled by one global block. Still, never rely on motion to convey information.
