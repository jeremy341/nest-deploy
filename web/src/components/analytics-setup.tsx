"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { CopyField } from "@/components/copy-field";
import { Card } from "@/components/settings-ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Turn analytics on or off and show the line to paste into the site. */
export function AnalyticsSetup({
  projectId,
  initialSnippet,
}: {
  projectId: string;
  /** The script tag when analytics is on, otherwise null. */
  initialSnippet: string | null;
}) {
  const router = useRouter();
  const [snippet, setSnippet] = useState(initialSnippet);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (snippet) {
        await api(`/api/projects/${projectId}/analytics`, { method: "DELETE" });
        setSnippet(null);
      } else {
        const res = await api<{ snippet: string }>(`/api/projects/${projectId}/analytics`, {
          method: "POST",
          body: {},
        });
        setSnippet(res.snippet);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change analytics");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      id="analytics-setup"
      title={snippet ? "Tracking snippet" : "Count visits"}
      description={
        snippet
          ? "Paste this into the head of every page you want counted, then redeploy."
          : "Nest does not share its web server logs, so visits are counted by a small script on your own site."
      }
    >
      {snippet ? (
        <div className="motion-enter">
          <CopyField value={snippet} label="Analytics snippet" />
        </div>
      ) : null}
      <ul className="mt-4 list-disc space-y-1 pl-5 text-label text-muted-foreground marker:text-subtle-foreground">
        <li>It records the page path and the site a visitor came from, and nothing else.</li>
        <li>No cookies, and no IP address or browser details are stored.</li>
        <li>It stays quiet for visitors whose browser says Do Not Track, and on localhost.</li>
        <li>Numbers are kept for 90 days.</li>
      </ul>
      {error ? (
        <Alert tone="error" role="alert" className="mt-3">
          {error}
        </Alert>
      ) : null}
      <div className="mt-4">
        <Button
          type="button"
          variant={snippet ? "outline" : "default"}
          onClick={() => void toggle()}
          loading={busy}
        >
          {busy
            ? snippet
              ? "Turning off…"
              : "Turning on…"
            : snippet
              ? "Turn off"
              : "Turn on analytics"}
        </Button>
      </div>
    </Card>
  );
}
