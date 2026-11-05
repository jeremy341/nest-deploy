"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowClockwiseIcon, CubeFocusIcon, TrashIcon } from "@phosphor-icons/react";
import { api } from "@/components/api";
import { ContainerBodySkeleton } from "@/components/container-skeleton";
import { TypedConfirmDialog } from "@/components/container-typed-confirm";
import { PageHeader } from "@/components/page-header";
import { StatusIndicator } from "@/components/status-dot";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";
import { OFF_MESSAGES, PERMISSIONS_HREF } from "@/lib/container-permissions";
import { cn } from "@/lib/utils";
import type {
  Inventory,
  OrphanEntry,
  OrphanResult,
  OtherPort,
  PortConflict,
  ProjectEntry,
} from "@/server/inventory";
import type { UnitState } from "@/server/ssh/inventory-probe";

export type ContainerServer = {
  id: string;
  label: string;
  /** Whether the owner allows removing leftovers on this server. Defaults to on. */
  orphanRemoval?: boolean;
};

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; inventory: Inventory };

const STATE_LABEL: Record<UnitState, string> = {
  running: "Running",
  starting: "Starting",
  failed: "Crashed",
  stopped: "Stopped",
  unknown: "Unknown",
};

const STATE_TONE: Record<UnitState, "ready" | "building" | "error" | "neutral"> = {
  running: "ready",
  starting: "building",
  failed: "error",
  stopped: "neutral",
  unknown: "neutral",
};

/** 1536 -> "1.5 MB". Disk sizes come from du in kilobytes. */
export function formatKb(kb: number | null): string {
  if (kb === null) return "Size unknown";
  if (kb < 1024) return `${kb} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

const gb = (mb: number) => (mb / 1024).toFixed(1);

function Section({
  id,
  title,
  count,
  description,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-lg bg-card shadow-border-small">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 id={id} className="text-title-3">
            {title}
          </h2>
          {count !== undefined ? (
            <Badge variant="secondary" className="tabular">
              {count}
            </Badge>
          ) : null}
        </div>
        <div className="mt-0.5 max-w-[68ch] text-label text-muted-foreground">{description}</div>
      </div>
      {children}
    </section>
  );
}

function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[13px] break-all", className)}>{children}</span>;
}

/** Disk use, and how much of it is Nest Deploy's own folders. */
function Overview({ inventory }: { inventory: Inventory }) {
  const { disk } = inventory;
  const ratio = disk ? Math.min(disk.usedMb / disk.totalMb, 1) : 0;
  const hot = ratio >= 0.8;
  const folderKb =
    inventory.projects.reduce((n, p) => n + (p.folderKb ?? 0), 0) +
    inventory.orphans.reduce((n, o) => n + (o.kind === "folder" ? (o.sizeKb ?? 0) : 0), 0);
  return (
    <section aria-labelledby="container-disk" className="rounded-lg bg-card shadow-border-small">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-3">
        <div className="min-w-0">
          <h2 id="container-disk" className="text-title-3">
            {inventory.serverName}
          </h2>
          <p className="text-label text-muted-foreground">
            Read from the container at{" "}
            <time dateTime={inventory.checkedAt}>
              {new Date(inventory.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </time>
          </p>
        </div>
        {disk ? (
          <p className="tabular font-mono text-[13px] text-muted-foreground">
            Disk {gb(disk.usedMb)} / {gb(disk.totalMb)} GB
          </p>
        ) : null}
      </div>
      <div className="px-4 pt-3 pb-4">
        {disk ? (
          <>
            <div
              role="meter"
              aria-label="Disk used"
              aria-valuemin={0}
              aria-valuemax={disk.totalMb}
              aria-valuenow={disk.usedMb}
              aria-valuetext={`${Math.round(ratio * 100)} percent used`}
              className="h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className={cn("h-full rounded-full", hot ? "bg-warning" : "bg-foreground")}
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-label text-muted-foreground">
              {Math.round(ratio * 100)}% used.
              {folderKb > 0 ? ` Nest Deploy folders take ${formatKb(folderKb)} of that.` : ""}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">The container did not report its disk size.</p>
        )}
      </div>
    </section>
  );
}

function conflictText(c: PortConflict) {
  const by =
    c.heldBy.kind === "other"
      ? `${c.heldBy.label}${c.heldBy.pid ? ` (process ${c.heldBy.pid})` : ""}`
      : c.heldBy.label;
  return `Port ${c.port} is held by ${by}, not by ${c.name}.`;
}

function ProjectRow({ p, conflict }: { p: ProjectEntry; conflict: PortConflict | undefined }) {
  const state = p.service?.state ?? null;
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <Link
            href={`/projects/${p.slug}`}
            className="font-medium text-foreground underline-offset-4 hover:underline max-sm:inline-flex max-sm:min-h-10 max-sm:items-center"
          >
            {p.name}
          </Link>
          <div className="text-label text-muted-foreground">
            <Mono className="break-all">{p.service?.unit ?? `nd-${p.slug}.service`}</Mono>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {state ? (
            <StatusIndicator
              tone={STATE_TONE[state]}
              pending={state === "starting"}
              label={STATE_LABEL[state]}
            />
          ) : (
            <StatusIndicator tone="neutral" label="No service yet" />
          )}
          <span className="tabular font-mono text-[13px]">Port {p.port}</span>
          {p.folderKb !== null ? (
            <span className="tabular text-label text-muted-foreground">{formatKb(p.folderKb)}</span>
          ) : null}
        </div>
      </div>
      {conflict ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusIndicator tone="warning" label={conflictText(conflict)} />
          <Link
            href={`/projects/${p.slug}/settings`}
            className="text-label font-medium underline underline-offset-4 max-sm:inline-flex max-sm:min-h-10 max-sm:items-center"
          >
            Change the port
          </Link>
        </p>
      ) : null}
      {p.previews.length > 0 ? (
        <p className="mt-1 text-label text-muted-foreground">
          {p.previews.length === 1 ? "1 preview" : `${p.previews.length} previews`} running on ports{" "}
          <span className="tabular font-mono">{p.previews.map((v) => v.port).join(", ")}</span>
        </p>
      ) : null}
    </li>
  );
}

function OrphanRow({
  o,
  hasFolder,
  canRemove,
  onRemove,
}: {
  o: OrphanEntry;
  hasFolder: boolean;
  /** False when the owner has switched removal off: the row is listed without its Remove action. */
  canRemove: boolean;
  onRemove: (o: OrphanEntry) => Promise<void>;
}) {
  const isFolder = o.kind === "folder";
  const kindLabel = o.kind === "folder" ? "Folder" : o.kind === "preview" ? "Preview service" : "Service";
  const shown = isFolder ? `~/.nest-deploy/${o.id}` : o.id;

  const trigger = (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      disabled={!o.removable}
      aria-label={`Remove ${kindLabel.toLowerCase()} ${o.id}`}
    >
      <TrashIcon aria-hidden="true" />
      Remove
    </Button>
  );

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Mono className="font-medium">{shown}</Mono>
            <Badge variant="outline">{kindLabel}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-muted-foreground">
            {o.state ? (
              <StatusIndicator
                tone={STATE_TONE[o.state]}
                pending={o.state === "starting"}
                label={STATE_LABEL[o.state]}
              />
            ) : null}
            {isFolder ? <span className="tabular">{formatKb(o.sizeKb)}</span> : null}
            {o.ports.length > 0 ? (
              <span className="tabular">Listening on {o.ports.join(", ")}</span>
            ) : null}
            {!isFolder && hasFolder ? <span>Its folder is listed here too</span> : null}
            {!o.removable ? <span>A link, so it cannot be removed here</span> : null}
          </div>
        </div>
        {!canRemove ? null : isFolder ? (
          <TypedConfirmDialog
            trigger={trigger}
            title={`Delete the folder ${o.id}?`}
            description={
              <>
                This permanently deletes <Mono>~/.nest-deploy/{o.id}</Mono> and everything inside it
                ({formatKb(o.sizeKb)}), including any data in its shared folder. It cannot be undone.
              </>
            }
            expected={o.id}
            confirmLabel="Delete folder"
            pendingLabel="Deleting…"
            onConfirm={() => onRemove(o)}
          />
        ) : (
          <ConfirmDialog
            trigger={trigger}
            tone="destructive"
            title={`Remove ${o.id}?`}
            description="This stops the service, turns off starting it at boot and deletes its unit file. Files in its folder are not touched."
            confirmLabel="Remove service"
            pendingLabel="Removing…"
            onConfirm={() => onRemove(o)}
          />
        )}
      </div>
      {o.execStart ? (
        <details className="mt-1 text-label text-muted-foreground">
          <summary className="inline-flex min-h-6 cursor-pointer items-center underline-offset-4 hover:underline max-sm:min-h-10">
            What it runs
          </summary>
          <p className="mt-1">
            <Mono>{o.execStart}</Mono>
          </p>
        </details>
      ) : null}
    </li>
  );
}

function exposure(addresses: string[]): string {
  const local = (a: string) => a.startsWith("127.") || a === "[::1]" || a === "::1";
  if (addresses.every(local)) return "This container only";
  return "Open to the network";
}

function OtherPortRow({ p }: { p: OtherPort }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="tabular font-mono text-[13px] font-medium">{p.port}</span>
        <span className="min-w-0 break-all">
          {p.process ?? <span className="text-muted-foreground">Process not readable</span>}
          {p.pid !== null ? <span className="text-muted-foreground"> (process {p.pid})</span> : null}
        </span>
      </div>
      <span className="text-label text-muted-foreground">{exposure(p.addresses)}</span>
    </li>
  );
}

function Body({
  inventory,
  canRemove,
  onRemove,
}: {
  inventory: Inventory;
  canRemove: boolean;
  onRemove: (o: OrphanEntry) => Promise<void>;
}) {
  const { projects, orphans, otherPorts, conflicts } = inventory;
  const empty =
    projects.length === 0 && orphans.length === 0 && otherPorts.length === 0 && inventory.portsKnown;
  const folderSlugs = new Set(orphans.filter((o) => o.kind === "folder").map((o) => o.slug));

  return (
    <div className="space-y-6">
      <Overview inventory={inventory} />

      {conflicts.length > 0 ? (
        <Alert
          tone="warning"
          title={conflicts.length === 1 ? "A port is already taken" : "Some ports are already taken"}
        >
          <ul className="mt-1 space-y-1">
            {conflicts.map((c) => (
              <li key={c.projectId}>
                {conflictText(c)} The next deploy of {c.name} will fail its health check until that is sorted
                out.
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {empty ? (
        <EmptyState
          icon={<CubeFocusIcon />}
          title="Nothing is running here yet"
          description="When you deploy a project, its service shows up here. Anything left over from earlier, or started by hand, will be listed too."
          action={
            <Link href="/projects" className={cn(buttonVariants({ variant: "default" }), "px-3")}>
              Go to projects
            </Link>
          }
        />
      ) : (
        <>
          <Section
            id="container-projects"
            title="Projects"
            count={projects.length}
            description="The services Nest Deploy runs for your projects on this container."
          >
            {projects.length === 0 ? (
              <p className="px-4 py-5 text-muted-foreground">No projects use this container yet.</p>
            ) : (
              <ul className="divide-y">
                {projects.map((p) => (
                  <ProjectRow key={p.projectId} p={p} conflict={conflicts.find((c) => c.projectId === p.projectId)} />
                ))}
              </ul>
            )}
          </Section>

          <Section
            id="container-orphans"
            title="Orphans"
            count={orphans.length}
            description="An orphan is a service or folder Nest Deploy created earlier that none of your projects use any more. A leftover service keeps running and a leftover folder keeps using disk. Removing a service stops it and deletes its unit file. Deleting a folder permanently deletes the files inside it."
          >
            {!canRemove ? (
              <div className="border-b px-4 py-3">
                <Alert
                  tone="note"
                  action={
                    <Link
                      href={PERMISSIONS_HREF}
                      className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                    >
                      Go to Account
                    </Link>
                  }
                >
                  {OFF_MESSAGES.orphanRemoval} Leftovers are still listed, but they cannot be removed from here.
                  Turn removal back on in Account, under Container permissions.
                </Alert>
              </div>
            ) : null}
            {orphans.length === 0 ? (
              <div className="px-4">
                <EmptyState
                  size="compact"
                  icon={<CubeFocusIcon />}
                  title="No leftovers"
                  description="Every Nest Deploy service and folder on this container belongs to one of your projects."
                />
              </div>
            ) : (
              <ul className="divide-y">
                {orphans.map((o) => (
                  <OrphanRow
                    key={o.id}
                    o={o}
                    hasFolder={folderSlugs.has(o.slug)}
                    canRemove={canRemove}
                    onRemove={onRemove}
                  />
                ))}
              </ul>
            )}
          </Section>

          <Section
            id="container-ports"
            title="Other ports"
            count={inventory.portsKnown ? otherPorts.length : undefined}
            description="Programs listening on this container that Nest Deploy did not start. This list is read-only."
          >
            {!inventory.portsKnown ? (
              <p className="px-4 py-5 text-muted-foreground">
                This container has neither ss nor netstat, so its listening ports could not be read.
              </p>
            ) : otherPorts.length === 0 ? (
              <p className="px-4 py-5 text-muted-foreground">Nothing else is listening.</p>
            ) : (
              <>
                {!inventory.portsHaveProcesses ? (
                  <p className="border-b px-4 py-2.5 text-label text-muted-foreground">
                    The container did not share process names, so ports are matched to projects by their number
                    only.
                  </p>
                ) : null}
                <ul className="divide-y">
                  {otherPorts.map((p) => (
                    <OtherPortRow key={p.port} p={p} />
                  ))}
                </ul>
              </>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

/**
 * The /container page: reads the container over SSH when it opens, and again
 * on request. The read takes a few seconds, so it shows a skeleton first and a
 * retry button if the container cannot be reached.
 */
export function ContainerView({ servers }: { servers: ContainerServer[] }) {
  const [serverId, setServerId] = useState(servers[0]?.id ?? "");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    api<{ inventory: Inventory }>(`/api/servers/${serverId}/inventory`)
      .then((res) => {
        if (!cancelled) setLoad({ status: "ready", inventory: res.inventory });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoad({
          status: "error",
          message: err instanceof Error ? err.message : "Could not read the container.",
        });
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, nonce]);

  function retry() {
    setLoad({ status: "loading" });
    setNonce((n) => n + 1);
  }

  function refresh() {
    setRefreshing(true);
    setNonce((n) => n + 1);
  }

  function chooseServer(id: string) {
    setServerId(id);
    setLoad({ status: "loading" });
  }

  /** Throws on failure so the confirm dialog stays open and shows the message. */
  async function remove(o: OrphanEntry) {
    const res = await api<{ results: OrphanResult[] }>(`/api/servers/${serverId}/orphans`, {
      method: "POST",
      body: { ids: [o.id] },
    });
    const r = res.results[0];
    if (!r || r.status === "failed" || r.status === "refused") {
      throw new Error(r?.message ?? "Nothing was removed.");
    }
    if (r.status === "gone") toast.info(`${o.id} was already gone`);
    else toast.success(o.kind === "folder" ? `Deleted the folder ${o.id}` : `Removed ${o.id}`);
    setLoad((prev) =>
      prev.status === "ready"
        ? {
            status: "ready",
            inventory: { ...prev.inventory, orphans: prev.inventory.orphans.filter((x) => x.id !== o.id) },
          }
        : prev
    );
    setRefreshing(true);
    setNonce((n) => n + 1);
  }

  if (servers.length === 0) {
    return (
      <div className="motion-enter">
        <PageHeader title="Container" description="What is running on your Nest container." />
        <EmptyState
          icon={<CubeFocusIcon />}
          title="Connect a server first"
          description="Once a server is connected, you can see its services, leftovers and listening ports here."
          action={
            <Link href="/connect" className={cn(buttonVariants({ variant: "default" }), "px-3")}>
              Connect a server
            </Link>
          }
        />
      </div>
    );
  }

  const current = servers.find((s) => s.id === serverId);
  const serverLabel = current?.label ?? "";
  const canRemove = current?.orphanRemoval !== false;

  return (
    <div className="motion-enter">
      <PageHeader
        title="Container"
        description={`What is running on ${serverLabel}, and what Nest Deploy left behind.`}
        actions={
          <>
            {servers.length > 1 ? (
              <>
                <label htmlFor="container-server" className="sr-only">
                  Server
                </label>
                <NativeSelect
                  id="container-server"
                  className="sm:w-56"
                  value={serverId}
                  onChange={(e) => chooseServer(e.target.value)}
                >
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </NativeSelect>
              </>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={refresh}
              loading={refreshing}
              disabled={load.status === "loading"}
              className="max-sm:flex-1"
            >
              <ArrowClockwiseIcon aria-hidden="true" />
              {refreshing ? "Reading…" : "Refresh"}
            </Button>
          </>
        }
      />

      {load.status === "loading" ? (
        <ContainerBodySkeleton label={`Reading ${serverLabel}…`} />
      ) : load.status === "error" ? (
        <Alert tone="error" role="alert" title="Could not read the container">
          <p>{load.message.replace(/[.]$/, "")}. Nothing was changed.</p>
          <Button type="button" variant="outline" onClick={retry} className="mt-3">
            <ArrowClockwiseIcon aria-hidden="true" />
            Try again
          </Button>
        </Alert>
      ) : (
        <Body inventory={load.inventory} canRemove={canRemove} onRemove={remove} />
      )}
    </div>
  );
}
