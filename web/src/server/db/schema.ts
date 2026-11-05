import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  /** Hack Club Auth `sub`. */
  hackClubId: text("hack_club_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  slackId: text("slack_id"),
  createdAt: ts("created_at").notNull(),
});

/**
 * Personal access tokens for the public API and AI agents. Only a hash is stored;
 * the token is shown once when it is created. `scopes` is a JSON array.
 */
export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** First characters of the token, shown in lists so tokens can be told apart. */
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull(),
    scopes: text("scopes").notNull(),
    createdAt: ts("created_at").notNull(),
    lastUsedAt: ts("last_used_at"),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [uniqueIndex("api_tokens_hash_idx").on(t.hash), index("api_tokens_user_idx").on(t.userId)]
);

/** Session ids are stored hashed; the raw token only lives in the cookie. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull(),
    userAgent: text("user_agent"),
    /** When this session last signed in with Hack Club. Sensitive switches need this to be recent. */
    freshAuthAt: ts("fresh_auth_at"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)]
);

export const servers = sqliteTable(
  "servers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nestUsername: text("nest_username").notNull(),
    host: text("host").notNull(),
    port: integer("port").notNull().default(22),
    /** OpenSSH public key line the user pastes into the Nest dashboard. */
    publicKey: text("public_key").notNull(),
    /** Sealed OpenSSH private key. */
    privateKeyEnc: text("private_key_enc").notNull(),
    /** SHA256 fingerprint of our own key, shown to the user. */
    keyFingerprint: text("key_fingerprint").notNull(),
    /** Pinned host key of the bastion (trust on first use). */
    hostKeyFingerprint: text("host_key_fingerprint"),
    /** Container permissions. Defaults are the safer choice: the terminal and file changes are off until you turn them on. */
    allowTerminal: integer("allow_terminal", { mode: "boolean" }).notNull().default(false),
    allowFileWrites: integer("allow_file_writes", { mode: "boolean" }).notNull().default(false),
    allowOrphanRemoval: integer("allow_orphan_removal", { mode: "boolean" }).notNull().default(true),
    status: text("status", { enum: ["pending", "connected", "error"] })
      .notNull()
      .default("pending"),
    lastError: text("last_error"),
    /** JSON of the last capability probe. */
    probe: text("probe"),
    lastCheckedAt: ts("last_checked_at"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("servers_user_nest_idx").on(t.userId, t.nestUsername)]
);

export const githubInstallations = sqliteTable("github_installations", {
  /** GitHub's installation id. */
  id: integer("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type").notNull(),
  createdAt: ts("created_at").notNull(),
});

export const RUNTIMES = ["node", "python", "static", "command"] as const;
export type Runtime = (typeof RUNTIMES)[number];

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    /** Lowercase letters, digits and hyphens. Used in paths and unit names. */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** "owner/name" on GitHub, when imported through the GitHub App. */
    repoFullName: text("repo_full_name"),
    /** Clone URL. For public repos without the App this is all we have. */
    repoUrl: text("repo_url").notNull(),
    installationId: integer("installation_id"),
    productionBranch: text("production_branch").notNull().default("main"),
    rootDir: text("root_dir").notNull().default("."),
    runtime: text("runtime", { enum: RUNTIMES }).notNull(),
    installCommand: text("install_command"),
    buildCommand: text("build_command"),
    startCommand: text("start_command"),
    /** Folder to ship for static sites, relative to the root directory. */
    outputDir: text("output_dir"),
    /** Port the app listens on. Map your domain to this port in Nest. */
    port: integer("port").notNull(),
    healthPath: text("health_path").notNull().default("/"),
    autoDeploy: integer("auto_deploy", { mode: "boolean" })
      .notNull()
      .default(true),
    /** SHA-256 of the deploy hook token. The token itself is shown once and never stored. */
    hookHash: text("hook_hash"),
    hookCreatedAt: ts("hook_created_at"),
    /** Sealed Discord or Slack webhook URL that gets a message when a deployment finishes. */
    notifyUrlEnc: text("notify_url_enc"),
    notifyOn: text("notify_on", { enum: ["all", "failures"] })
      .notNull()
      .default("all"),
    /** Result of the last uptime check. Alerts fire when this changes, not on every check. */
    monitorState: text("monitor_state", { enum: ["unknown", "up", "down"] })
      .notNull()
      .default("unknown"),
    monitorSince: ts("monitor_since"),
    /** Failed checks in a row. One blip is not an outage. */
    monitorFailures: integer("monitor_failures").notNull().default(0),
    /** Warn when the server's disk, memory or CPU load share reaches this percent. */
    alertDiskPct: integer("alert_disk_pct").notNull().default(90),
    alertMemPct: integer("alert_mem_pct").notNull().default(90),
    alertCpuPct: integer("alert_cpu_pct").notNull().default(90),
    /** Failed checks in a row before the app counts as down. */
    alertFailures: integer("alert_failures").notNull().default(2),
    /** A check slower than this many milliseconds counts as failed. Null means no limit. */
    alertSlowMs: integer("alert_slow_ms"),
    /** Which events go to the webhook. Deploy results also follow `notifyOn`. */
    alertOnDown: integer("alert_on_down", { mode: "boolean" }).notNull().default(true),
    alertOnRecovery: integer("alert_on_recovery", { mode: "boolean" }).notNull().default(true),
    alertOnResource: integer("alert_on_resource", { mode: "boolean" }).notNull().default(true),
    alertOnDeploy: integer("alert_on_deploy", { mode: "boolean" }).notNull().default(true),
    /** Alerts are recorded but not sent until this time. */
    alertMutedUntil: ts("alert_muted_until"),
    /** Muted until someone resumes alerts. */
    alertMutedForever: integer("alert_muted_forever", { mode: "boolean" })
      .notNull()
      .default(false),
    /** Public key for the analytics snippet. Null means analytics is off. */
    analyticsKey: text("analytics_key"),
    /** Unguessable id in the public status page URL. Null means there is no public page. */
    statusKey: text("status_key"),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("projects_user_slug_idx").on(t.userId, t.slug),
    uniqueIndex("projects_hook_idx").on(t.hookHash),
    uniqueIndex("projects_analytics_idx").on(t.analyticsKey),
    uniqueIndex("projects_status_idx").on(t.statusKey),
    index("projects_user_idx").on(t.userId),
  ]
);

export const envVars = sqliteTable(
  "env_vars",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueEnc: text("value_enc").notNull(),
    target: text("target", { enum: ["all", "production", "preview"] })
      .notNull()
      .default("all"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("env_project_key_idx").on(t.projectId, t.key, t.target)]
);

export const DEPLOY_STATES = [
  "queued",
  "building",
  "deploying",
  "ready",
  "error",
  "canceled",
] as const;
export type DeployState = (typeof DEPLOY_STATES)[number];

export const deployments = sqliteTable(
  "deployments",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    triggeredBy: text("triggered_by"),
    env: text("env", { enum: ["production", "preview"] }).notNull(),
    state: text("state", { enum: DEPLOY_STATES }).notNull().default("queued"),
    source: text("source", {
      enum: ["manual", "webhook", "hook", "redeploy", "rollback"],
    }).notNull(),
    branch: text("branch").notNull(),
    commitSha: text("commit_sha"),
    commitMessage: text("commit_message"),
    /** Pull request this preview was built for, when it came from one. */
    prNumber: integer("pr_number"),
    author: text("author"),
    /** Port this release listens on. Previews get their own. */
    port: integer("port").notNull(),
    /** Directory name under the project's releases folder on the server. */
    releaseId: text("release_id").notNull(),
    /** True for the release currently serving the production port. */
    isCurrent: integer("is_current", { mode: "boolean" })
      .notNull()
      .default(false),
    /** True once its release folder and service were removed from the server. */
    cleanedUp: integer("cleaned_up", { mode: "boolean" })
      .notNull()
      .default(false),
    /** Size of the uploaded archive, for the log and the UI. */
    archiveBytes: integer("archive_bytes"),
    error: text("error"),
    createdAt: ts("created_at").notNull(),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    index("deployments_project_idx").on(t.projectId, t.createdAt),
    index("deployments_state_idx").on(t.state),
  ]
);

export const deploymentLogs = sqliteTable(
  "deployment_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deploymentId: text("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    at: ts("at").notNull(),
    level: text("level", { enum: ["info", "warn", "error"] })
      .notNull()
      .default("info"),
    message: text("message").notNull(),
  },
  (t) => [index("logs_deployment_idx").on(t.deploymentId, t.id)]
);

export const domains = sqliteTable(
  "domains",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    domain: text("domain").notNull(),
    port: integer("port").notNull(),
    status: text("status", { enum: ["pending", "valid", "invalid"] })
      .notNull()
      .default("pending"),
    lastCheckedAt: ts("last_checked_at"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [uniqueIndex("domains_domain_idx").on(t.domain)]
);

export const JOB_TYPES = ["deploy", "rollback"] as const;

/** A simple durable queue. The worker claims rows with an UPDATE. */
export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    type: text("type", { enum: JOB_TYPES }).notNull(),
    /** Deployment the job acts on. */
    deploymentId: text("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "cascade" }),
    state: text("state", {
      enum: ["queued", "running", "done", "failed"],
    })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lockedBy: text("locked_by"),
    lockedAt: ts("locked_at"),
    error: text("error"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("jobs_state_idx").on(t.state, t.createdAt)]
);

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id"),
  action: text("action").notNull(),
  target: text("target"),
  meta: text("meta"),
  at: ts("at").notNull(),
});

/** Server load, memory and disk, sampled by the worker so the dashboard can show trends. */
export const usageSamples = sqliteTable(
  "usage_samples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    serverId: text("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    at: ts("at").notNull(),
    cpuLoad: real("cpu_load"),
    cpus: integer("cpus"),
    memUsedMb: integer("mem_used_mb"),
    memTotalMb: integer("mem_total_mb"),
    diskUsedMb: integer("disk_used_mb"),
    diskTotalMb: integer("disk_total_mb"),
  },
  (t) => [index("usage_server_at_idx").on(t.serverId, t.at)]
);

/**
 * One row per page view reported by the analytics snippet. There is no IP, no
 * cookie and no user agent here. `visitor` is a hash that changes every day,
 * so it can count a day's visitors but cannot follow anyone across days.
 */
export const pageviews = sqliteTable(
  "pageviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    at: ts("at").notNull(),
    path: text("path").notNull(),
    referrer: text("referrer"),
    visitor: text("visitor").notNull(),
  },
  (t) => [index("pageviews_project_at_idx").on(t.projectId, t.at)]
);

/** Memory, CPU and restarts of one project's service, sampled by the worker. */
export const projectSamples = sqliteTable(
  "project_samples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    at: ts("at").notNull(),
    memMb: real("mem_mb"),
    /** Share of one CPU core used since the previous sample, in percent. */
    cpuPercent: real("cpu_percent"),
    /** Total CPU time the service has used, in nanoseconds. Used to work out cpuPercent. */
    cpuNs: real("cpu_ns"),
    restarts: integer("restarts"),
  },
  (t) => [index("project_samples_idx").on(t.projectId, t.at)]
);

export const ALERT_TYPES = ["down", "disk", "memory", "cpu", "deploy"] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/**
 * Alerts that fired, kept for 90 days. A row stays open (no `resolvedAt`)
 * while the problem lasts, so one crossing fires once. Deploy results are
 * single events and never resolve.
 */
export const alertEvents = sqliteTable(
  "alert_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: text("type", { enum: ALERT_TYPES }).notNull(),
    message: text("message").notNull(),
    firedAt: ts("fired_at").notNull(),
    resolvedAt: ts("resolved_at"),
    /** True when alerts were muted as it fired, so nothing was sent. */
    muted: integer("muted", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("alert_events_project_idx").on(t.projectId, t.firedAt)]
);
