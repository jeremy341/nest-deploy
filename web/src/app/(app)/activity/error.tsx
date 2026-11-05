"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Shown if the activity page fails to load. */
export default function ActivityError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <PageHeader
        title="Activity"
        description="Changes to your projects, domains and servers, newest first. Times are UTC."
      />
      <Alert
        tone="error"
        role="alert"
        title="Could not load activity"
        action={
          <Button size="sm" variant="outline" onClick={reset}>
            <ArrowClockwiseIcon /> Try again
          </Button>
        }
      >
        Something went wrong on our side. Try again in a moment.
      </Alert>
    </div>
  );
}
