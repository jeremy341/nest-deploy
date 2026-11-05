"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  CaretDownIcon,
  CaretRightIcon,
  ClockCounterClockwiseIcon,
  GlobeIcon,
  HardDrivesIcon,
  KeyIcon,
  PulseIcon,
  RocketLaunchIcon,
  SquaresFourIcon,
  TerminalWindowIcon,
} from "@phosphor-icons/react";
import { timeAgo } from "@/lib/status";
import { cn } from "@/lib/utils";
import { KIND_LABELS, type ActivityItem, type ActivityKind } from "@/server/activity";

const ICONS: Record<ActivityKind, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  projects: SquaresFourIcon,
  deployments: RocketLaunchIcon,
  domains: GlobeIcon,
  servers: HardDrivesIcon,
  access: KeyIcon,
  monitoring: PulseIcon,
  terminal: TerminalWindowIcon,
  other: ClockCounterClockwiseIcon,
};

const TONES: Record<ActivityItem["tone"], string> = {
  neutral: "bg-[var(--ds-gray-100)] text-muted-foreground",
  good: "bg-[var(--tone-success-bg)] text-[var(--tone-success-icon)]",
  bad: "bg-[var(--tone-error-bg)] text-[var(--tone-error-icon)]",
};

const fullTime = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

/**
 * One entry: kind icon, the sentence (label, target link, the rest), the time
 * and who did it, and a disclosure with every detail as a labelled pair.
 * `now` comes from the server so the first render matches on both sides.
 */
export function ActivityRow({ item, now }: { item: ActivityItem; now: number }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const Icon = ICONS[item.kind];
  const absolute = fullTime.format(new Date(item.at));
  const sentenceName = [item.label, item.target?.name].filter(Boolean).join(" ");

  const details: { label: string; value: React.ReactNode; mono?: boolean }[] = [
    { label: "When", value: absolute },
    {
      label: "Done by",
      value: item.token ? (item.token.name ? `Access token ${item.token.name}` : "An access token that no longer exists") : "You",
    },
    ...item.fields.map((f) => ({
      label: f.label,
      mono: f.mono,
      value: f.href ? (
        <Link href={f.href} className="link">
          {f.value}
        </Link>
      ) : (
        f.value
      ),
    })),
    { label: "Event", value: item.action, mono: true },
  ];

  return (
    <li id={`activity-${item.id}`} tabIndex={-1} className="outline-none">
      <div className="flex items-start gap-3 px-4 py-3">
        <span
          aria-hidden="true"
          className={cn("mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4", TONES[item.tone])}
        >
          <Icon aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p className="min-w-0 break-words">
            <span>{item.label}</span>
            {item.target ? (
              <>
                {" "}
                {item.target.href ? (
                  <Link href={item.target.href} className="link font-medium">
                    {item.target.name}
                  </Link>
                ) : (
                  <span className={cn("font-medium", item.target.gone && "text-muted-foreground")}>
                    {item.target.name}
                  </span>
                )}
              </>
            ) : null}
            {item.suffix ? (
              <span className="text-muted-foreground">
                {item.suffix.startsWith(":") ? "" : " "}
                {item.suffix}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-label text-muted-foreground">
            <time dateTime={item.at} title={absolute} className="tabular">
              {timeAgo(item.at, now)}
            </time>
            <span>{KIND_LABELS[item.kind]}</span>
            {item.token ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="rounded-full bg-[var(--ds-gray-100)] px-2 text-caption text-foreground">Token</span>
                {item.token.name ? <span className="break-all">{item.token.name}</span> : null}
              </span>
            ) : null}
          </p>
        </div>

        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`Details for ${sentenceName}`}
          onClick={() => setOpen((v) => !v)}
          className="pressable -my-1 -mr-2 inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md px-2 text-label text-muted-foreground hover:bg-[var(--ds-gray-alpha-100)] hover:text-foreground max-sm:h-10 max-sm:min-w-10 [&_svg]:size-4"
        >
          <span className="max-sm:sr-only" aria-hidden="true">
            Details
          </span>
          {open ? <CaretDownIcon aria-hidden /> : <CaretRightIcon aria-hidden />}
        </button>
      </div>

      {open ? (
        <dl
          id={panelId}
          className="mx-4 mb-3 grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-md bg-background-subtle px-3 py-2.5 text-label sm:ml-[60px]"
        >
          {details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className={cn("min-w-0 break-words", d.mono && "font-mono text-[12px] leading-[18px] break-all")}>
                {d.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}
