import { describe, expect, it } from "vitest";
import { LABELS } from "./audit";
import {
  KIND_OPTIONS,
  KIND_PREFIXES,
  cleanMeta,
  describeFilters,
  formatDuration,
  formatMeta,
  groupByDay,
  isFiltered,
  isSecretKey,
  isSecretValue,
  kindOf,
  makeCursor,
  matchesSearch,
  parseCursor,
  parseFilters,
  rangeStart,
  serializeFilters,
  tokenIdOf,
  type ActivityItem,
} from "./activity";

function item(over: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: 1,
    action: "terminal.close",
    kind: "terminal",
    label: "Closed a terminal on",
    target: { name: "billing-api", href: "/projects/billing-api" },
    suffix: "after 14 minutes, reason: idle",
    fields: [{ label: "Reason", value: "Idle" }],
    token: null,
    tone: "neutral",
    at: "2026-11-05T10:00:00.000Z",
    ...over,
  };
}

describe("kinds", () => {
  it("maps every action to its kind", () => {
    expect(kindOf("project.create")).toBe("projects");
    expect(kindOf("env.set")).toBe("projects");
    expect(kindOf("analytics.enable")).toBe("projects");
    expect(kindOf("status.disable")).toBe("projects");
    expect(kindOf("deploy.rollback")).toBe("deployments");
    expect(kindOf("hook.trigger")).toBe("deployments");
    expect(kindOf("domain.add")).toBe("domains");
    expect(kindOf("server.rotate_key")).toBe("servers");
    expect(kindOf("container.orphan_remove")).toBe("servers");
    expect(kindOf("token.create")).toBe("access");
    expect(kindOf("account.session_revoke")).toBe("access");
    expect(kindOf("monitor.down")).toBe("monitoring");
    expect(kindOf("terminal.open")).toBe("terminal");
    expect(kindOf("file.write")).toBe("terminal");
    expect(kindOf("something.new")).toBe("other");
  });

  it("gives every labelled action a real kind, so no entry is missing from the filters", () => {
    const other = Object.keys(LABELS).filter((a) => kindOf(a) === "other");
    expect(other).toEqual([]);
  });

  it("offers All plus one option per kind with prefixes", () => {
    expect(KIND_OPTIONS.map((o) => o.value)).toEqual(["all", ...Object.keys(KIND_PREFIXES)]);
  });
});

describe("date ranges", () => {
  const now = new Date("2026-11-05T12:00:00.000Z");
  it("starts 24 hours, 7 days or 30 days back", () => {
    expect(rangeStart("24h", now)?.toISOString()).toBe("2026-11-04T12:00:00.000Z");
    expect(rangeStart("7d", now)?.toISOString()).toBe("2026-10-29T12:00:00.000Z");
    expect(rangeStart("30d", now)?.toISOString()).toBe("2026-10-06T12:00:00.000Z");
  });
  it("has no start for all time", () => {
    expect(rangeStart("all", now)).toBeNull();
  });
});

describe("filters in the URL", () => {
  it("reads the three parameters", () => {
    expect(parseFilters({ kind: "domains", range: "7d", q: "  api   v2 " })).toEqual({
      kind: "domains",
      range: "7d",
      q: "api v2",
    });
    expect(parseFilters(new URLSearchParams("kind=access&range=24h&q=ci"))).toEqual({
      kind: "access",
      range: "24h",
      q: "ci",
    });
  });

  it("falls back to the defaults for anything unknown", () => {
    expect(parseFilters({ kind: "nope", range: "1y", q: undefined })).toEqual({ kind: "all", range: "all", q: "" });
    expect(parseFilters({ kind: ["servers", "x"] }).kind).toBe("servers");
  });

  it("caps the search text", () => {
    expect(parseFilters({ q: "x".repeat(500) }).q).toHaveLength(80);
  });

  it("writes only what differs from the default, and round-trips", () => {
    expect(serializeFilters({ kind: "all", range: "all", q: "" })).toBe("");
    const f = { kind: "monitoring" as const, range: "30d" as const, q: "api down" };
    expect(serializeFilters(f)).toBe("kind=monitoring&range=30d&q=api+down");
    expect(parseFilters(new URLSearchParams(serializeFilters(f)))).toEqual(f);
  });

  it("knows when a filter is on and describes it", () => {
    expect(isFiltered({ kind: "all", range: "all", q: "" })).toBe(false);
    expect(isFiltered({ kind: "all", range: "7d", q: "" })).toBe(true);
    expect(describeFilters({ kind: "projects", range: "7d", q: "api" })).toBe(
      "Projects, last 7 days, matching “api”"
    );
  });
});

describe("grouping by day", () => {
  const now = new Date("2026-11-05T00:00:30.000Z");

  it("labels Today, Yesterday, then dates", () => {
    const groups = groupByDay(
      [
        { at: "2026-11-05T00:00:10.000Z" },
        { at: "2026-11-04T09:00:00.000Z" },
        { at: "2026-11-02T09:00:00.000Z" },
      ],
      now
    );
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Mon, 2 Nov 2026"]);
    expect(groups.map((g) => g.items.length)).toEqual([1, 1, 1]);
  });

  it("splits entries a second apart on either side of midnight UTC", () => {
    const groups = groupByDay([{ at: "2026-11-05T00:00:01.000Z" }, { at: "2026-11-04T23:59:59.000Z" }], now);
    expect(groups.map((g) => [g.day, g.label])).toEqual([
      ["2026-11-05", "Today"],
      ["2026-11-04", "Yesterday"],
    ]);
  });

  it("keeps one day together and counts it", () => {
    const groups = groupByDay(
      [
        { at: "2026-11-04T23:00:00.000Z" },
        { at: "2026-11-04T12:00:00.000Z" },
        { at: "2026-11-04T00:00:00.000Z" },
      ],
      now
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(3);
  });

  it("measures Today in UTC, not local time", () => {
    // 23:30 UTC on the 4th is still the 4th, whatever the machine's zone is.
    const late = new Date("2026-11-04T23:30:00.000Z");
    expect(groupByDay([{ at: "2026-11-04T23:10:00.000Z" }], late)[0].label).toBe("Today");
  });

  it("returns nothing for nothing", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe("search", () => {
  it("matches the label, the target name and the detail text", () => {
    const e = item();
    expect(matchesSearch(e, "closed a terminal")).toBe(true);
    expect(matchesSearch(e, "BILLING")).toBe(true);
    expect(matchesSearch(e, "idle")).toBe(true);
    expect(matchesSearch(e, "14 minutes")).toBe(true);
    expect(matchesSearch(e, "deleted")).toBe(false);
  });

  it("needs every word, in any order", () => {
    const e = item();
    expect(matchesSearch(e, "idle billing")).toBe(true);
    expect(matchesSearch(e, "idle checkout")).toBe(false);
  });

  it("matches field values and the token name, and an empty query matches all", () => {
    const e = item({
      fields: [{ label: "Branch", value: "feature/login" }],
      token: { name: "ci-deploy" },
    });
    expect(matchesSearch(e, "feature/login")).toBe(true);
    expect(matchesSearch(e, "ci-deploy")).toBe(true);
    expect(matchesSearch(e, "   ")).toBe(true);
  });

  it("does not search field labels", () => {
    expect(matchesSearch(item({ fields: [{ label: "Branch", value: "main" }] }), "branch")).toBe(false);
  });
});

describe("durations", () => {
  it("reads naturally", () => {
    expect(formatDuration(1)).toBe("1 second");
    expect(formatDuration(45)).toBe("45 seconds");
    expect(formatDuration(840)).toBe("14 minutes");
    expect(formatDuration(60)).toBe("1 minute");
    expect(formatDuration(3600)).toBe("1 hour");
    expect(formatDuration(3900)).toBe("1 hour 5 minutes");
  });
});

describe("the meta formatter", () => {
  it("writes a terminal close as a sentence and as labelled fields", () => {
    const m = formatMeta("terminal.close", { project: "p1", reason: "idle", seconds: 840 });
    expect(m.suffix).toBe("after 14 minutes, reason: idle");
    expect(m.fields).toEqual([
      { label: "Reason", value: "Idle", mono: false },
      { label: "Duration", value: "14 minutes", mono: false },
    ]);
  });

  it("leaves out plumbing keys such as the project id", () => {
    const m = formatMeta("terminal.open", { project: "abc123" });
    expect(m.fields).toEqual([]);
    expect(m.suffix).toBeNull();
  });

  it("labels deploy, env and domain fields", () => {
    expect(formatMeta("deploy.redeploy", { branch: "main" }).fields).toEqual([
      { label: "Branch", value: "main", mono: false },
    ]);
    expect(formatMeta("deploy.redeploy", { branch: "main" }).suffix).toBe("from branch main");
    const env = formatMeta("env.set", { name: "DATABASE_URL", target: "production" });
    expect(env.fields.map((f) => [f.label, f.value])).toEqual([
      ["Variable", "DATABASE_URL"],
      ["Environment", "Production"],
    ]);
    expect(env.suffix).toBe(": DATABASE_URL (production)");
    const api = formatMeta("deploy.trigger", { branch: "main", env: "production", via: "api", token: "t1" });
    expect(api.fields.map((f) => [f.label, f.value])).toEqual([
      ["Branch", "main"],
      ["Environment", "Production"],
      ["Via", "Access token (API)"],
    ]);
  });

  it("describes edits and permissions in words", () => {
    expect(formatMeta("project.update", { fields: "productionBranch, buildCommand" }).suffix).toBe(
      ": production branch, build command"
    );
    expect(formatMeta("container.permissions", { changed: "Terminal, FileWrites" }).suffix).toBe(
      ": terminal, file writes"
    );
    const t = formatMeta("token.update", { fields: "name, expiry", name: "ci", expiresInDays: "30" });
    expect(t.fields.map((f) => [f.label, f.value])).toEqual([
      ["Changed", "name, expiry"],
      ["New name", "ci"],
      ["Expires in", "30 days"],
    ]);
  });

  it("keeps terminal and file entries to paths and reasons", () => {
    const rename = formatMeta("file.rename", { from: "/app/a.txt", to: "/app/b.txt" });
    expect(rename.suffix).toBe("from /app/a.txt to /app/b.txt");
    expect(rename.fields.map((f) => f.label)).toEqual(["From", "To"]);
    expect(formatMeta("file.write", { path: "/app/server.js" }).suffix).toBe(": /app/server.js");
  });

  it("maps every terminal close reason", () => {
    for (const reason of ["closed", "idle", "limit", "shell-exit", "connection-lost", "signed-out", "disabled", "error"]) {
      const m = formatMeta("terminal.close", { reason, seconds: 5 });
      expect(m.fields[0].value).not.toBe(reason);
      expect(m.suffix).toContain("reason:");
    }
  });

  it("ignores bad meta", () => {
    expect(formatMeta("project.restart", null).fields).toEqual([]);
    expect(formatMeta("project.restart", "text").fields).toEqual([]);
    expect(formatMeta("project.restart", ["a"]).fields).toEqual([]);
    expect(formatMeta("project.restart", { nested: { a: 1 } }).fields).toEqual([]);
  });

  it("reads the access token that made a change", () => {
    expect(tokenIdOf({ token: "tok_1", via: "api" })).toBe("tok_1");
    expect(tokenIdOf({ via: "api" })).toBeNull();
    expect(tokenIdOf(null)).toBeNull();
  });
});

describe("secrets never show", () => {
  it("drops secret-looking keys", () => {
    const keys = [
      "token", "apiToken", "accessToken", "secret", "clientSecret", "password", "passwd", "apiKey", "api_key", "key",
      "privateKey", "authorization", "authHeader", "cookie", "sessionId", "hash", "valueEnc", "notifyUrlEnc",
      "webhookUrl", "bearer", "signature", "credentials", "salt", "otp",
    ];
    for (const key of keys) expect(isSecretKey(key), key).toBe(true);
    const meta = Object.fromEntries(keys.map((k) => [k, "plain value"]));
    expect(cleanMeta(meta)).toEqual({});
    expect(formatMeta("project.update", meta).fields).toEqual([]);
  });

  it("keeps ordinary keys", () => {
    for (const key of ["branch", "name", "path", "from", "to", "reason", "seconds", "domain", "server", "monkey", "target"]) {
      expect(isSecretKey(key), key).toBe(false);
    }
  });

  it("drops secret-looking values under any key", () => {
    const secrets = [
      "nd_3f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c",
      "ghp_16C7e42F292c6912E7710c838347Ae178B4a",
      "github_pat_11ABCDEFG0abcdefghijkl",
      "sk-proj-AbCdEf0123456789",
      "xoxb-123456789012-abcdefghijkl",
      "AKIAIOSFODNN7EXAMPLE",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      "Bearer abcdef0123456789",
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "0123456789abcdef0123456789abcdef01234567",
      "aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE3fG",
      "https://user:hunter2@example.com/repo.git",
      "https://example.com/cb?token=abc123",
      "https://discord.com/api/webhooks/123/abc",
      "https://hooks.slack.com/services/T0/B0/xyz",
      "password=hunter2",
    ];
    for (const value of secrets) expect(isSecretValue(value), value).toBe(true);
    const meta = Object.fromEntries(secrets.map((s, i) => [`field${i}`, s]));
    expect(cleanMeta(meta)).toEqual({});
  });

  it("keeps values that are only long, such as paths, branches and names", () => {
    const fine = [
      "/home/user/projects/billing-api/src/components/index.tsx",
      "/var/www/app1/public_html/assets",
      "feature/improve-login-flow-for-mobile-users",
      "release-2026-11-05-hotfix-checkout",
      "DATABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY_PRODUCTION",
      "projects:read, deployments:write",
      "main",
      "3000",
    ];
    for (const value of fine) expect(isSecretValue(value), value).toBe(false);
  });

  it("never lets a secret reach a field, the sentence or the search text", () => {
    const secret = "nd_3f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c";
    const m = formatMeta("project.update", { fields: "branch", note: secret, token: secret, password: "p" });
    expect(JSON.stringify(m)).not.toContain(secret);
    expect(JSON.stringify(m)).not.toContain('"p"');
  });

  it("trims long values", () => {
    const long = formatMeta("monitor.down", { detail: "slow ".repeat(100) });
    expect(long.fields[0].value.length).toBeLessThanOrEqual(201);
  });
});

describe("cursors", () => {
  it("round-trips and refuses junk", () => {
    const c = makeCursor("2026-11-05T10:00:00.000Z", 42);
    const p = parseCursor(c);
    expect(p?.id).toBe(42);
    expect(p?.at.toISOString()).toBe("2026-11-05T10:00:00.000Z");
    expect(parseCursor("nope")).toBeNull();
    expect(parseCursor("1; drop table")).toBeNull();
    expect(parseCursor(null)).toBeNull();
  });
});
