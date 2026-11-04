"use client";

import { useState } from "react";
import { Segmented } from "@/components/segmented";
import { cn } from "@/lib/utils";
import type { LogLevel, LogLine } from "@/lib/mock";

type Filter = "all" | "warn" | "error";

const LEVEL_STYLE: Record<LogLevel, string> = {
  info: "text-muted-foreground",
  warn: "text-warning",
  error: "text-destructive",
};

export function LogsView({ lines }: { lines: LogLine[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = lines.filter((line) => {
    if (filter === "all") return true;
    if (filter === "warn") return line.level === "warn" || line.level === "error";
    return line.level === "error";
  });

  return (
    <div>
      <div className="mb-4">
        <Segmented<Filter>
          label="Filter by level"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "warn", label: "Warnings and errors" },
            { value: "error", label: "Errors" },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="font-medium">No matching log lines</p>
          <p className="mt-1 text-muted-foreground">
            Nothing at this level in the last 24 hours.
          </p>
        </div>
      ) : (
        <div
          role="log"
          aria-label="Server logs"
          className="overflow-x-auto rounded-lg border bg-background-subtle font-mono text-[12.5px] leading-6"
        >
          <table className="w-full min-w-[640px] border-collapse">
            <tbody>
              {visible.map((line, i) => (
                <tr key={i} className="align-top hover:bg-muted/40">
                  <td className="tabular w-[84px] py-0.5 pl-4 pr-3 whitespace-nowrap text-muted-foreground">
                    {line.time}
                  </td>
                  <td
                    className={cn(
                      "w-[56px] py-0.5 pr-3 uppercase",
                      LEVEL_STYLE[line.level]
                    )}
                  >
                    {line.level}
                  </td>
                  <td className="w-[150px] py-0.5 pr-3 whitespace-nowrap text-muted-foreground">
                    {line.source}
                  </td>
                  <td className="py-0.5 pr-4">{line.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
