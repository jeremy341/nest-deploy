"use client";

import { useState } from "react";
import { DeploymentRow } from "@/components/deployment-row";
import { Segmented } from "@/components/segmented";
import type { Deployment } from "@/lib/mock";

type Filter = "all" | "ready" | "building" | "error";

export function DeploymentsView({
  deployments,
  showProject = true,
}: {
  deployments: Deployment[];
  showProject?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible =
    filter === "all"
      ? deployments
      : deployments.filter((d) => d.state === filter);

  return (
    <div>
      <div className="mb-4">
        <Segmented<Filter>
          label="Filter by status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "ready", label: "Ready" },
            { value: "building", label: "Building" },
            { value: "error", label: "Error" },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-16 text-center">
          <p className="font-medium">No {filter} deployments</p>
          <p className="mt-1 text-muted-foreground">
            Deployments with this status will show up here.
          </p>
        </div>
      ) : (
        <ul className="hairline-y overflow-hidden rounded-lg bg-card shadow-border-small">
          {visible.map((d) => (
            <DeploymentRow
              key={`${d.projectSlug}-${d.id}`}
              deployment={d}
              showProject={showProject}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
