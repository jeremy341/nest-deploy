"use client";

import { XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { compareRows } from "@/lib/deployments-filter";
import type { DeploymentView } from "@/server/queries";
import { cn } from "@/lib/utils";

function heading(d: DeploymentView) {
  return `${d.projectName} ${(d.sha ?? d.id).slice(0, 7)}`;
}

/**
 * Two deployments side by side, from the data the list already loaded. Rows
 * where the two differ are marked with text as well as weight, so the
 * difference does not rely on colour.
 */
export function DeploymentCompare({
  a,
  b,
  onClose,
}: {
  a: DeploymentView;
  b: DeploymentView;
  onClose: () => void;
}) {
  const rows = compareRows(a, b);
  return (
    <section
      aria-label="Compare deployments"
      className="mb-4 overflow-hidden rounded-lg bg-card shadow-border-small"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <h2 className="font-medium tracking-[-0.02em]">Comparing two deployments</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          <XIcon aria-hidden="true" />
          Close
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] table-fixed border-collapse text-left">
          <caption className="sr-only">
            Comparison of {heading(a)} and {heading(b)}. Rows marked Different have different values.
          </caption>
          <thead>
            <tr className="border-y border-border">
              <th scope="col" className="w-32 px-4 py-2 text-label font-medium text-muted-foreground">
                <span className="sr-only">Field</span>
              </th>
              <th scope="col" className="px-4 py-2 font-medium tracking-[-0.02em]">
                <span className="block truncate">{heading(a)}</span>
              </th>
              <th scope="col" className="px-4 py-2 font-medium tracking-[-0.02em]">
                <span className="block truncate">{heading(b)}</span>
              </th>
            </tr>
          </thead>
          <tbody className="hairline-y">
            {rows.map((r) => (
              <tr key={r.label} className="align-top">
                <th scope="row" className="px-4 py-2 text-label font-normal text-muted-foreground">
                  {r.label}
                  {r.differs ? <span className="sr-only">, different</span> : null}
                </th>
                <td className={cn("px-4 py-2 break-words", r.differs && "font-medium")}>{r.a}</td>
                <td className={cn("px-4 py-2 break-words", r.differs && "font-medium")}>{r.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-2 text-label text-muted-foreground">Rows in bold have different values.</p>
    </section>
  );
}
