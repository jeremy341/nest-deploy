import { describe, expect, it } from "vitest";
import { CLONE_FIELDS, pickCloneSettings } from "@/server/clone-settings";

const row = {
  id: "p1",
  userId: "u1",
  serverId: "s1",
  slug: "web",
  name: "Web",
  repoFullName: "me/web",
  repoUrl: "https://github.com/me/web",
  installationId: 42,
  productionBranch: "main",
  port: 3000,
  autoDeploy: true,
  hookHash: "hash",
  hookCreatedAt: new Date(),
  notifyUrlEnc: "sealed",
  notifyOn: "all",
  analyticsKey: "key",
  statusKey: "status",
  monitorState: "up",
  runtime: "node" as const,
  installCommand: "pnpm i",
  buildCommand: "pnpm build",
  startCommand: "pnpm start",
  outputDir: null,
  rootDir: "apps/web",
  healthPath: "/health",
};

describe("pickCloneSettings", () => {
  it("copies exactly the build and run settings", () => {
    expect(pickCloneSettings(row)).toEqual({
      runtime: "node",
      installCommand: "pnpm i",
      buildCommand: "pnpm build",
      startCommand: "pnpm start",
      outputDir: null,
      rootDir: "apps/web",
      healthPath: "/health",
    });
  });

  it("never includes secrets, hooks, notification URLs, the port or the repository", () => {
    const out = Object.keys(pickCloneSettings(row));
    for (const banned of [
      "port",
      "repoUrl",
      "repoFullName",
      "installationId",
      "hookHash",
      "hookCreatedAt",
      "notifyUrlEnc",
      "notifyOn",
      "analyticsKey",
      "statusKey",
      "productionBranch",
      "id",
      "slug",
      "name",
      "userId",
      "serverId",
      "autoDeploy",
    ]) {
      expect(out).not.toContain(banned);
    }
  });

  it("ignores unknown fields added to the source later", () => {
    const out = pickCloneSettings({ ...row, someNewSecret: "x" });
    expect(Object.keys(out).sort()).toEqual([...CLONE_FIELDS].sort());
  });
});
