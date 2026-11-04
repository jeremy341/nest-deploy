import { cn } from "@/lib/utils";

/**
 * The mark: a nest made of pixels, with one ember pixel resting in it.
 * Five columns by five rows. The bowl follows the text colour.
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
      <rect x="2" y="1" width="1" height="1" fill="var(--brand)" />
      <rect x="2" y="2" width="1" height="1" fill="var(--brand)" opacity="0.45" />
    </svg>
  );
}
