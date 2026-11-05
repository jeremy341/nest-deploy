import { Reveal } from "@/components/motion/reveal";

/**
 * The hairline over one step of the "Setup" row. Each step draws its own length
 * of it, so together they run across the row without a gap. On a phone, where
 * the steps stack, every step simply has its own line above it.
 *
 * The parent must be `relative`, with its content padded down from the top.
 */
export function StepTrackLine() {
  return <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[var(--ds-gray-alpha-500)]" />;
}

/**
 * One lit square (8x8) sitting on the start of the hairline. The squares switch
 * on one after another when the section scrolls into view (delay = index x
 * 150ms), and are simply lit when scripts or motion are off.
 */
export function StepMarker({ index }: { index: number }) {
  return (
    <Reveal
      as="span"
      variant="light"
      delay={index * 150}
      className="absolute -top-[3.5px] left-0 block size-2 bg-foreground"
    />
  );
}
