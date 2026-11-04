const LINES = [
  "$ git push origin main",
  "Cloning sam-r/hello-world",
  "Building: pnpm build",
  "Uploaded 4.1 MB to your Nest",
  "Waiting for port 3000 to answer",
  "Live. Took 14 seconds.",
];

const STEP = 1.9; // seconds per line

/**
 * One deploy, narrated a line at a time. CSS only, so it costs nothing, and
 * it rests on the last line with reduced motion. Sample text, labelled.
 */
export function PushTicker() {
  return (
    <div className="bg-[#14110F] text-[#FFF3E3]">
      <div className="mx-auto flex h-12 max-w-[1200px] items-center gap-4 px-5 sm:px-8">
        <span className="hidden shrink-0 text-[13px] opacity-60 sm:block">Sample</span>
        <div
          role="img"
          aria-label="Sample deploy: git push, then clone, build, upload, health check, live in 14 seconds"
          className="relative h-6 flex-1 overflow-hidden font-mono text-[14px] leading-6"
        >
          {LINES.map((l, i) => (
            <p
              key={l}
              aria-hidden="true"
              className="tick-line absolute inset-0 truncate opacity-0"
              style={{
                animation: `tick-line ${LINES.length * STEP}s cubic-bezier(0.23,1,0.32,1) ${i * STEP}s infinite`,
                color: i === LINES.length - 1 ? "var(--brand)" : undefined,
              }}
            >
              {l}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
