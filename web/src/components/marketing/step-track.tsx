import { Reveal } from "@/components/motion/reveal";

/**
 * The hairline of the "Set up in three steps" track. Each step column draws its
 * own length of it, so together they run across the frame. Medium screens and
 * wider only; on a phone the squares sit beside the step titles instead.
 *
 * The parent column must be `relative` and leave room above its content.
 */
export function StepTrackLine() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-x-0 top-7 hidden h-px bg-border md:block lg:top-8"
    />
  );
}

/**
 * One lit square (8x8). The three squares switch on one after another when the
 * section scrolls into view (delay = index x 150ms), and are simply lit when
 * scripts or motion are off. On md and wider it sits on the track at the start
 * of its column (the column's padding is 24px, 32px from lg); below md it is in
 * flow beside the step title.
 */
export function StepMarker({ index }: { index: number }) {
  return (
    <Reveal
      as="span"
      variant="light"
      delay={index * 150}
      className="block size-2 shrink-0 bg-foreground md:absolute md:top-[25px] md:left-6 lg:top-[29px] lg:left-8"
    />
  );
}
