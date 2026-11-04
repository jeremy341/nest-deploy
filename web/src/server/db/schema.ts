import {
  index,
  integer,
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
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("projects_user_slug_idx").on(t.userId, t.slug),
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
      enum: ["manual", "webhook", "redeploy", "rollback"],
    }).notNull(),
    branch: text("branch").notNull(),
    commitSha: text("commit_sha"),
    commitMessage: text("commit_message"),
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
