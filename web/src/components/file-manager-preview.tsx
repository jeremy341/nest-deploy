"use client";

import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  DownloadSimpleIcon,
  FileIcon,
  FloppyDiskIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldClass } from "@/components/ui/input";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { formatBytes, formatModified, typeLabel } from "@/components/file-manager-format";
import { DOWNLOAD_LIMIT, READ_LIMIT } from "@/server/files-paths";
import type { FileContent, FileEntry } from "@/server/files";
import { cn } from "@/lib/utils";

export type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: FileContent };

export type EditState = { path: string; draft: string; original: string };

type Props = {
  entry: FileEntry | null;
  path: string | null;
  state: PreviewState;
  edit: EditState | null;
  saving: boolean;
  saveError: string | null;
  /** The folder is writable, so this file can be renamed and deleted. */
  modifiable: boolean;
  /** The file is in the live release (current/), which is read only. */
  liveRelease: boolean;
  downloadHref: string | null;
  headingRef: React.Ref<HTMLHeadingElement>;
  onBack: () => void;
  onRetry: () => void;
  onEdit: () => void;
  onDraft: (text: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  /** Escape in the editor: leave edit mode, asking first if there are unsaved changes. */
  onEscape: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export function FilePreview({
  entry,
  path,
  state,
  edit,
  saving,
  saveError,
  modifiable,
  liveRelease,
  downloadHref,
  headingRef,
  onBack,
  onRetry,
  onEdit,
  onDraft,
  onSave,
  onDiscard,
  onEscape,
  onRename,
  onDelete,
}: Props) {
  if (!entry || !path) {
    return (
      <div className="hidden lg:block">
        <EmptyState
          size="compact"
          className="rounded-lg bg-card px-4 shadow-border-small"
          title="No file selected"
          description="Choose a file to read it here."
        />
      </div>
    );
  }

  const tooLarge = entry.size > READ_LIMIT || (state.status === "ready" && state.data.truncated);
  const canDownload = (entry.type === "file" || entry.linkTo === "file") && entry.size <= DOWNLOAD_LIMIT;
  const editable =
    modifiable && entry.type === "file" && state.status === "ready" && !state.data.binary && !state.data.truncated;
  const dirty = edit !== null && edit.draft !== edit.original;

  return (
    <section
      aria-label={`Preview of ${entry.name}`}
      className="rounded-lg bg-card shadow-border-small lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto"
    >
      <div className="border-b p-4">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2 lg:hidden" onClick={onBack}>
          <ArrowLeftIcon /> Back to files
        </Button>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="break-words font-mono text-[14px] font-medium outline-none"
        >
          {entry.name}
        </h2>
        <p className="mt-1 text-caption text-muted-foreground">
          {[typeLabel(entry), formatBytes(entry.size), formatModified(entry.modified)].join(", ")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {edit ? (
            <>
              <Button type="button" size="sm" onClick={onSave} loading={saving}>
                <FloppyDiskIcon /> {saving ? "Saving…" : "Save"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onDiscard} disabled={saving}>
                Discard
              </Button>
            </>
          ) : (
            <>
              {editable ? (
                <Button type="button" size="sm" variant="outline" onClick={onEdit}>
                  <PencilSimpleIcon /> Edit
                </Button>
              ) : null}
              {canDownload && downloadHref ? (
                <Button size="sm" variant="outline" render={<a href={downloadHref} download={entry.name} />}>
                  <DownloadSimpleIcon /> Download
                </Button>
              ) : null}
              {modifiable ? (
                <>
                  <Button type="button" size="sm" variant="ghost" onClick={onRename}>
                    <PencilSimpleIcon /> Rename
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
                    <TrashIcon /> Delete
                  </Button>
                </>
              ) : null}
            </>
          )}
        </div>
        {liveRelease ? (
          <p className="mt-2 text-caption text-muted-foreground">
            This file is in the live release, so it is read only. You can still read and download it.
          </p>
        ) : null}
        {dirty && !saving ? (
          <p role="status" className="mt-2 text-caption font-medium">
            Unsaved changes
          </p>
        ) : null}
      </div>

      <div className="p-4">
        {saveError ? (
          <Alert tone="error" role="alert" className="mb-3">
            {saveError}
          </Alert>
        ) : null}
        {edit ? (
          <textarea
            value={edit.draft}
            onChange={(e) => onDraft(e.target.value)}
            aria-label={`Edit ${entry.name}`}
            data-fm-editor=""
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                onEscape();
              } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                e.preventDefault();
                if (dirty) onSave();
              }
            }}
            className={cn(
              fieldClass,
              "block h-auto min-h-72 resize-y overflow-auto py-2 font-mono text-[13px] leading-5 whitespace-pre max-sm:h-auto md:text-[13px]"
            )}
          />
        ) : (
          <Body entry={entry} state={state} tooLarge={tooLarge} canDownload={canDownload} downloadHref={downloadHref} onRetry={onRetry} />
        )}
      </div>
    </section>
  );
}

function Body({
  entry,
  state,
  tooLarge,
  canDownload,
  downloadHref,
  onRetry,
}: {
  entry: FileEntry;
  state: PreviewState;
  tooLarge: boolean;
  canDownload: boolean;
  downloadHref: string | null;
  onRetry: () => void;
}) {
  const action =
    canDownload && downloadHref ? (
      <Button variant="outline" render={<a href={downloadHref} download={entry.name} />}>
        <DownloadSimpleIcon /> Download
      </Button>
    ) : undefined;

  if (tooLarge) {
    return (
      <EmptyState
        size="compact"
        icon={<FileIcon />}
        title="Too large to preview"
        description={
          entry.size > DOWNLOAD_LIMIT
            ? `This file is ${formatBytes(entry.size)}. Previews stop at ${formatBytes(READ_LIMIT)}, and downloads at ${formatBytes(DOWNLOAD_LIMIT)}. Use SSH to copy it.`
            : `This file is ${formatBytes(entry.size)}. Previews stop at ${formatBytes(READ_LIMIT)}.`
        }
        action={action}
      />
    );
  }
  if (state.status === "loading" || state.status === "idle") {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Loading {entry.name}…</span>
        <SkeletonText size="label" width="w-48" lines={3} />
        <Skeleton className="mt-2 h-24 w-full" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <Alert
        tone="error"
        role="alert"
        title="Could not open this file"
        action={
          <Button size="sm" variant="outline" onClick={onRetry}>
            <ArrowClockwiseIcon /> Retry
          </Button>
        }
      >
        {state.message}
      </Alert>
    );
  }
  const { data } = state;
  if (data.binary) {
    return (
      <EmptyState
        size="compact"
        icon={<FileIcon />}
        title="Binary file, cannot preview"
        description="It is not plain text, so Nest Deploy cannot show it."
        action={action}
      />
    );
  }
  if (data.content === "") {
    return <p className="text-muted-foreground">This file is empty.</p>;
  }
  return (
    <pre
      tabIndex={0}
      aria-label={`Contents of ${entry.name}`}
      className="max-h-[60dvh] overflow-auto rounded-md bg-[var(--ds-gray-100)] p-3 font-mono text-[13px] leading-5 whitespace-pre"
    >
      {data.content}
    </pre>
  );
}
