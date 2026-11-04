"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RocketLaunchIcon } from "@phosphor-icons/react";
import { api } from "@/components/api";
import { Button } from "@/components/ui/button";

/** Queue a deployment of the production branch and open it. */
export function DeployButton({
  projectId,
  projectSlug,
  branch,
  label = "Deploy",
}: {
  projectId: string;
  projectSlug: string;
  branch?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function deploy() {
    setBusy(true);
    try {
      const res = await api<{ deployment: { id: string } }>(
        `/api/projects/${projectId}/deploy`,
        { method: "POST", body: branch ? { branch } : {} }
      );
      router.push(`/projects/${projectSlug}/deployments/${res.deployment.id}`);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not start the deployment");
      setBusy(false);
    }
  }

  return (
    <Button onClick={() => void deploy()} disabled={busy} className="px-3">
      <RocketLaunchIcon />
      {busy ? "Starting..." : label}
    </Button>
  );
}
