"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Shown if the files page itself fails to render. Folder errors have their own inline state. */
export default function FilesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div>
      <PageHeader title="Files" />
      <Alert
        tone="error"
        role="alert"
        title="Could not open the file manager"
        action={
          <Button size="sm" variant="outline" onClick={reset}>
            <ArrowClockwiseIcon /> Retry
          </Button>
        }
      >
        Something went wrong on our side. Try again in a moment.
      </Alert>
    </div>
  );
}
