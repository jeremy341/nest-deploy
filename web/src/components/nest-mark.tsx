import { cn } from "@/lib/utils";

/**
 * The mark: a nest drawn in pixels with one egg resting in it. One colour, so
 * it works in black, white or anything else that sets `color`.
 */
const BOWL: [number, number][] = [
  [0, 2],
  [4, 2],
  [0, 3],
  [4, 3],
  [1, 4],
  [2, 4],
  [3, 4],
  [1, 3],
  [3, 3],
];

export function NestMark({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      aria-label="Nest Deploy"
      viewBox="0 0 5 5"
      shapeRendering="crispEdges"
      className={cn("size-6", className)}
    >
      {BOWL.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
      ))}
      <rect x="2" y="1" width="1" height="1" fill="currentColor" />
      <rect x="2" y="2" width="1" height="1" fill="currentColor" opacity="0.4" />
    </svg>
  );
}
