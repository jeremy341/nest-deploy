/** Shared by the page and its skeleton so the two cannot drift apart. */
export const WRAP = "mx-auto w-full max-w-[1400px] px-6";
/** Chart column and totals column. Stacks on phones. */
export const GRID = "grid max-w-[1120px] gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start";
/** Square frame on the pixel grid, as the docs tiles are. */
export const FRAME = "border bg-background";
/** Height of the bar area. */
export const PLOT_H = "h-32";
/** A totals row: label and hint on the left, figure on the right. */
export const ROW = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-4";
