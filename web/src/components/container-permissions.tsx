"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Switch } from "@base-ui/react/switch";
import { api } from "@/components/api";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { PixelLoader } from "@/components/ui/pixel-loader";
import { toast } from "@/components/ui/toast";
import {
  PERMISSION_DESCRIPTIONS,
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  PERMISSION_STATE,
  needsTypedConfirm,
  normalizePermissions,
  type ContainerPermissions,
  type PermissionKey,
} from "@/lib/container-permissions";
import { cn } from "@/lib/utils";

export type PermissionServer = {
  id: string;
  /** What the person knows it by, for example sam-r.hackclub.app. */
  label: string;
  /** Nest username, shown in the card title. */
  nestUsername: string;
  permissions: ContainerPermissions;
};

const message = (e: unknown) =>
  e instanceof Error && e.message ? e.message : "Could not save. Try again.";

/** Save one switch. Resolves with whatever the server says the permissions now are. */
async function savePermission(serverId: string, key: PermissionKey, value: boolean): Promise<unknown> {
  const res = await api<{ permissions?: unknown }>(`/api/servers/${encodeURIComponent(serverId)}/permissions`, {
    method: "PUT",
    body: { [key]: value },
  });
  return res.permissions;
}

function toastFor(key: PermissionKey, value: boolean, label: string) {
  const title = `${PERMISSION_LABELS[key]} turned ${value ? "on" : "off"}`;
  if (key === "terminal" && !value) toast.success(title, `Any open terminal on ${label} will close.`);
  else toast.success(title, label);
}

/**
 * The Account page section: one card per connected server, three switches in
 * each. Every switch saves on its own, straight away. Turning the terminal or
 * file changes on sends you through a fresh Hack Club sign-in first.
 */
export function ContainerPermissionsSection({ servers }: { servers: PermissionServer[] }) {
  const [state, setState] = useState<Record<string, ContainerPermissions>>(() =>
    Object.fromEntries(servers.map((s) => [s.id, s.permissions]))
  );

  return (
    <section aria-labelledby="container-permissions-heading">
      <h2 id="container-permissions-heading" className="scroll-mt-20 text-title-2">
        Container permissions
      </h2>
      <p className="mt-1 max-w-[62ch] text-muted-foreground">
        Choose which features can reach each of your containers. A feature that is off is blocked by Nest Deploy
        itself, not only hidden from the page. The terminal and file changes are off until you turn them on, and
        turning them on asks you to sign in with Hack Club again first.
      </p>

      {servers.length === 0 ? (
        <div className="mt-4 rounded-lg bg-card p-5 shadow-border-small">
          <p className="text-muted-foreground">
            No server is connected yet. Once you connect one, its switches appear here.
          </p>
          <Link href="/connect" className={cn(buttonVariants({ variant: "outline" }), "mt-3 max-sm:w-full")}>
            Connect a server
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {servers.map((s) => (
            <ServerCard
              key={s.id}
              server={s}
              permissions={state[s.id] ?? s.permissions}
              onSaved={(raw) =>
                setState((cur) => ({
                  ...cur,
                  [s.id]: normalizePermissions({ ...(cur[s.id] ?? s.permissions), ...asRecord(raw) }),
                }))
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function ServerCard({
  server,
  permissions,
  onSaved,
}: {
  server: PermissionServer;
  permissions: ContainerPermissions;
  onSaved: (raw: unknown) => void;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-lg bg-card shadow-border-small">
      <div className="border-b px-4 py-3">
        <h3 id={headingId} className="font-mono text-[14px] font-medium break-all">
          {server.label}
        </h3>
      </div>
      <ul className="hairline-y">
        {PERMISSION_KEYS.map((key) => (
          <PermissionRow
            key={key}
            permKey={key}
            server={server}
            headingId={headingId}
            checked={permissions[key]}
            onSaved={onSaved}
          />
        ))}
      </ul>
    </section>
  );
}

function PermissionRow({
  permKey,
  server,
  headingId,
  checked,
  onSaved,
}: {
  permKey: PermissionKey;
  server: PermissionServer;
  headingId: string;
  checked: boolean;
  onSaved: (raw: unknown) => void;
}) {
  const uid = useId();
  const labelId = `${uid}-label`;
  const descId = `${uid}-desc`;
  const errorId = `${uid}-error`;
  const switchRef = useRef<HTMLElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Throws when the save fails, so the caller can show the message where it belongs. */
  async function commit(next: boolean) {
    const raw = await savePermission(server.id, permKey, next);
    onSaved(raw);
    toastFor(permKey, next, server.label);
  }

  // Coming back from the Hack Club confirmation: apply the switch that was asked for.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("turn") !== permKey || params.get("server") !== server.id) return;
    resumed.current = true;
    params.delete("turn");
    params.delete("server");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    void (async () => {
      setPending(true);
      try {
        await commit(true);
      } catch (e) {
        setError(message(e));
      } finally {
        setPending(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permKey, server.id]);

  async function change(next: boolean) {
    // Turning the terminal or file changes on needs a fresh Hack Club sign-in first.
    if (needsTypedConfirm(permKey) && next) {
      const back = `/account?turn=${permKey}&server=${server.id}#container-permissions-heading`;
      window.location.assign(`/api/auth/reauth?next=${encodeURIComponent(back)}`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await commit(next);
    } catch (e) {
      setError(message(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="px-4 py-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
        <p id={labelId} className="col-start-1 row-start-1 font-medium">
          {PERMISSION_LABELS[permKey]}
        </p>
        <p
          id={descId}
          className="max-w-[60ch] text-label text-muted-foreground col-start-1 row-start-2 max-sm:col-span-2"
        >
          {PERMISSION_DESCRIPTIONS[permKey]}
        </p>
        <div className="flex items-center gap-3 col-start-2 row-start-1 sm:row-span-2 sm:self-start">
          <span
            className="tabular flex min-w-[4.5rem] items-center justify-end gap-1.5 text-label text-muted-foreground"
            aria-live="polite"
          >
            {pending ? (
              <>
                <PixelLoader size="sm" />
                Saving…
              </>
            ) : checked ? (
              PERMISSION_STATE.on
            ) : (
              PERMISSION_STATE.off
            )}
          </span>
          <Switch.Root
            ref={switchRef}
            nativeButton
            render={<button type="button" />}
            checked={checked}
            disabled={pending}
            onCheckedChange={(next) => void change(next)}
            aria-labelledby={`${labelId} ${headingId}`}
            aria-describedby={error ? `${descId} ${errorId}` : descId}
            aria-busy={pending || undefined}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 outline-none",
              "bg-[var(--ds-gray-700)] data-[checked]:bg-foreground",
              "transition-colors duration-(--dur-fast) ease-snappy",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ds-focus-color)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
              // A 40px square target on phones without making the switch bigger.
              "before:absolute before:-inset-2 before:content-[''] sm:before:-inset-1"
            )}
          >
            <Switch.Thumb
              className={cn(
                "pointer-events-none block size-5 rounded-full bg-background shadow-sm",
                "transition-transform duration-(--dur-fast) ease-snappy",
                "data-[checked]:translate-x-5"
              )}
            />
          </Switch.Root>
        </div>
      </div>

      {error ? (
        <Alert tone="error" role="alert" className="mt-3">
          <span id={errorId}>{error}</span>
        </Alert>
      ) : null}
    </li>
  );
}
