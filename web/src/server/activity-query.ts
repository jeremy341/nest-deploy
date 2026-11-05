import { and, count, desc, eq, gte, inArray, like, lt, or, type SQL } from "drizzle-orm";
import { describeAction } from "@/server/audit";
import { getDb, schema } from "@/server/db";
import {
  KIND_PREFIXES,
  PAGE_SIZE,
  fallbackTargetName,
  formatMeta,
  kindOf,
  makeCursor,
  matchesSearch,
  parseCursor,
  parseMeta,
  rangeStart,
  toneOf,
  tokenIdOf,
  type ActivityFilters,
  type ActivityItem,
  type ActivityTarget,
} from "@/server/activity";

/** Raw audit rows read per round trip when a search has to look inside each entry. */
const SCAN_BATCH = 200;
/** A search looks at no more than this many entries, newest first. */
const SCAN_LIMIT = 5000;

/** Leads that need the target to read as a sentence. The audit LABELS stay the source for every other action. */
const LEAD_OVERRIDES: Record<string, string> = {
  "deploy.trigger": "Started a deployment of",
};

export type ActivityPage = {
  items: ActivityItem[];
  /** Pass back to load the next page. Null when this is the end. */
  nextCursor: string | null;
  /** Matching entries in all. Null while a search has not looked at everything. */
  total: number | null;
  /** A search stopped at the scan limit, so older matches may exist. */
  capped: boolean;
  /** The moment the page was built, ISO. Relative times and Today are measured from it. */
  now: string;
};

type AuditRow = typeof schema.auditLog.$inferSelect;

type Lookups = {
  projects: Map<string, { slug: string; name: string }>;
  tokens: Map<string, string>;
  servers: Map<string, string>;
};

async function loadLookups(userId: string): Promise<Lookups> {
  const db = await getDb();
  const [projects, tokens, servers] = await Promise.all([
    db
      .select({ id: schema.projects.id, slug: schema.projects.slug, name: schema.projects.name })
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId)),
    db
      .select({ id: schema.apiTokens.id, name: schema.apiTokens.name })
      .from(schema.apiTokens)
      .where(eq(schema.apiTokens.userId, userId)),
    db
      .select({ id: schema.servers.id, name: schema.servers.nestUsername })
      .from(schema.servers)
      .where(eq(schema.servers.userId, userId)),
  ]);
  return {
    projects: new Map(projects.map((p) => [p.id, { slug: p.slug, name: p.name }])),
    tokens: new Map(tokens.map((t) => [t.id, t.name])),
    servers: new Map(servers.map((s) => [s.id, s.name])),
  };
}

/** The deployments named by deploy-hook entries, so each can link to its page. */
async function loadHookDeployments(rows: { meta: unknown }[]): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const r of rows) {
    const d = (r.meta as { deployment?: unknown } | null)?.deployment;
    if (typeof d === "string" && d) ids.add(d);
  }
  if (ids.size === 0) return new Set();
  const db = await getDb();
  const found = await db
    .select({ id: schema.deployments.id })
    .from(schema.deployments)
    .where(inArray(schema.deployments.id, [...ids]));
  return new Set(found.map((f) => f.id));
}

function resolveTarget(
  row: AuditRow,
  lookups: Lookups,
  clean: Record<string, string | number | boolean>
): ActivityTarget | null {
  const meta = fallbackTargetName(row.action, clean);

  // Domain actions are about a domain; the id on the row is the project it points at.
  if (row.action.startsWith("domain.")) {
    return meta ? { name: meta, href: "/domains" } : null;
  }

  const id = row.target;
  if (id) {
    const project = lookups.projects.get(id);
    if (project) return { name: project.name, href: `/projects/${project.slug}` };
    const token = lookups.tokens.get(id);
    if (token) return { name: token, href: "/developer" };
    const server = lookups.servers.get(id);
    if (server) return { name: server, href: null };
    // The row it pointed at is gone. Use the name the action recorded, else say so.
    if (meta) return { name: meta, href: null, gone: true };
    if (row.action.startsWith("token.")) return { name: "(deleted token)", href: null, gone: true };
    if (row.action.startsWith("container.")) return { name: "(removed server)", href: null, gone: true };
    return { name: "(deleted project)", href: null, gone: true };
  }
  return meta ? { name: meta, href: null, gone: row.action === "project.delete" } : null;
}

function toItem(
  row: AuditRow,
  lookups: Lookups,
  hookDeployments: Set<string>
): ActivityItem {
  const meta = parseMeta(row.meta);
  const { suffix, fields, clean } = formatMeta(row.action, meta);
  const target = resolveTarget(row, lookups, clean);

  const tokenId = tokenIdOf(meta);
  const token = tokenId ? { name: lookups.tokens.get(tokenId) ?? null } : null;

  // Links that need a lookup: the project a domain points at, the deployment a hook started.
  const project = row.target ? lookups.projects.get(row.target) : undefined;
  if (row.action.startsWith("domain.") && project) {
    fields.unshift({ label: "Project", value: project.name, href: `/projects/${project.slug}` });
  }
  const deployment = (meta as { deployment?: unknown } | null)?.deployment;
  if (project && typeof deployment === "string" && hookDeployments.has(deployment)) {
    fields.push({
      label: "Deployment",
      value: "Open deployment",
      href: `/projects/${project.slug}/deployments/${deployment}`,
    });
  }

  return {
    id: row.id,
    action: row.action,
    kind: kindOf(row.action),
    label: LEAD_OVERRIDES[row.action] ?? describeAction(row.action),
    target,
    suffix,
    fields,
    token,
    tone: toneOf(row.action),
    at: row.at.toISOString(),
  };
}

/** The SQL half of the filters: whose, what kind, how far back. Search is applied after, on the readable entry. */
function conditions(userId: string, filters: ActivityFilters, now: Date): SQL[] {
  const conds: SQL[] = [eq(schema.auditLog.userId, userId)];
  if (filters.kind !== "all") {
    const prefixes = KIND_PREFIXES[filters.kind];
    // Prefixes are fixed strings that end in ".", so LIKE needs no escaping.
    conds.push(or(...prefixes.map((p) => like(schema.auditLog.action, `${p}%`)))!);
  }
  const start = rangeStart(filters.range, now);
  if (start) conds.push(gte(schema.auditLog.at, start));
  return conds;
}

/**
 * One page of the signed-in user's activity, newest first, with the filters
 * applied on the server. `limit` entries come back at most; `cursor` continues
 * from the last entry of the previous page.
 */
export async function queryActivity(
  userId: string,
  filters: ActivityFilters,
  opts: { limit?: number; cursor?: string | null; now?: Date } = {}
): Promise<ActivityPage> {
  const limit = Math.min(Math.max(opts.limit ?? PAGE_SIZE, 1), 200);
  const now = opts.now ?? new Date();
  const db = await getDb();
  const base = conditions(userId, filters, now);
  const lookups = await loadLookups(userId);

  const after = parseCursor(opts.cursor);
  const pageConds = after
    ? [
        ...base,
        or(
          lt(schema.auditLog.at, after.at),
          and(eq(schema.auditLog.at, after.at), lt(schema.auditLog.id, after.id))
        )!,
      ]
    : base;

  const readBatch = (conds: SQL[], n: number) =>
    db
      .select()
      .from(schema.auditLog)
      .where(and(...conds))
      .orderBy(desc(schema.auditLog.at), desc(schema.auditLog.id))
      .limit(n);

  const build = async (rows: AuditRow[]) => {
    const parsed = rows.map((r) => ({ meta: parseMeta(r.meta) }));
    const hooks = await loadHookDeployments(parsed);
    return rows.map((r) => toItem(r, lookups, hooks));
  };

  // No search: the database does all the work, one row past the page tells us if there is more.
  if (!filters.q) {
    const [rows, totals] = await Promise.all([
      readBatch(pageConds, limit + 1),
      db
        .select({ n: count() })
        .from(schema.auditLog)
        .where(and(...base)),
    ]);
    const shown = rows.slice(0, limit);
    const items = await build(shown);
    return {
      items,
      nextCursor: rows.length > limit && items.length ? makeCursor(items.at(-1)!.at, items.at(-1)!.id) : null,
      total: totals[0]?.n ?? 0,
      capped: false,
      now: now.toISOString(),
    };
  }

  // Search: the label, target and details only exist once an entry is readable, so read in batches and filter.
  const matches: ActivityItem[] = [];
  let cursor = after;
  let scanned = 0;
  let exhausted = false;
  while (matches.length <= limit && scanned < SCAN_LIMIT) {
    const conds = cursor
      ? [
          ...base,
          or(
            lt(schema.auditLog.at, cursor.at),
            and(eq(schema.auditLog.at, cursor.at), lt(schema.auditLog.id, cursor.id))
          )!,
        ]
      : base;
    const rows = await readBatch(conds, SCAN_BATCH);
    if (rows.length === 0) {
      exhausted = true;
      break;
    }
    scanned += rows.length;
    for (const item of await build(rows)) {
      if (matchesSearch(item, filters.q)) matches.push(item);
    }
    const last = rows.at(-1)!;
    cursor = { at: last.at, id: last.id };
    if (rows.length < SCAN_BATCH) {
      exhausted = true;
      break;
    }
  }

  const items = matches.slice(0, limit);
  const more = matches.length > limit;
  return {
    items,
    nextCursor: more && items.length ? makeCursor(items.at(-1)!.at, items.at(-1)!.id) : null,
    // Only exact when every entry was looked at and everything fit on this page.
    total: exhausted && !more && !after ? items.length : null,
    capped: !exhausted && !more,
    now: now.toISOString(),
  };
}
