import { cn } from "@/lib/utils"

/** FNV-1a, 32 bit. Pure integer maths, so the server and the client agree. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

function countBits(value: number): number {
  let n = 0
  for (let v = value; v; v >>>= 1) n += v & 1
  return n
}

/**
 * 15 bits fill the left three columns of a 5x5 grid, mirrored onto the right
 * two. Fewer than 5 or more than 12 lit cells reads as empty or solid, so the
 * bits are flipped; if that still lands outside the range the seed is hashed
 * again (deterministically) until it fits.
 */
function bitsFor(seed: string): number {
  for (let attempt = 0; attempt < 8; attempt++) {
    let bits = fnv1a(attempt === 0 ? seed : `${seed}#${attempt}`) & 0x7fff
    let lit = countBits(bits)
    if (lit < 5 || lit > 12) {
      bits = ~bits & 0x7fff
      lit = countBits(bits)
    }
    if (lit >= 5 && lit <= 12) return bits
  }
  return 0b101010101010101
}

function pathFor(seed: string): string {
  const bits = bitsFor(seed)
  let d = ""
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (!((bits >> (row * 3 + col)) & 1)) continue
      // Column 0 and 1 mirror onto 4 and 3; column 2 is the centre.
      const columns = col === 2 ? [2] : [col, 4 - col]
      for (const c of columns) d += `M${c + 1} ${row + 1}h1v1h-1z`
    }
  }
  return d
}

const RADIUS = {
  16: "rounded-[4px]",
  20: "rounded-[4px]",
  32: "rounded-md",
  40: "rounded-lg",
} as const

/**
 * A 5x5 mirrored identicon drawn from a seed (the project slug). Same seed,
 * same picture, on the server and in the browser. Decorative: aria-hidden,
 * so put the project name next to it.
 */
export function PixelAvatar({
  seed,
  size = 32,
  className,
}: {
  seed: string
  size?: 16 | 20 | 32 | 40
  className?: string
}) {
  return (
    <svg
      aria-hidden="true"
      data-slot="pixel-avatar"
      viewBox="0 0 7 7"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn(
        "shrink-0 bg-[var(--ds-gray-100)] text-foreground shadow-border-base",
        RADIUS[size],
        className
      )}
    >
      <path d={pathFor(seed)} fill="currentColor" />
    </svg>
  )
}
