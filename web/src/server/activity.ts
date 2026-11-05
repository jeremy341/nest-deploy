/**
 * The Activity page's pure logic: kinds, date ranges, URL parameters, search,
 * grouping by day and turning an audit row's `meta` into readable fields.
 *
 * No database and no other server import lives here, so client components can
 * use it too. The query that fills it in is `activity-query.ts`.
 */

export const PAGE_SIZE = 50;

// ----------------------------------------------------------------- kinds

export type ActivityKind =
  | "projects"
  | "deployments"
  | "domains"
  | "servers"
  | "access"
  | "monitoring"
  | "terminal"
  | "other";

export type KindFilter = "all" | Exclude<ActivityKind, "other">;

/** Action name prefixes per kind. An action that matches none is "other" and only shows under All. */
export const KIND_PREFIXES: Record<Exclude<ActivityKind, "other">, readonly string[]> = {
  projects: ["project.", "env.", "analytics.", "status."],
  deployments: ["deploy.", "hook."],
  domains: ["domain."],
  servers: ["server.", "container."],
  access: ["token.", "account."],
  monitoring: ["monitor."],
  terminal: ["terminal.", "file."],
};

export const KIND_LABELS: Record<ActivityKind, string> = {
  projects: "Projects",
  deployments: "Deployments",
  domains: "Domains",
  servers: "Servers",
  access: "Access and tokens",
  monitoring: "Monitoring",
  terminal: "Terminal and files",
  other: "Other",
};

export const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "projects", label: KIND_LABELS.projects },
  { value: "deployments", label: KIND_LABELS.deployments },
  { value: "domains", label: KIND_LABELS.domains },
  { value: "servers", label: KIND_LABELS.servers },
  { value: "access", label: KIND_LABELS.access },
  { value: "monitoring", label: KIND_LABELS.monitoring },
  { value: "terminal", label: KIND_LABELS.terminal },
];

export function kindOf(action: string): ActivityKind {
  for (const [kind, prefixes] of Object.entries(KIND_PREFIXES)) {
    if (prefixes.some((p) => action.startsWith(p))) return kind as ActivityKind;
  }
  return "other";
}

// ---------------------------------------------------------------- ranges

export type RangeFilter = "24h" | "7d" | "30d" | "all";

export const RANGE_OPTIONS: { value: RangeFilter; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

const RANGE_MS: Record<Exclude<RangeFilter, "all">, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

/** The earliest moment a range includes, or null for "all". */
export function rangeStart(range: RangeFilter, now: Date): Date | null {
  return range === "all" ? null : new Date(now.getTime() - RANGE_MS[range]);
}

// ------------------------------------------------------ filters and the URL

export type ActivityFilters = { kind: KindFilter; range: RangeFilter; q: string };

export const DEFAULT_FILTERS: ActivityFilters = { kind: "all", range: "all", q: "" };

const MAX_QUERY = 80;

type ParamValue = string | string[] | null | undefined;

function first(value: ParamValue): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Read filters from search params. Anything unknown falls back to the default. */
export function parseFilters(
  params: URLSearchParams | Record<string, ParamValue>
): ActivityFilters {
  const get = (key: string) =>
    params instanceof URLSearchParams ? (params.get(key) ?? "") : first(params[key]);
  const kind = get("kind");
  const range = get("range");
  return {
    kind: KIND_OPTIONS.some((o) => o.value === kind) ? (kind as KindFilter) : "all",
    range: RANGE_OPTIONS.some((o) => o.value === range) ? (range as RangeFilter) : "all",
    q: get("q").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY),
  };
}

/** The query string for a filter set, without the leading "?". Defaults are left out. */
export function serializeFilters(filters: ActivityFilters): string {
  const p = new URLSearchParams();
  if (filters.kind !== "all") p.set("kind", filters.kind);
  if (filters.range !== "all") p.set("range", filters.range);
  if (filters.q) p.set("q", filters.q);
  return p.toString();
}

export function isFiltered(f: ActivityFilters): boolean {
  return f.kind !== "all" || f.range !== "all" || f.q !== "";
}

/** "Projects, last 7 days, matching "api"": what is narrowing the list, for the empty state. */
export function describeFilters(f: ActivityFilters): string {
  const parts: string[] = [];
  if (f.kind !== "all") parts.push(KIND_LABELS[f.kind]);
  if (f.range !== "all") {
    parts.push((RANGE_OPTIONS.find((o) => o.value === f.range)?.label ?? "").toLowerCase());
  }
  if (f.q) parts.push(`matching “${f.q}”`);
  return parts.join(", ");
}

// ------------------------------------------------------------- the entry

export type ActivityField = {
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
};

export type ActivityTarget = { name: string; href: string | null; gone?: boolean };

export type ActivityItem = {
  id: number;
  action: string;
  kind: ActivityKind;
  /** "Closed a terminal on" */
  label: string;
  target: ActivityTarget | null;
  /** The rest of the sentence: "after 14 minutes, reason: idle". Starts with ":" when it attaches without a space. */
  suffix: string | null;
  /** Labelled pairs for the details disclosure. Never contains a secret. */
  fields: ActivityField[];
  /** Set when an access token made the change. `name` is null if the token is gone. */
  token: { name: string | null } | null;
  tone: "neutral" | "good" | "bad";
  /** ISO time. */
  at: string;
};

/** Everything the search box looks at: the label, the target, the sentence and every detail value. */
export function searchText(item: ActivityItem): string {
  return [
    item.label,
    item.target?.name,
    item.suffix,
    item.token ? `token ${item.token.name ?? ""}` : null,
    ...item.fields.map((f) => f.value),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Every word of the query must appear somewhere in the entry. An empty query matches all. */
export function matchesSearch(item: ActivityItem, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = searchText(item);
  return words.every((w) => hay.includes(w));
}

// -------------------------------------------------------------- grouping

export type ActivityDay<T extends { at: string }> = {
  /** UTC date, "2026-11-05". */
  day: string;
  label: string;
  items: T[];
};

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Entries grouped by UTC calendar day, in arrival order (newest first). Today
 * and Yesterday are relative to `now`. Two entries a second apart either side
 * of midnight UTC land in different groups.
 */
export function groupByDay<T extends { at: string }>(items: T[], now: Date): ActivityDay<T>[] {
  const today = utcDay(now);
  const yesterday = utcDay(new Date(now.getTime() - 86_400_000));
  const groups: ActivityDay<T>[] = [];
  for (const item of items) {
    const at = new Date(item.at);
    const day = utcDay(at);
    const last = groups.at(-1);
    if (last && last.day === day) {
      last.items.push(item);
    } else {
      groups.push({
        day,
        label: day === today ? "Today" : day === yesterday ? "Yesterday" : dayFormat.format(at),
        items: [item],
      });
    }
  }
  return groups;
}

// ------------------------------------------------------- secrets and meta

/**
 * Key names that hold or point at a secret. Audit meta should never carry one,
 * but this page is the last line of defence, so they are dropped on sight.
 */
const SECRET_KEY =
  /(secret|passw|pwd|token|credential|cookie|bearer|signature|authoriz|auth|hash|salt|jwt|cipher|sealed|webhook|apikey|accesskey|privatekey|sshkey|sessionid|otp)/;

export function isSecretKey(key: string): boolean {
  // "apiKey" and "api-key" become "api_key", so a trailing "key" is its own word ("monkey" is fine).
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (/(^|_)(key|enc)$/.test(words)) return true;
  return SECRET_KEY.test(words.replace(/_/g, ""));
}

const SECRET_PREFIX =
  /^(nd_|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|sk[-_]|pk_live|rk_live|xox[abpsr]-|akia|aiza|eyj|bearer\s|basic\s|-----begin)/i;
const SECRET_ASSIGNMENT = /(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\s*[=:]\s*\S+/i;
const URL_USERINFO = /:\/\/[^/\s:@]+:[^/\s@]+@/;
const URL_SECRET_QUERY = /[?&](token|key|secret|sig|signature|password|pass|auth|access_token|api_key)=/i;
const WEBHOOK_URL = /(discord(app)?\.com\/api\/webhooks|hooks\.slack\.com|hooks\.zapier\.com)/i;

/**
 * Whether a value looks like a secret, whatever its key. Conservative about
 * ordinary text: file paths, branch names and words pass; long random-looking
 * strings, prefixed keys, credentials in URLs and key=value pairs do not.
 */
export function isSecretValue(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (SECRET_PREFIX.test(v)) return true;
  if (SECRET_ASSIGNMENT.test(v)) return true;
  if (URL_USERINFO.test(v) || URL_SECRET_QUERY.test(v) || WEBHOOK_URL.test(v)) return true;
  if (/^[a-f0-9]{32,}$/i.test(v)) return true;
  if (/\s/.test(v) || v.length < 24) return false;
  // Random-looking: one unbroken run with upper case, lower case and digits, few separators.
  if (/^[A-Za-z0-9+/_=-]+$/.test(v) && !v.startsWith("/") && !v.includes("//")) {
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/].every((re) => re.test(v));
    const separators = (v.match(/[-_]/g) ?? []).length / v.length;
    if (classes && separators < 0.1) return true;
  }
  return false;
}

/** Keys that are plumbing, not detail. They are used elsewhere (the token actor, links) or mean nothing to a person. */
const HIDDEN_KEYS = new Set(["project", "token", "deployment"]);

const MAX_VALUE = 200;

type Scalar = string | number | boolean;

/**
 * The meta a person may see: scalar values only, no secret-looking keys and no
 * secret-looking values, trimmed. Insertion order is kept.
 */
export function cleanMeta(meta: unknown): Record<string, Scalar> {
  const out: Record<string, Scalar> = {};
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return out;
  for (const [key, raw] of Object.entries(meta as Record<string, unknown>)) {
    if (HIDDEN_KEYS.has(key) || isSecretKey(key)) continue;
    if (typeof raw === "number" || typeof raw === "boolean") {
      out[key] = raw;
      continue;
    }
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value || isSecretValue(value)) continue;
    out[key] = value.length > MAX_VALUE ? `${value.slice(0, MAX_VALUE)}…` : value;
  }
  return out;
}

/** "productionBranch" and "file_writes" become "production branch" and "file writes". */
export function humanize(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A list value such as "productionBranch, buildCommand" as "production branch, build command". */
function humanList(value: string): string {
  return value
    .split(",")
    .map((s) => humanize(s))
    .filter(Boolean)
    .join(", ");
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** 840 seconds as "14 minutes"; 3900 as "1 hour 5 minutes". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return plural(s, "second");
  const minutes = Math.round(s / 60);
  if (minutes < 60) return plural(minutes, "minute");
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? plural(h, "hour") : `${plural(h, "hour")} ${plural(m, "minute")}`;
}

/** Why a terminal ended, as the "Reason" value and as the short form used in the sentence. */
const REASONS: Record<string, { field: string; short: string }> = {
  closed: { field: "Closed by you", short: "closed by you" },
  idle: { field: "Idle", short: "idle" },
  limit: { field: "Time limit reached", short: "time limit reached" },
  "shell-exit": { field: "The shell exited", short: "shell exited" },
  "connection-lost": { field: "Connection lost", short: "connection lost" },
  "signed-out": { field: "Signed out", short: "signed out" },
  disabled: { field: "Terminal turned off", short: "terminal turned off" },
  error: { field: "Error", short: "error" },
};

/** Field labels. A per-action entry wins over the general one. */
const FIELD_LABELS: Record<string, string> = {
  branch: "Branch",
  env: "Environment",
  target: "Environment",
  sha: "Commit",
  domain: "Domain",
  port: "Port",
  path: "Path",
  from: "From",
  to: "To",
  server: "Server",
  kind: "Kind",
  name: "Name",
  reason: "Reason",
  seconds: "Duration",
  scopes: "Scopes",
  fields: "Changed",
  changed: "Changed",
  detail: "Detail",
  via: "Via",
  count: "Count",
  expiresInDays: "Expires in",
};

const ACTION_FIELD_LABELS: Record<string, Record<string, string>> = {
  "env.set": { name: "Variable", target: "Environment" },
  "env.delete": { name: "Variable" },
  "project.create": { name: "Project name" },
  "project.delete": { name: "Project name" },
  "token.create": { name: "Token name" },
  "token.update": { name: "New name", scopes: "New scopes" },
  "account.sessions_revoke_all": { count: "Browsers signed out" },
};

function fieldValue(key: string, value: Scalar): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return key === "seconds" ? formatDuration(value) : String(value);
  switch (key) {
    case "reason":
      return REASONS[value]?.field ?? capital(humanize(value));
    case "via":
      return value === "api" ? "Access token (API)" : capital(humanize(value));
    case "env":
    case "target":
      return capital(value);
    case "fields":
    case "changed":
      return humanList(value);
    case "expiresInDays":
      return /^\d+$/.test(value) ? plural(Number(value), "day") : value;
    default:
      return value;
  }
}

const MONO_KEYS = new Set(["path", "from", "to", "sha", "domain", "server", "scopes"]);

/** The part of the sentence after the target, from the clean meta. */
function suffixFor(action: string, m: Record<string, Scalar>): string | null {
  const s = (key: string) => (typeof m[key] === "string" ? (m[key] as string) : null);
  const n = (key: string) => (typeof m[key] === "number" ? (m[key] as number) : null);
  const branch = s("branch");
  switch (action) {
    case "terminal.close": {
      const seconds = n("seconds");
      const reason = s("reason");
      const parts: string[] = [];
      if (seconds !== null) parts.push(`after ${formatDuration(seconds)}`);
      const why = reason ? (REASONS[reason]?.short ?? humanize(reason)) : null;
      if (why) parts.push(`reason: ${why}`);
      return parts.length ? parts.join(", ") : null;
    }
    case "deploy.redeploy":
    case "deploy.cancel":
    case "deploy.preview_delete":
    case "deploy.trigger":
    case "hook.trigger":
      return branch ? `from branch ${branch}` : null;
    case "deploy.rollback":
      return s("sha") ? `to commit ${s("sha")}` : null;
    case "file.write":
    case "file.mkdir":
    case "file.delete":
      return s("path") ? `: ${s("path")}` : null;
    case "file.rename":
      return s("from") && s("to") ? `from ${s("from")} to ${s("to")}` : null;
    case "domain.update":
      return n("port") !== null ? `on port ${n("port")}` : null;
    case "monitor.down":
    case "monitor.up":
      return s("detail") ? `(${s("detail")})` : null;
    case "container.orphan_remove": {
      const what = [s("kind"), s("name")].filter(Boolean).join(" ");
      return what ? `: ${what}` : null;
    }
    case "container.permissions":
      return s("changed") ? `: ${humanList(s("changed")!)}` : null;
    case "env.set":
    case "env.delete": {
      const name = s("name");
      if (!name) return null;
      const env = action === "env.set" ? s("target") : null;
      return env ? `: ${name} (${env})` : `: ${name}`;
    }
    case "project.update":
    case "token.update":
      return s("fields") ? `: ${humanList(s("fields")!)}` : null;
    case "account.sessions_revoke_all":
      return n("count") !== null ? `(${plural(n("count")!, "browser")})` : null;
    default:
      return null;
  }
}

/** A name for the target when its row is gone, taken from what the action recorded about it. */
export function fallbackTargetName(action: string, m: Record<string, Scalar>): string | null {
  const s = (key: string) => (typeof m[key] === "string" ? (m[key] as string) : null);
  if (action.startsWith("domain.")) return s("domain");
  if (action === "project.create" || action === "project.delete" || action === "token.create") return s("name");
  if (action === "server.rotate_key") return s("server");
  return null;
}

/** Actions whose meta already names the target, so the field list does not repeat it. */
const TARGET_FROM_META: Record<string, string> = {
  "project.delete": "name",
  "project.create": "name",
  "token.create": "name",
};

/**
 * Turn raw meta into the sentence tail and the labelled fields. Secrets are
 * dropped first (see `cleanMeta`), so nothing below can leak one.
 */
export function formatMeta(
  action: string,
  meta: unknown
): { suffix: string | null; fields: ActivityField[]; clean: Record<string, Scalar> } {
  const clean = cleanMeta(meta);
  const labels = ACTION_FIELD_LABELS[action] ?? {};
  const fields: ActivityField[] = [];
  for (const [key, value] of Object.entries(clean)) {
    if (TARGET_FROM_META[action] === key) continue;
    const label = labels[key] ?? FIELD_LABELS[key] ?? capital(humanize(key));
    const text = fieldValue(key, value);
    if (!text) continue;
    fields.push({ label, value: text, mono: MONO_KEYS.has(key) });
  }
  return { suffix: suffixFor(action, clean), fields, clean };
}

/** Parse a stored meta JSON string. Bad JSON is no meta. */
export function parseMeta(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** The access token id recorded on an entry, if an access token made the change. */
export function tokenIdOf(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const t = (meta as Record<string, unknown>).token;
  return typeof t === "string" && t ? t : null;
}

/** Entries that are worth a second look in the list: outages and removals. */
export function toneOf(action: string): ActivityItem["tone"] {
  if (action === "monitor.down") return "bad";
  if (action === "monitor.up") return "good";
  return "neutral";
}

// ------------------------------------------------------------- cursors

/** A cursor is the time and id of the last entry shown: "1762300000000.42". */
export function makeCursor(at: string, id: number): string {
  return `${new Date(at).getTime()}.${id}`;
}

export function parseCursor(cursor: string | null | undefined): { at: Date; id: number } | null {
  const m = /^(\d{1,15})\.(\d{1,12})$/.exec(cursor ?? "");
  return m ? { at: new Date(Number(m[1])), id: Number(m[2]) } : null;
}
