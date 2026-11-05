"use client";

import { useEffect, useId, useRef, useState } from "react";
import { WarningIcon } from "@phosphor-icons/react";
import { api } from "@/components/api";
import { CopyButton } from "@/components/developer-docs";
import { Card, Label } from "@/components/settings-ui";
import { TokenListSkeleton } from "@/components/skeletons/developer";
import { StatusIndicator } from "@/components/status-dot";
import { Alert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldClass, Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { LoadingRegion } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import {
  ACTIVE_TOKEN_LIMIT,
  DEFAULT_EXPIRY_DAYS,
  DEPLOY_DROP_NOTE,
  DEPLOY_SCOPE,
  EXPIRY_OPTIONS,
  NAME_MAX_LENGTH,
  SECRET_NOTE,
  STATUS_LABEL,
  activeCount,
  buildTokenPatch,
  canEdit,
  dropsDeployAccess,
  errorText,
  expiryLabel,
  formatDate,
  lastUsedLabel,
  limitNote,
  tokenStatus,
  type ExpiryChoice,
  type TokenPatch,
} from "@/lib/developer";
import { cn } from "@/lib/utils";
import type { TokenSummary } from "@/server/api-tokens";

export type ScopeOption = { id: string; label: string };

const TONE_FOR = { active: "ready", expired: "warning", revoked: "neutral" } as const;

type Secret = { name: string; value: string };

/**
 * The "Access tokens" card: a create form, the one-time secret, and the list.
 * The list loads in the browser from /api/tokens so it can show a skeleton and
 * a retry. The secret exists only in this component's state: it is never
 * stored and never comes back from the list.
 */
export function DeveloperTokens({ scopes }: { scopes: ScopeOption[] }) {
  const [tokens, setTokens] = useState<TokenSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [secret, setSecret] = useState<Secret | null>(null);

  const secretRef = useRef<HTMLInputElement>(null);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  // Computed once: statuses and "in 12 days" are read against this moment.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    api<{ tokens: TokenSummary[] }>("/api/tokens")
      .then((res) => {
        if (!cancelled) setTokens(res.tokens);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(errorText(e, "Could not load your tokens."));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  /** Focus after React has committed the change that put the target on screen. */
  const focusSoon = (target: "secret" | "list") =>
    requestAnimationFrame(() => {
      if (target === "secret") {
        secretRef.current?.focus();
        secretRef.current?.select();
      } else {
        listHeadingRef.current?.focus();
      }
    });

  function retry() {
    setLoadError(null);
    setTokens(null);
    setAttempt((n) => n + 1);
  }

  function onCreated(token: TokenSummary, value: string) {
    setTokens((cur) => [token, ...(cur ?? [])]);
    setSecret({ name: token.name, value });
    focusSoon("secret");
    toast.success("Token created", token.name);
  }

  async function revoke(token: TokenSummary) {
    await api(`/api/tokens/${encodeURIComponent(token.id)}`, { method: "DELETE" });
    setTokens((cur) =>
      (cur ?? []).map((t) =>
        t.id === token.id ? { ...t, revokedAt: new Date().toISOString(), active: false } : t
      )
    );
    toast.success("Token revoked", token.name);
    focusSoon("list");
  }

  /** Throws the server's message so the editor can show it inline. */
  async function save(token: TokenSummary, patch: TokenPatch) {
    const res = await api<{ token: TokenSummary }>(`/api/tokens/${encodeURIComponent(token.id)}`, {
      method: "PATCH",
      body: patch,
    });
    setTokens((cur) => (cur ?? []).map((t) => (t.id === token.id ? res.token : t)));
    toast.success("Token updated", res.token.name);
  }

  const active = tokens ? activeCount(tokens, now) : 0;
  const atLimit = active >= ACTIVE_TOKEN_LIMIT;

  return (
    <Card
      id="tokens-heading"
      title="Access tokens"
      description="A token lets a script or an AI agent act for you, with only the permissions you pick. Treat it like a password."
    >
      <div className="space-y-6">
        {secret ? (
          <SecretPanel
            secret={secret}
            inputRef={secretRef}
            onDone={() => {
              setSecret(null);
              focusSoon("list");
            }}
          />
        ) : null}

        <CreateForm
          scopes={scopes}
          disabled={atLimit || tokens === null}
          blockedBySecret={secret !== null}
          limitReached={atLimit}
          onCreated={onCreated}
        />

        <section aria-labelledby="tokens-list-heading">
          <h3 id="tokens-list-heading" ref={listHeadingRef} tabIndex={-1} className="font-medium outline-none">
            Your tokens
          </h3>
          {tokens ? <p className="mt-0.5 text-label text-muted-foreground">{limitNote(active)}</p> : null}

          <div className="mt-3">
            {loadError ? (
              <Alert
                tone="error"
                role="alert"
                title="Could not load your tokens"
                action={
                  <Button type="button" variant="outline" size="sm" onClick={retry}>
                    Try again
                  </Button>
                }
              >
                {loadError}
              </Alert>
            ) : tokens === null ? (
              <LoadingRegion label="Loading tokens…">
                <TokenListSkeleton />
              </LoadingRegion>
            ) : tokens.length === 0 ? (
              <EmptyState
                size="compact"
                className="py-4"
                title="No tokens yet"
                description="Create one above to let a script or an AI agent use the API."
              />
            ) : (
              <ul className="hairline-y overflow-hidden rounded-md shadow-border-base">
                {tokens.map((t) => (
                  <TokenRow key={t.id} token={t} now={now} scopes={scopes} onRevoke={() => revoke(t)} onSave={save} />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </Card>
  );
}

/** The secret, once. It stays until the person says they have copied it. */
function SecretPanel({
  secret,
  inputRef,
  onDone,
}: {
  secret: Secret;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onDone: () => void;
}) {
  const headingId = useId();
  const noteId = useId();
  return (
    <div
      role="region"
      aria-labelledby={headingId}
      className="rounded-lg bg-[var(--tone-warning-bg)] p-4 shadow-[0_0_0_1px_var(--tone-warning-ring)]"
    >
      <h3 id={headingId} className="flex items-start gap-2 font-medium">
        <WarningIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--tone-warning-icon)]" />
        <span className="min-w-0 break-words">New token: {secret.name}</span>
      </h3>
      <p id={noteId} className="mt-1 font-medium">
        {SECRET_NOTE}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          readOnly
          value={secret.value}
          aria-label="New token"
          aria-describedby={noteId}
          spellCheck={false}
          autoComplete="off"
          onFocus={(e) => e.currentTarget.select()}
          className={cn(fieldClass, "min-w-0 flex-1 font-mono text-[13px] md:text-[13px]")}
        />
        <CopyButton
          text={secret.value}
          label="Copy the new token"
          onFail={() => inputRef.current?.select()}
          className="max-sm:w-full"
        />
      </div>
      <div className="mt-4">
        <Button type="button" onClick={onDone} className="max-sm:w-full">
          I have copied it
        </Button>
      </div>
    </div>
  );
}

function CreateForm({
  scopes,
  disabled,
  blockedBySecret,
  limitReached,
  onCreated,
}: {
  scopes: ScopeOption[];
  disabled: boolean;
  blockedBySecret: boolean;
  limitReached: boolean;
  onCreated: (token: TokenSummary, secret: string) => void;
}) {
  const uid = useId();
  const nameId = `${uid}-name`;
  const nameErrId = `${uid}-name-error`;
  const nameHintId = `${uid}-name-hint`;
  const scopeErrId = `${uid}-scope-error`;
  const expiryId = `${uid}-expiry`;
  const blockedId = `${uid}-blocked`;
  const nameRef = useRef<HTMLInputElement>(null);
  const firstScopeRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [days, setDays] = useState(DEFAULT_EXPIRY_DAYS);
  const [nameError, setNameError] = useState<string | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toggle(id: string, on: boolean) {
    setScopeError(null);
    setPicked((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || disabled || blockedBySecret) return;
    setServerError(null);
    const trimmed = name.trim();
    const nErr = trimmed ? null : "Give the token a name.";
    const sErr = picked.size === 0 ? "Pick at least one permission." : null;
    setNameError(nErr);
    setScopeError(sErr);
    if (nErr) return nameRef.current?.focus();
    if (sErr) return firstScopeRef.current?.focus();

    setPending(true);
    try {
      const res = await api<{ token: TokenSummary; secret: string }>("/api/tokens", {
        body: {
          name: trimmed,
          // Keep the order the permissions are listed in.
          scopes: scopes.filter((s) => picked.has(s.id)).map((s) => s.id),
          expiresInDays: days,
        },
      });
      setName("");
      setPicked(new Set());
      setDays(DEFAULT_EXPIRY_DAYS);
      onCreated(res.token, res.secret);
    } catch (err) {
      setServerError(errorText(err, "Could not create the token. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby={`${uid}-heading`}
      className="space-y-4 rounded-md p-4 shadow-border-base"
    >
      <h3 id={`${uid}-heading`} className="font-medium">
        Create a token
      </h3>

      <div>
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          ref={nameRef}
          value={name}
          maxLength={NAME_MAX_LENGTH}
          required
          aria-required="true"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${nameHintId} ${nameErrId}` : nameHintId}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
          className="sm:max-w-sm"
        />
        <p id={nameHintId} className="mt-1.5 text-caption text-muted-foreground">
          So you can tell it apart later. Up to {NAME_MAX_LENGTH} characters.
        </p>
        {nameError ? (
          <p id={nameErrId} role="alert" className="mt-1 text-label text-destructive">
            {nameError}
          </p>
        ) : null}
      </div>

      <fieldset className="min-w-0" aria-describedby={scopeError ? scopeErrId : undefined}>
        <legend className="mb-1.5 text-label text-muted-foreground">Permissions</legend>
        <ScopeChecklist scopes={scopes} picked={picked} onToggle={toggle} firstRef={firstScopeRef} />
        {scopeError ? (
          <p id={scopeErrId} role="alert" className="mt-1.5 text-label text-destructive">
            {scopeError}
          </p>
        ) : null}
      </fieldset>

      <div>
        <Label htmlFor={expiryId}>Expires after</Label>
        <NativeSelect
          id={expiryId}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="sm:max-w-48"
        >
          {EXPIRY_OPTIONS.map((o) => (
            <option key={o.days} value={o.days}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {serverError ? (
        <Alert tone="error" role="alert">
          {serverError}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          loading={pending}
          disabled={disabled || blockedBySecret}
          aria-describedby={blockedBySecret ? blockedId : undefined}
          className="max-sm:w-full"
        >
          {pending ? "Creating…" : "Create token"}
        </Button>
        {blockedBySecret ? (
          <p id={blockedId} className="text-label text-muted-foreground">
            Confirm you copied the new token first.
          </p>
        ) : limitReached ? (
          <p className="text-label text-muted-foreground">Revoke a token to make room.</p>
        ) : null}
      </div>
    </form>
  );
}

/** The permission checkboxes, shared by the create form and the token editor. */
function ScopeChecklist({
  scopes,
  picked,
  onToggle,
  firstRef,
}: {
  scopes: ScopeOption[];
  picked: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  firstRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <ul className="hairline-y overflow-hidden rounded-md shadow-border-base">
      {scopes.map((s, i) => {
        const deploy = s.id === DEPLOY_SCOPE;
        return (
          <li key={s.id}>
            <label
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2.5 max-sm:min-h-12",
                deploy && "bg-[var(--tone-warning-bg)]"
              )}
            >
              <input
                ref={i === 0 ? firstRef : undefined}
                type="checkbox"
                className="mt-1 shrink-0"
                checked={picked.has(s.id)}
                onChange={(e) => onToggle(s.id, e.target.checked)}
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{s.label}</span>
                  {deploy ? (
                    <span className="inline-flex items-center gap-1 rounded-sm bg-background px-1.5 py-0.5 text-caption font-medium shadow-[0_0_0_1px_var(--tone-warning-ring)]">
                      <WarningIcon aria-hidden="true" className="size-3 text-[var(--tone-warning-icon)]" />
                      Can start builds
                    </span>
                  ) : null}
                </span>
                <span className="block font-mono text-caption text-muted-foreground">{s.id}</span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function TokenRow({
  token,
  now,
  scopes,
  onRevoke,
  onSave,
}: {
  token: TokenSummary;
  now: number;
  scopes: ScopeOption[];
  onRevoke: () => Promise<void>;
  onSave: (token: TokenSummary, patch: TokenPatch) => Promise<void>;
}) {
  const status = tokenStatus(token, now);
  const dim = status !== "active";
  const [editing, setEditing] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);
  const editorId = useId();
  const editable = canEdit(token, now);

  function closeEditor() {
    setEditing(false);
    // Back to the control that opened it, once it is on screen again.
    requestAnimationFrame(() => editRef.current?.focus());
  }

  return (
    <li className="px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className={cn("min-w-0 font-medium break-words", dim && "text-muted-foreground")}>{token.name}</p>
            <StatusIndicator tone={TONE_FOR[status]} label={STATUS_LABEL[status]} className="text-label" />
          </div>
          <p className="mt-0.5 font-mono text-label text-muted-foreground">
            <span className="sr-only">Starts with </span>
            {token.prefix}
          </p>
        </div>
        {editable ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              ref={editRef}
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Edit ${token.name}`}
              aria-expanded={editing}
              aria-controls={editing ? editorId : undefined}
              onClick={() => (editing ? closeEditor() : setEditing(true))}
            >
              Edit
            </Button>
            <ConfirmDialog
              trigger={
                <Button type="button" variant="destructive" size="sm" aria-label={`Revoke ${token.name}`}>
                  Revoke
                </Button>
              }
              tone="destructive"
              title={`Revoke "${token.name}"?`}
              description="Anything using this token stops working right away. This cannot be undone."
              confirmLabel="Revoke token"
              pendingLabel="Revoking…"
              onConfirm={onRevoke}
            />
          </div>
        ) : null}
      </div>

      {editing ? (
        <TokenEditor
          id={editorId}
          token={token}
          scopes={scopes}
          onSave={async (patch) => {
            await onSave(token, patch);
            closeEditor();
          }}
          onCancel={closeEditor}
        />
      ) : (
        <>
          <ul aria-label="Permissions" className="mt-2 flex flex-wrap gap-1.5">
            {token.scopes.map((s) => (
              <li
                key={s}
                className={cn(
                  "rounded-sm px-1.5 py-0.5 font-mono text-caption",
                  s === DEPLOY_SCOPE
                    ? "bg-[var(--tone-warning-bg)] shadow-[0_0_0_1px_var(--tone-warning-ring)]"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {s}
              </li>
            ))}
          </ul>

          <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-label sm:grid-cols-3">
            <Meta label="Created">{formatDate(token.createdAt)}</Meta>
            <Meta label="Last used">{lastUsedLabel(token.lastUsedAt, now)}</Meta>
            <Meta label={status === "revoked" ? "Was due" : status === "expired" ? "Expired" : "Expires"}>
              {expiryLabel(token, now)}
            </Meta>
          </dl>
        </>
      )}
    </li>
  );
}

/**
 * Inline editor for one active token. It sends only what changed; the secret
 * is never involved. Changes apply to the very next request that uses the token.
 */
function TokenEditor({
  id,
  token,
  scopes,
  onSave,
  onCancel,
}: {
  id: string;
  token: TokenSummary;
  scopes: ScopeOption[];
  onSave: (patch: TokenPatch) => Promise<void>;
  onCancel: () => void;
}) {
  const nameId = `${id}-name`;
  const nameErrId = `${id}-name-error`;
  const scopeErrId = `${id}-scope-error`;
  const expiryId = `${id}-expiry`;
  const nameRef = useRef<HTMLInputElement>(null);
  const firstScopeRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(token.name);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(token.scopes));
  const [expiry, setExpiry] = useState<ExpiryChoice>("keep");
  const [nameError, setNameError] = useState<string | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Keep the order the permissions are listed in.
  const chosen = scopes.filter((s) => picked.has(s.id)).map((s) => s.id);
  const dropsDeploy = dropsDeployAccess(token.scopes, chosen);

  function toggle(scopeId: string, on: boolean) {
    setScopeError(null);
    setPicked((cur) => {
      const next = new Set(cur);
      if (on) next.add(scopeId);
      else next.delete(scopeId);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setServerError(null);
    const nErr = name.trim() ? null : "Give the token a name.";
    const sErr = chosen.length === 0 ? "Pick at least one permission." : null;
    setNameError(nErr);
    setScopeError(sErr);
    if (nErr) return nameRef.current?.focus();
    if (sErr) return firstScopeRef.current?.focus();

    const patch = buildTokenPatch(token, { name, scopes: chosen, expiry });
    if (Object.keys(patch).length === 0) return onCancel();

    setPending(true);
    try {
      await onSave(patch);
    } catch (err) {
      setServerError(errorText(err, "Could not save the changes. Try again."));
      setPending(false);
    }
  }

  return (
    <form
      id={id}
      onSubmit={submit}
      noValidate
      aria-label={`Edit ${token.name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) onCancel();
      }}
      className="mt-3 space-y-4 rounded-md bg-muted/40 p-4 shadow-border-base"
    >
      <div>
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          ref={nameRef}
          value={name}
          maxLength={NAME_MAX_LENGTH}
          required
          aria-required="true"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? nameErrId : undefined}
          autoComplete="off"
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
          className="sm:max-w-sm"
        />
        {nameError ? (
          <p id={nameErrId} role="alert" className="mt-1 text-label text-destructive">
            {nameError}
          </p>
        ) : null}
      </div>

      <fieldset className="min-w-0" aria-describedby={scopeError ? scopeErrId : undefined}>
        <legend className="mb-1.5 text-label text-muted-foreground">Permissions</legend>
        <ScopeChecklist scopes={scopes} picked={picked} onToggle={toggle} firstRef={firstScopeRef} />
        {scopeError ? (
          <p id={scopeErrId} role="alert" className="mt-1.5 text-label text-destructive">
            {scopeError}
          </p>
        ) : null}
        <div role="status">
          {dropsDeploy ? (
            <Alert tone="warning" className="mt-2 p-3 text-label">
              {DEPLOY_DROP_NOTE}
            </Alert>
          ) : null}
        </div>
      </fieldset>

      <div>
        <Label htmlFor={expiryId}>Expires after</Label>
        <NativeSelect
          id={expiryId}
          value={expiry}
          onChange={(e) => setExpiry(e.target.value === "keep" ? "keep" : (Number(e.target.value) as ExpiryChoice))}
          className="sm:max-w-64"
        >
          <option value="keep">Keep current ({formatDate(token.expiresAt)})</option>
          {EXPIRY_OPTIONS.map((o) => (
            <option key={o.days} value={o.days}>
              {o.label} from now
            </option>
          ))}
        </NativeSelect>
        <p className="mt-1.5 text-caption text-muted-foreground">
          A new expiry counts from today, so it can make the token last longer or end sooner.
        </p>
      </div>

      {serverError ? (
        <Alert tone="error" role="alert">
          {serverError}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} className="max-sm:w-full">
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending} className="max-sm:w-full">
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:block">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular">{children}</dd>
    </div>
  );
}
