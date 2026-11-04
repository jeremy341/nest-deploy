import { Reveal } from "@/components/motion/reveal";

/**
 * One reveal for the whole terminal, so the three lines are timed from the
 * moment it scrolls into view (0, 500 and 1100ms), like a command running.
 * Each line dims to 15% while the terminal is hidden and switches on after its
 * own delay. When scripts or motion are off the terminal is never hidden, so
 * every line is simply at full opacity.
 *
 * The wrapper's own reveal styling (dim and rise) is cancelled: only the lines
 * animate.
 */
const line =
  "transition-opacity duration-150 ease-snappy group-data-[reveal=hidden]/term:opacity-15";

export function TerminalCta() {
  return (
    <Reveal
      variant="light"
      className="group/term min-w-0 border bg-background data-[reveal=hidden]:opacity-100!"
    >
      <div className="flex h-10 items-center border-b px-4 font-mono text-[12px] text-muted-foreground">
        Terminal
      </div>
      <pre className="overflow-x-auto p-6 font-mono text-[14px] leading-7">
        <span className={`${line} block`} style={{ transitionDelay: "0ms" }}>
          <span className="text-subtle-foreground">$ </span>git push origin main
        </span>
        <span className={`${line} block text-muted-foreground`} style={{ transitionDelay: "500ms" }}>
          building…
        </span>
        <span className={`${line} flex items-center gap-2.5`} style={{ transitionDelay: "1100ms" }}>
          <span aria-hidden="true" className="size-1.5 shrink-0 bg-foreground" />
          live on your Nest
        </span>
      </pre>
    </Reveal>
  );
}
