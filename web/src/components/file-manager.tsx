"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwiseIcon,
  CaretRightIcon,
  FolderPlusIcon,
  FolderSimpleIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { ActionDialog } from "@/components/file-manager-dialogs";
import { FileApiError, fileGet, filePost, fileSaveText, fileUpload } from "@/components/file-manager-api";
import {
  FM_GRID,
  breadcrumbs,
  fileHref,
  formatBytes,
  isFolderLike,
  pageHref,
} from "@/components/file-manager-format";
import { FilePreview, type EditState, type PreviewState } from "@/components/file-manager-preview";
import { FileTable } from "@/components/file-manager-table";
import { UploadPanel, type UploadItem } from "@/components/file-manager-upload";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { DirListing, FileContent, FileEntry } from "@/server/files";
import { READ_LIMIT, UPLOAD_LIMIT, joinPath, normalizePath } from "@/server/files-paths";
import { LIVE_RELEASE_NOTICE, OFF_MESSAGES, PERMISSIONS_HREF } from "@/lib/container-permissions";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  slug: string;
  projectName: string;
  /** From the address (?path=). Checked by the server like any other path. */
  initialPath: string;
  /**
   * Whether the owner allows file changes on this project's server. Off by
   * default. When off, browsing, previews and downloads still work and every
   * control that changes something is hidden. The server refuses the changes
   * as well. Even when on, only shared/ can change: current/ (the live
   * release) is read only, and the server refuses changes there too.
   */
  fileWrites?: boolean;
};

type ListResult = { key: string; path: string; data?: DirListing; error?: FileApiError };
type PreviewResult = { key: string; state: PreviewState };

type Dialog =
  | { kind: "mkdir" }
  | { kind: "rename"; entry: FileEntry }
  | { kind: "delete"; entry: FileEntry };

const message = (e: unknown, fallback = "Something went wrong. Try again.") =>
  e instanceof Error && e.message ? e.message : fallback;

function safePath(raw: string): string {
  try {
    return normalizePath(raw);
  } catch {
    return raw;
  }
}

export function FileManager({ projectId, slug, projectName, initialPath, fileWrites = false }: Props) {
  const base = `/api/projects/${projectId}/files`;
  const pageBase = `/projects/${slug}/files`;

  const [path, setPath] = useState(initialPath);
  const [reloadKey, setReloadKey] = useState(0);
  const [list, setList] = useState<ListResult | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [discardAsk, setDiscardAsk] = useState<(() => void) | null>(null);
  const [replaceAsk, setReplaceAsk] = useState<{ entry: FileEntry; resolve: (replace: boolean) => void } | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const mkdirButton = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogFromToolbar = useRef(false);
  const uploadId = useRef(0);
  const uploadQueue = useRef<Promise<void>>(Promise.resolve());
  const uploadCanceled = useRef(false);
  const abortUpload = useRef<(() => void) | null>(null);
  const entriesRef = useRef<FileEntry[]>([]);

  // ---- Folder listing ------------------------------------------------------

  const listKey = `${path}#${reloadKey}`;
  useEffect(() => {
    const ctl = new AbortController();
    fileGet<DirListing>(base, "list", path, ctl.signal).then(
      (data) => setList({ key: listKey, path, data }),
      (err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setList({
          key: listKey,
          path,
          error: err instanceof FileApiError ? err : new FileApiError(message(err), "error", 0),
        });
      }
    );
    return () => ctl.abort();
  }, [base, path, listKey]);

  const loading = list?.key !== listKey;
  // While a reload of the same folder runs, keep showing what is there.
  const shown = list && list.path === path ? list : null;
  const listing = shown?.data ?? null;
  const entries = useMemo(() => listing?.entries ?? [], [listing]);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);
  const scope = listing?.scope ?? null;
  // Writable needs both: the folder allows changes (shared/ only), and the owner has turned them on.
  const changesOff = !fileWrites;
  const liveRelease = scope?.liveRelease ?? false;
  const writable = (scope?.writable ?? false) && fileWrites;

  // ---- Preview -------------------------------------------------------------

  const selected = selectedName ? (entries.find((e) => e.name === selectedName) ?? null) : null;
  const selectedPath = selected ? joinPath(path, selected.name) : null;
  const canPreview = selected !== null && !isFolderLike(selected) && selected.size <= READ_LIMIT;
  const previewKey = canPreview && selectedPath ? `${selectedPath}#${reloadKey}` : null;

  useEffect(() => {
    if (!previewKey || !selectedPath) return;
    const ctl = new AbortController();
    fileGet<FileContent>(base, "read", selectedPath, ctl.signal).then(
      (data) => setPreviewResult({ key: previewKey, state: { status: "ready", data } }),
      (err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setPreviewResult({ key: previewKey, state: { status: "error", message: message(err) } });
      }
    );
    return () => ctl.abort();
  }, [base, previewKey, selectedPath]);

  const previewState: PreviewState = !previewKey
    ? { status: "idle" }
    : previewResult?.key === previewKey
      ? previewResult.state
      : { status: "loading" };

  // On a phone the preview is its own screen: move focus to it.
  useEffect(() => {
    if (!selectedName) return;
    if (window.matchMedia("(max-width: 1023px)").matches) headingRef.current?.focus();
  }, [selectedName]);

  // ---- Unsaved edits -------------------------------------------------------

  const dirty = edit !== null && edit.draft !== edit.original;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /** Run `action`, first asking to discard unsaved edits if there are any. */
  const guard = useCallback(
    (action: () => void) => {
      if (dirty) setDiscardAsk(() => action);
      else action();
    },
    [dirty]
  );

  // ---- Navigation ----------------------------------------------------------

  const go = useCallback(
    (next: string, push = true) => {
      setPath(next);
      setSelectedName(null);
      setActiveName(null);
      setEdit(null);
      setSaveError(null);
      if (push) window.history.pushState(null, "", pageHref(pageBase, next));
    },
    [pageBase]
  );

  const navigate = useCallback((next: string) => guard(() => go(next)), [guard, go]);

  useEffect(() => {
    const onPop = () => {
      const next = safePath(new URLSearchParams(window.location.search).get("path") ?? "");
      if (dirty) {
        // Put the address back and ask first.
        window.history.pushState(null, "", pageHref(pageBase, path));
        setDiscardAsk(() => () => go(next, false));
        return;
      }
      go(next, false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [dirty, go, pageBase, path]);

  const up = useCallback(() => {
    if (path === "") return;
    const i = path.lastIndexOf("/");
    navigate(i < 0 ? "" : path.slice(0, i));
  }, [path, navigate]);

  function focusActiveRow() {
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>("[data-fm-row][tabindex='0']")?.focus()
    );
  }

  function openEntry(entry: FileEntry) {
    if (isFolderLike(entry)) {
      navigate(joinPath(path, entry.name));
      return;
    }
    if (entry.name === selectedName) return;
    guard(() => {
      setSelectedName(entry.name);
      setEdit(null);
      setSaveError(null);
    });
  }

  // ---- Edit ----------------------------------------------------------------

  function startEdit() {
    if (changesOff) return;
    if (previewState.status !== "ready" || previewState.data.content === null || !selectedPath) return;
    setSaveError(null);
    setEdit({ path: selectedPath, draft: previewState.data.content, original: previewState.data.content });
  }

  function leaveEdit() {
    setEdit(null);
    setSaveError(null);
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  async function save() {
    if (!edit || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await fileSaveText(base, edit.path, edit.draft);
      toast.success("Saved");
      leaveEdit();
      setReloadKey((k) => k + 1);
    } catch (e) {
      setSaveError(message(e, "Could not save the file."));
    } finally {
      setSaving(false);
    }
  }

  // ---- Folder actions ------------------------------------------------------

  function openDialog(next: Dialog, fromToolbar = false) {
    dialogFromToolbar.current = fromToolbar;
    setDialog(next);
    setDialogOpen(true);
  }

  function askDelete(entry: FileEntry) {
    if (changesOff) {
      toast.info(OFF_MESSAGES.fileWrites);
      return;
    }
    if (!writable) {
      toast.info("This location is read only", "Only files in shared/ can be changed.");
      return;
    }
    guard(() => openDialog({ kind: "delete", entry }));
  }

  function askRename(entry: FileEntry) {
    if (changesOff) {
      toast.info(OFF_MESSAGES.fileWrites);
      return;
    }
    if (!writable) {
      toast.info("This location is read only", "Only files in shared/ can be changed.");
      return;
    }
    guard(() => openDialog({ kind: "rename", entry }));
  }

  const returnFocus = useCallback(
    () =>
      dialogFromToolbar.current
        ? mkdirButton.current
        : document.querySelector<HTMLElement>("[data-fm-row][tabindex='0']"),
    []
  );

  async function confirmDialog(value: string) {
    if (!dialog) return;
    if (dialog.kind === "mkdir") {
      const name = value.trim();
      await filePost(base, "mkdir", { path: joinPath(path, name) });
      toast.success("Folder created", name);
    } else if (dialog.kind === "rename") {
      const name = value.trim();
      await filePost(base, "rename", {
        from: joinPath(path, dialog.entry.name),
        to: joinPath(path, name),
      });
      if (selectedName === dialog.entry.name) setSelectedName(name);
      setActiveName(name);
      toast.success("Renamed", name);
    } else {
      const { entry } = dialog;
      await filePost(base, "delete", { path: joinPath(path, entry.name), recursive: entry.type === "dir" });
      if (selectedName === entry.name) {
        setSelectedName(null);
        setEdit(null);
      }
      toast.success("Deleted", entry.name);
    }
    setReloadKey((k) => k + 1);
  }

  // ---- Upload --------------------------------------------------------------

  const patchUpload = useCallback((id: number, patch: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  function askReplace(entry: FileEntry) {
    return new Promise<boolean>((resolve) => setReplaceAsk({ entry, resolve }));
  }

  async function uploadOne(file: File, item: UploadItem, dir: string, existing: Map<string, FileEntry>) {
    if (uploadCanceled.current) return patchUpload(item.id, { status: "skipped" });
    if (file.size > UPLOAD_LIMIT) {
      return patchUpload(item.id, { status: "error", error: `Over the ${formatBytes(UPLOAD_LIMIT)} limit.` });
    }
    let overwrite = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const clash = existing.get(file.name);
      if (clash && !overwrite) {
        if (isFolderLike(clash)) {
          return patchUpload(item.id, { status: "error", error: "A folder with this name already exists." });
        }
        if (!(await askReplace(clash))) return patchUpload(item.id, { status: "skipped" });
        overwrite = true;
      }
      patchUpload(item.id, { status: "uploading", progress: 0 });
      try {
        await fileUpload(base, joinPath(dir, file.name), file, {
          overwrite,
          onProgress: (progress) => patchUpload(item.id, { progress }),
          register: (abort) => {
            abortUpload.current = abort;
          },
        });
        return patchUpload(item.id, { status: "done", progress: 1 });
      } catch (e) {
        if (e instanceof FileApiError && e.code === "exists" && !overwrite) {
          // Someone added it since the list loaded. Ask, then try once more.
          existing.set(file.name, {
            name: file.name,
            type: "file",
            size: 0,
            modified: null,
            target: null,
            linkTo: null,
          });
          continue;
        }
        if (e instanceof FileApiError && e.code === "aborted") return patchUpload(item.id, { status: "skipped" });
        return patchUpload(item.id, { status: "error", error: message(e, "The upload failed.") });
      } finally {
        abortUpload.current = null;
      }
    }
  }

  function startUpload(files: File[]) {
    if (files.length === 0) return;
    if (changesOff) {
      toast.info(OFF_MESSAGES.fileWrites);
      return;
    }
    if (!writable) {
      toast.info("Uploads are not allowed here", "Open shared/ first.");
      return;
    }
    const dir = path;
    const existing = new Map(entriesRef.current.map((e) => [e.name, e]));
    const items: UploadItem[] = files.map((f) => ({
      id: ++uploadId.current,
      name: f.name,
      size: f.size,
      status: "waiting",
      progress: 0,
    }));
    uploadCanceled.current = false;
    setUploads((prev) => [...prev.filter((u) => u.status === "waiting" || u.status === "uploading"), ...items]);
    // One at a time: each upload is a separate SSH session on the container.
    uploadQueue.current = uploadQueue.current.then(async () => {
      for (let i = 0; i < files.length; i++) await uploadOne(files[i], items[i], dir, existing);
      setReloadKey((k) => k + 1);
    });
  }

  function cancelUploads() {
    uploadCanceled.current = true;
    abortUpload.current?.();
    setUploads((prev) => prev.map((u) => (u.status === "waiting" ? { ...u, status: "skipped" } : u)));
  }

  useEffect(
    () => () => {
      uploadCanceled.current = true;
      abortUpload.current?.();
    },
    []
  );

  // ---- Render --------------------------------------------------------------

  const crumbs = breadcrumbs(path, projectName);
  const previewing = selectedName !== null;
  const hideOnPhonePreview = previewing ? "max-lg:hidden" : "";
  const here = path === "" ? `${projectName} folder` : path;
  const status = loading
    ? ""
    : shown?.error
      ? ""
      : `${entries.length} ${entries.length === 1 ? "item" : "items"} in ${here}`;

  return (
    <div className="motion-enter space-y-4">
      <PageHeader
        className="mb-2"
        title="Files"
        description={
          changesOff
            ? `Browse and download files in ${projectName}'s folder on your container.`
            : `Browse and download files in ${projectName}'s folder on your container. Files in shared/ can be changed.`
        }
        actions={
          changesOff || liveRelease ? undefined : (
            <div className={cn("flex flex-wrap items-center gap-2 max-sm:w-full max-sm:[&>*]:flex-1", hideOnPhonePreview)}>
              <Button
                ref={mkdirButton}
                variant="outline"
                disabled={!writable}
                onClick={() => guard(() => openDialog({ kind: "mkdir" }, true))}
              >
                <FolderPlusIcon /> New folder
              </Button>
              <Button variant="outline" disabled={!writable} onClick={() => fileInput.current?.click()}>
                <UploadSimpleIcon /> Upload
              </Button>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  startUpload(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>
          )
        }
      />

      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>

      <div className={cn("space-y-4", hideOnPhonePreview)}>
        <nav aria-label="Folder path">
          <ol className="flex items-center gap-1 overflow-x-auto pb-1 text-[13px] whitespace-nowrap">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={c.path} className="flex items-center gap-1">
                  {i > 0 ? <CaretRightIcon aria-hidden="true" className="size-3 text-muted-foreground" /> : null}
                  {last ? (
                    <span aria-current="location" className="px-1.5 py-1 font-medium">
                      {c.label}
                    </span>
                  ) : (
                    <a
                      href={pageHref(pageBase, c.path)}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        navigate(c.path);
                      }}
                      className="rounded-md px-1.5 py-1 text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)] hover:text-foreground max-sm:py-2.5"
                    >
                      {c.label}
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {changesOff ? (
          <Alert tone="note" title={OFF_MESSAGES.fileWrites}>
            <p>
              File changes are off by default, because a change to a file can change the code your app runs. You can
              still browse, read and download files. To turn them on, open Account, find Container permissions and
              type your Nest username to confirm.
            </p>
            <Link
              href={PERMISSIONS_HREF}
              className={cn(buttonVariants({ size: "sm", variant: "outline" }), "mt-3 max-sm:w-full")}
            >
              Go to Account
            </Link>
          </Alert>
        ) : null}

        {liveRelease ? (
          <Alert tone="note" title={LIVE_RELEASE_NOTICE.title}>
            <p>{LIVE_RELEASE_NOTICE.body}</p>
            {changesOff ? null : (
              <Button size="sm" variant="outline" className="mt-3 max-sm:w-full" onClick={() => navigate("shared")}>
                <FolderSimpleIcon /> Open shared/
              </Button>
            )}
          </Alert>
        ) : !changesOff && scope && path === "" ? (
          <p className="text-caption text-muted-foreground">
            New files and folders go in shared/, which is kept across deploys. current/ is the live release and is
            read only.
          </p>
        ) : !changesOff && scope && !scope.writable ? (
          <Alert tone="note">
            Read only. {scope.area === "releases" ? "Each deploy adds a release; the newest one is live as current/." : "Only files in shared/ can be changed."}
          </Alert>
        ) : null}

        <UploadPanel
          items={uploads}
          onCancel={cancelUploads}
          onClear={() => setUploads((prev) => prev.filter((u) => u.status === "waiting" || u.status === "uploading"))}
        />
      </div>

      <div className={FM_GRID}>
        <div className={cn("min-w-0", hideOnPhonePreview)}>
          <section
            aria-label="Folder contents"
            onDragOver={(e) => {
              if (!writable || !e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              setDragging(false);
              if (!writable || e.dataTransfer.files.length === 0) return;
              e.preventDefault();
              startUpload(Array.from(e.dataTransfer.files));
            }}
            className={cn(
              "overflow-hidden rounded-lg bg-card shadow-border-small transition-shadow duration-(--dur-fast)",
              dragging && "ring-2 ring-[var(--ds-focus-color)]"
            )}
          >
            {shown?.error ? (
              <ListError
                error={shown.error}
                atRoot={path === ""}
                onRetry={() => setReloadKey((k) => k + 1)}
                onRoot={() => navigate("")}
              />
            ) : !listing ? (
              <ListSkeleton />
            ) : entries.length === 0 ? (
              <EmptyState
                size="compact"
                className="px-4"
                icon={<FolderSimpleIcon />}
                title="This folder is empty"
                description={writable ? "Upload files or create a folder to get started." : "Nothing is in this folder."}
                action={
                  writable ? (
                    <>
                      <Button variant="outline" onClick={() => fileInput.current?.click()}>
                        <UploadSimpleIcon /> Upload
                      </Button>
                      <Button variant="outline" onClick={() => openDialog({ kind: "mkdir" }, true)}>
                        <FolderPlusIcon /> New folder
                      </Button>
                    </>
                  ) : undefined
                }
              />
            ) : (
              <>
                <FileTable
                  entries={entries}
                  dir={path}
                  modifiable={writable}
                  selectedName={selectedName}
                  activeName={activeName}
                  label={`Contents of ${here}`}
                  busy={loading}
                  downloadHref={(entry) => fileHref(projectId, "download", joinPath(path, entry.name))}
                  onActivate={setActiveName}
                  onOpen={openEntry}
                  onRename={askRename}
                  onDelete={askDelete}
                  onUp={up}
                />
                <p className="border-t px-4 py-2 text-caption text-muted-foreground">
                  {listing.truncated
                    ? `Showing the first ${entries.length} items. Use SSH for larger folders.`
                    : `${entries.length} ${entries.length === 1 ? "item" : "items"}`}
                </p>
              </>
            )}
          </section>
        </div>

        <div className={cn("min-w-0 lg:sticky lg:top-20", !previewing && "max-lg:hidden")}>
          <FilePreview
            entry={selected}
            path={selectedPath}
            state={previewState}
            edit={edit}
            saving={saving}
            saveError={saveError}
            modifiable={writable}
            liveRelease={liveRelease}
            downloadHref={selectedPath ? fileHref(projectId, "download", selectedPath) : null}
            headingRef={headingRef}
            onBack={() =>
              guard(() => {
                setSelectedName(null);
                setEdit(null);
                focusActiveRow();
              })
            }
            onRetry={() => setReloadKey((k) => k + 1)}
            onEdit={startEdit}
            onDraft={(draft) => setEdit((cur) => (cur ? { ...cur, draft } : cur))}
            onSave={() => void save()}
            onDiscard={leaveEdit}
            onEscape={() => (dirty ? setDiscardAsk(() => leaveEdit) : leaveEdit())}
            onRename={() => selected && askRename(selected)}
            onDelete={() => selected && askDelete(selected)}
          />
        </div>
      </div>

      {/* Dialogs. The kind and entry are kept while the dialog fades out. */}
      <ActionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        returnFocus={returnFocus}
        title={
          dialog?.kind === "mkdir"
            ? "New folder"
            : dialog?.kind === "rename"
              ? `Rename ${dialog.entry.name}`
              : dialog?.kind === "delete"
                ? dialog.entry.type === "dir"
                  ? `Delete folder ${dialog.entry.name}?`
                  : `Delete ${dialog.entry.name}?`
                : ""
        }
        description={
          dialog?.kind === "delete"
            ? dialog.entry.type === "dir"
              ? "This deletes the folder and everything inside it from your container. It cannot be undone."
              : "This deletes the file from your container. It cannot be undone."
            : dialog?.kind === "mkdir"
              ? `Created inside ${here}.`
              : undefined
        }
        confirmLabel={dialog?.kind === "mkdir" ? "Create" : dialog?.kind === "rename" ? "Rename" : "Delete"}
        pendingLabel={dialog?.kind === "mkdir" ? "Creating…" : dialog?.kind === "rename" ? "Renaming…" : "Deleting…"}
        tone={dialog?.kind === "delete" ? "destructive" : "default"}
        field={
          dialog?.kind === "mkdir"
            ? { label: "Folder name" }
            : dialog?.kind === "rename"
              ? { label: "New name", initial: dialog.entry.name, selectStem: true }
              : dialog?.kind === "delete" && dialog.entry.type === "dir"
                ? { label: `Type ${dialog.entry.name} to confirm`, mustMatch: dialog.entry.name }
                : undefined
        }
        onConfirm={confirmDialog}
      />

      <ActionDialog
        open={discardAsk !== null}
        onClose={() => setDiscardAsk(null)}
        title="Discard unsaved changes?"
        description="Your edits to this file have not been saved."
        confirmLabel="Discard"
        pendingLabel="Discarding…"
        tone="destructive"
        returnFocus={() =>
          document.querySelector<HTMLElement>("[data-fm-editor]") ?? headingRef.current
        }
        onConfirm={() => discardAsk?.()}
      />

      <ActionDialog
        open={replaceAsk !== null}
        onClose={() => {
          replaceAsk?.resolve(false);
          setReplaceAsk(null);
        }}
        title={replaceAsk ? `Replace ${replaceAsk.entry.name}?` : ""}
        description={
          replaceAsk
            ? `A file with this name is already here (${formatBytes(replaceAsk.entry.size)}). The upload replaces it.`
            : undefined
        }
        confirmLabel="Replace"
        pendingLabel="Replacing…"
        tone="destructive"
        field={
          replaceAsk && replaceAsk.entry.size > READ_LIMIT
            ? { label: `Type ${replaceAsk.entry.name} to replace it`, mustMatch: replaceAsk.entry.name }
            : undefined
        }
        onConfirm={() => replaceAsk?.resolve(true)}
      />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-busy="true" className="hairline-y">
      <span className="sr-only">Loading folder…</span>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex min-h-12 items-center gap-3 px-4 py-2">
          <Skeleton className="size-5 shrink-0" />
          <Skeleton className={cn("h-4", ["w-40", "w-56", "w-32", "w-48", "w-64", "w-36", "w-44"][i])} />
        </div>
      ))}
    </div>
  );
}

function ListError({
  error,
  atRoot,
  onRetry,
  onRoot,
}: {
  error: FileApiError;
  atRoot: boolean;
  onRetry: () => void;
  onRoot: () => void;
}) {
  if (error.code === "no_folder") {
    return (
      <EmptyState
        size="compact"
        className="px-4"
        icon={<FolderSimpleIcon />}
        title="Nothing here yet"
        description="This project's folder is created on its first deploy. Deploy it, then come back."
        action={
          <Button variant="outline" onClick={onRetry}>
            <ArrowClockwiseIcon /> Check again
          </Button>
        }
      />
    );
  }
  return (
    <div className="p-4">
      <Alert
        tone="error"
        role="alert"
        title="Could not load this folder"
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onRetry}>
              <ArrowClockwiseIcon /> Retry
            </Button>
            {!atRoot ? (
              <Button size="sm" variant="ghost" onClick={onRoot}>
                Project folder
              </Button>
            ) : null}
          </div>
        }
      >
        {error.message}
      </Alert>
    </div>
  );
}
