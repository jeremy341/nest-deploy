"use client";

import { useScrollSpy } from "@/components/motion/use-scroll-spy";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "run-heading", label: "Build and Run" },
  { id: "env-heading", label: "Environment Variables" },
  { id: "hook-heading", label: "Deploy Hook" },
  { id: "notify-heading", label: "Notifications" },
  { id: "alerts-heading", label: "Alerts" },
  { id: "status-page-heading", label: "Status Page" },
  { id: "danger-heading", label: "Delete Project" },
] as const;

const IDS: string[] = SECTIONS.map((s) => s.id);

/** In-page navigation for the settings cards. Hidden below lg, where the cards stack. */
export function SettingsNav() {
  const current = useScrollSpy(IDS, { offset: 80 });

  return (
    <nav
      aria-label="Settings sections"
      className="sticky top-[80px] hidden self-start lg:block"
    >
      <ul className="space-y-0.5">
        {SECTIONS.map((s) => {
          const active = current === s.id;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={active ? "location" : undefined}
                className={cn(
                  "flex h-8 items-center rounded-md px-3 text-sm transition-colors duration-(--dur-fast) focus-visible:outline-offset-[-2px]",
                  active
                    ? "bg-[var(--ds-gray-200)] font-medium text-foreground"
                    : "text-muted-foreground hover:bg-[var(--ds-gray-alpha-100)] hover:text-foreground"
                )}
              >
                {s.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
