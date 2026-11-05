import { describe, expect, it } from "vitest";
import {
  ACTIVE_TOKEN_LIMIT,
  DEFAULT_EXPIRY_DAYS,
  EXPIRY_OPTIONS,
  TOKEN_CANNOT,
  DEPLOY_DROP_NOTE,
  activeCount,
  buildTokenPatch,
  canEdit,
  canRevoke,
  dropsDeployAccess,
  curlExample,
  expiryLabel,
  formatDate,
  lastUsedLabel,
  limitNote,
  mcpConfigSnippet,
  mcpUrl,
  openApiUrl,
  tokenStatus,
} from "@/lib/developer";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 5, 12, 0, 0);
const at = (days: number) => new Date(NOW + days * DAY).toISOString();
const tok = (days: number, revoked = false) => ({
  expiresAt: at(days),
  revokedAt: revoked ? at(-1) : null,
});

describe("tokenStatus", () => {
  it("is active until it expires, then expired", () => {
    expect(tokenStatus(tok(10), NOW)).toBe("active");
    expect(tokenStatus(tok(0.001), NOW)).toBe("active");
    expect(tokenStatus(tok(0), NOW)).toBe("expired");
    expect(tokenStatus(tok(-3), NOW)).toBe("expired");
  });

  it("is revoked whether or not it has expired", () => {
    expect(tokenStatus(tok(10, true), NOW)).toBe("revoked");
    expect(tokenStatus(tok(-10, true), NOW)).toBe("revoked");
  });

  it("only an active token can be revoked", () => {
    expect(canRevoke(tok(10), NOW)).toBe(true);
    expect(canRevoke(tok(-1), NOW)).toBe(false);
    expect(canRevoke(tok(10, true), NOW)).toBe(false);
  });
});

describe("editing", () => {
  it("only an active token can be edited", () => {
    expect(canEdit(tok(10), NOW)).toBe(true);
    expect(canEdit(tok(-1), NOW)).toBe(false);
    expect(canEdit(tok(10, true), NOW)).toBe(false);
  });

  const token = { name: "CI bot", scopes: ["projects:read", "deployments:write"] };

  it("sends nothing when nothing changed, and ignores scope order and name padding", () => {
    expect(buildTokenPatch(token, { name: " CI bot ", scopes: ["deployments:write", "projects:read"], expiry: "keep" })).toEqual({});
  });

  it("sends only the fields that changed", () => {
    expect(buildTokenPatch(token, { name: "Renamed", scopes: token.scopes, expiry: "keep" })).toEqual({ name: "Renamed" });
    expect(buildTokenPatch(token, { name: "CI bot", scopes: ["projects:read"], expiry: "keep" })).toEqual({
      scopes: ["projects:read"],
    });
    expect(buildTokenPatch(token, { name: "CI bot", scopes: token.scopes, expiry: 365 })).toEqual({ expiresInDays: 365 });
  });

  it("warns only when the deploy permission is removed", () => {
    expect(dropsDeployAccess(token.scopes, ["projects:read"])).toBe(true);
    expect(dropsDeployAccess(token.scopes, token.scopes)).toBe(false);
    expect(dropsDeployAccess(["projects:read"], ["projects:read", "deployments:write"])).toBe(false);
    expect(dropsDeployAccess(["projects:read"], ["projects:read"])).toBe(false);
  });
});

describe("expiryLabel", () => {
  it("counts days ahead", () => {
    expect(expiryLabel(tok(90), NOW)).toBe("In 90 days");
    expect(expiryLabel(tok(7), NOW)).toBe("In 7 days");
    expect(expiryLabel(tok(2), NOW)).toBe("Tomorrow");
    expect(expiryLabel(tok(0.5), NOW)).toBe("Today");
  });

  it("counts days behind", () => {
    expect(expiryLabel(tok(-0.2), NOW)).toBe("Today");
    expect(expiryLabel(tok(-1), NOW)).toBe("Yesterday");
    expect(expiryLabel(tok(-3), NOW)).toBe("3 days ago");
  });

  it("shows the date a revoked token was due", () => {
    expect(expiryLabel(tok(30, true), NOW)).toBe(formatDate(at(30)));
  });
});

describe("dates", () => {
  it("formats in UTC", () => {
    expect(formatDate("2026-11-05T23:59:59.000Z")).toBe("5 Nov 2026");
    expect(formatDate("2027-01-01T00:00:00.000Z")).toBe("1 Jan 2027");
    expect(formatDate("not a date")).toBe("Unknown");
  });

  it("says Never until a token has been used", () => {
    expect(lastUsedLabel(null, NOW)).toBe("Never");
    expect(lastUsedLabel(new Date(NOW - 2 * 3_600_000).toISOString(), NOW)).toBe("2h ago");
  });
});

describe("limits", () => {
  it("counts only active tokens", () => {
    expect(activeCount([tok(5), tok(-1), tok(5, true), tok(40)], NOW)).toBe(2);
  });

  it("words the note by how many are used", () => {
    expect(limitNote(3)).toContain(`3 of ${ACTIVE_TOKEN_LIMIT}`);
    expect(limitNote(ACTIVE_TOKEN_LIMIT)).toContain("Revoke one");
  });

  it("offers the four expiries and defaults to 90 days", () => {
    expect(EXPIRY_OPTIONS.map((o) => o.days)).toEqual([7, 30, 90, 365]);
    expect(DEFAULT_EXPIRY_DAYS).toBe(90);
  });
});

describe("snippets", () => {
  const origin = "https://nest.example.com/";

  it("builds the URLs without a double slash", () => {
    expect(openApiUrl(origin)).toBe("https://nest.example.com/api/v1/openapi.json");
    expect(mcpUrl(origin)).toBe("https://nest.example.com/api/mcp");
  });

  it("shows a curl request with a placeholder token, never a real one", () => {
    const curl = curlExample(origin);
    expect(curl).toContain('Authorization: Bearer ndp_..."');
    expect(curl).toContain("https://nest.example.com/api/v1/");
    expect(curl).not.toMatch(/ndp_[A-Za-z0-9]{6,}/);
  });

  it("builds an MCP config that parses and points at the agent endpoint", () => {
    const text = mcpConfigSnippet(origin);
    const json = JSON.parse(text) as {
      mcpServers: Record<string, { type: string; url: string; headers: Record<string, string> }>;
    };
    const server = json.mcpServers["nest-deploy"];
    expect(server.type).toBe("http");
    expect(server.url).toBe("https://nest.example.com/api/mcp");
    expect(server.headers.Authorization).toBe("Bearer ndp_...");
    expect(text).not.toMatch(/ndp_[A-Za-z0-9]{6,}/);
  });
});

describe("copy", () => {
  it("lists what a token cannot do", () => {
    expect(TOKEN_CANNOT).toHaveLength(5);
  });

  it("uses no em or en dashes in any visible copy", () => {
    const all = [...TOKEN_CANNOT, DEPLOY_DROP_NOTE, limitNote(1), limitNote(ACTIVE_TOKEN_LIMIT), ...EXPIRY_OPTIONS.map((o) => o.label)];
    for (const line of all) expect(line).not.toMatch(/[–—]/);
  });
});
