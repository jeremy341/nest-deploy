"use client";

import { useState } from "react";
import { DeploymentRow } from "@/components/deployment-row";
import { Segmented } from "@/components/segmented";
import type { DeploymentView } from "@/server/queries";

type Filter = "all" | "ready" | "building" | "error";

export function DeploymentsView({
  deployments,
  showProject = true,
}: {
  deployments: DeploymentView[];
  showProject?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible =
    filter === "all"
      ? deployments
      : deployments.filter((d) =>
          filter === "error" ? d.state === "error" || d.state === "canceled" : d.state === filter
        );

  if (deployments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-16 text-center">
        <p className="font-medium">No deployments yet</p>
        <p className="mt-1 text-muted-foreground">
          Deploy a project and its releases will be listed here.
        </p>
      </div>
    );
  }

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
            <DeploymentRow key={d.id} deployment={d} showProject={showProject} />
          ))}
        </ul>
      )}
    </div>
  );
}
