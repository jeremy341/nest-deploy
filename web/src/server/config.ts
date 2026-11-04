import { z } from "zod";

/**
 * Environment configuration. Read lazily so `next build` works without
 * secrets; the first request (or the worker start) validates everything.
 */
const bool = z
  .enum(["0", "1", "true", "false"])
  .default("0")
  .transform((v) => v === "1" || v === "true");

const schema = z.object({
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** Master secret for encrypting SSH keys and env vars. 32+ characters. */
  APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
  DATABASE_URL: z.string().default("file:./data/nest-deploy.db"),

  HACKCLUB_CLIENT_ID: z.string().optional(),
  HACKCLUB_CLIENT_SECRET: z.string().optional(),
  /** Local development only: sign in as a fake user without Hack Club Auth. */
  DEV_LOGIN: bool,

  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_APP_CLIENT_ID: z.string().optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().optional(),
  /** PEM text. "\n" escape sequences are accepted. */
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),

  /** docker isolates builds; local runs them on this machine (dev only). */
  BUILD_RUNNER: z.enum(["docker", "local"]).default("docker"),
  BUILD_IMAGE_NODE: z.string().default("node:22-bookworm"),
  BUILD_IMAGE_PYTHON: z.string().default("python:3.12-bookworm"),
  BUILD_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(900),
  DEPLOY_WORK_DIR: z.string().default("./data/work"),
  /** Where systemd units are written on the container. Only change for testing. */
  UNIT_DIR: z.string().default("/etc/systemd/system"),
  /** Where Nest's SSH bastion lives. */
  NEST_HOST: z.string().default("hackclub.app"),
  NEST_PORT: z.coerce.number().int().positive().default(22),
});

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

export function config(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`
    );
    throw new Error(
      `Invalid environment configuration:\n${lines.join("\n")}\n` +
        "Run `pnpm setup` to create .env.local, or see .env.example."
    );
  }
  cached = parsed.data;
  if (cached.GITHUB_APP_PRIVATE_KEY) {
    cached.GITHUB_APP_PRIVATE_KEY = cached.GITHUB_APP_PRIVATE_KEY.replace(
      /\\n/g,
      "\n"
    );
  }
  return cached;
}

/** For tests: drop the cached config so a changed process.env is re-read. */
export function resetConfigForTests() {
  cached = undefined;
}

export function hackClubConfigured() {
  const c = config();
  return Boolean(c.HACKCLUB_CLIENT_ID && c.HACKCLUB_CLIENT_SECRET);
}

export function githubConfigured() {
  const c = config();
  return Boolean(
    c.GITHUB_APP_ID &&
      c.GITHUB_APP_PRIVATE_KEY &&
      c.GITHUB_APP_CLIENT_ID &&
      c.GITHUB_APP_CLIENT_SECRET &&
      c.GITHUB_WEBHOOK_SECRET
  );
}
