const STAGES = [
  { label: "Push", detail: "git push origin main" },
  { label: "Build", detail: "off your container" },
  { label: "Ship", detail: "over SSH" },
  { label: "Healthy", detail: "port answers" },
];

/** Four stages joined by a line of pixels with an ember pixel running along it. */
export function Pipeline() {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Deploy pipeline">
      {STAGES.map((s, i) => (
        <li key={s.label} className="relative min-w-0">
          <div className="flex items-center">
            <span
              aria-hidden="true"
              className="relative z-10 size-4 shrink-0 bg-foreground"
            />
            {i < STAGES.length - 1 ? (
              <span aria-hidden="true" className="relative ml-1 h-px flex-1 overflow-visible">
                <span
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, var(--ds-gray-500) 50%, transparent 50%)",
                    backgroundSize: "6px 1px",
                  }}
                />
                <span
                  className="pipe-dot absolute top-1/2 left-0 size-2 -translate-y-1/2 bg-brand"
                  style={{
                    animation: `pipe-run 2.6s cubic-bezier(0.65,0,0.35,1) ${i * 0.55}s infinite`,
                    ["--run" as string]: "calc(100% + 1rem)",
                  }}
                />
              </span>
            ) : null}
          </div>
          <p className="mt-3 truncate font-medium tracking-[-0.02em]">{s.label}</p>
          <p className="truncate text-[13px] text-muted-foreground">{s.detail}</p>
        </li>
      ))}
    </ol>
  );
}
