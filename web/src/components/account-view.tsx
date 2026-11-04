"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/api";
import { Card, Label } from "@/components/settings-ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SessionItem = { id: string; label: string; started: string; current: boolean };

/** Browser sessions and account deletion. The profile itself comes from Hack Club and is read-only. */
export function AccountView({ name, sessions }: { name: string; sessions: SessionItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const others = sessions.filter((s) => !s.current);

  async function revoke(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api(`/api/account/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign that browser out");
    } finally {
      setBusy(null);
    }
  }

  async function revokeAll() {
    setBusy("all");
    setError(null);
    try {
      await api("/api/account/sessions", { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign the others out");
    } finally {
      setBusy(null);
    }
  }

  async function destroy() {
    setBusy("delete");
    setDeleteError(null);
    try {
      await api("/api/account", { method: "DELETE", body: { confirm } });
      router.push("/");
      router.refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the account");
      setBusy(null);
    }
  }

  const canDelete = confirm.trim() === name;

  return (
    <div className="space-y-6">
      <Card
        id="sessions-heading"
        title="Signed-in browsers"
        description="Anywhere you are signed in to Nest Deploy. Sign out any you do not recognise."
      >
        <ul className="hairline-y overflow-hidden rounded-md shadow-border-base">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="flex min-w-0 items-center gap-2 font-medium">
                  <span className="truncate">{s.label}</span>
                  {s.current ? <Badge variant="outline">This browser</Badge> : null}
                </p>
                <p className="text-label text-muted-foreground">Signed in {s.started}</p>
              </div>
              {s.current ? null : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  loading={busy === s.id}
                  onClick={() => void revoke(s.id)}
                >
                  {busy === s.id ? "Signing out…" : "Sign out"}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {others.length > 0 ? (
          <div className="mt-4">
            <Button
              variant="outline"
              disabled={busy !== null}
              loading={busy === "all"}
              onClick={() => void revokeAll()}
            >
              {busy === "all" ? "Signing out…" : "Sign out everywhere else"}
            </Button>
          </div>
        ) : null}
        {error ? (
          <Alert tone="error" role="alert" className="mt-3">
            {error}
          </Alert>
        ) : null}
      </Card>

      <Card
        id="delete-account-heading"
        title="Delete Account"
        description="Removes your projects, servers, domains, keys and history from Nest Deploy. Apps already running on your Nest container keep running, but nothing manages them any more. Delete the SSH key in your Nest dashboard too."
        tone="danger"
        footer={
          <>
            {deleteError ? (
              <p role="alert" className="min-w-0 text-label text-foreground">
                {deleteError}
              </p>
            ) : null}
            <Button
              variant={canDelete ? "destructive-solid" : "destructive"}
              disabled={!canDelete || busy !== null}
              loading={busy === "delete"}
              onClick={() => void destroy()}
              className="ml-auto"
            >
              {busy === "delete" ? "Deleting…" : "Delete account"}
            </Button>
          </>
        }
      >
        <Label htmlFor="del-account">
          Type <span className="font-mono text-foreground">{name}</span> to confirm
        </Label>
        <Input
          id="del-account"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
        />
      </Card>
    </div>
  );
}
