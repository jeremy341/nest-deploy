import { describe, expect, it } from "vitest";
import { projectDir } from "@/server/deploy/layout";
import { assertShellDir, startupCommand } from "@/server/ssh/shell";

describe("assertShellDir", () => {
  it("accepts a project folder built the way deploy/layout.ts builds it", () => {
    const dir = projectDir("/home/sam-r", "recipe-api");
    expect(assertShellDir(dir)).toBe(dir);
  });

  it("rejects anything that is not <home>/.nest-deploy/<slug>", () => {
    for (const bad of [
      "",
      "relative/.nest-deploy/app",
      "/home/sam/.nest-deploy/..",
      "/home/sam/.nest-deploy/../../etc",
      "/home/sam/../root/.nest-deploy/app",
      "/home/sam/.nest-deploy/App",
      "/home/sam/.nest-deploy/-bad",
      "/home/sam/other/app",
      "/home/sam/.nest-deploy/app/releases",
      "/home/sam//.nest-deploy/app",
      "/home/sam/.nest-deploy/./app",
      "/home/sam/.nest-deploy/app'; rm -rf /; '",
      "/home/sam/.nest-deploy/app$(id)",
      "/home/sam/.nest-deploy/app\nid",
      "/home/sam/.nest deploy/app",
    ]) {
      expect(() => assertShellDir(bad), JSON.stringify(bad)).toThrow();
    }
  });
});

describe("startupCommand", () => {
  it("is one line that changes into the folder and stays out of shell history", () => {
    const cmd = startupCommand("/home/sam-r/.nest-deploy/recipe-api");
    expect(cmd.startsWith(" ")).toBe(true);
    expect(cmd.endsWith("\n")).toBe(true);
    expect(cmd.trimEnd().split("\n")).toHaveLength(1);
    expect(cmd).toContain("cd -- '/home/sam-r/.nest-deploy/recipe-api'");
  });

  it("refuses a folder that fails validation", () => {
    expect(() => startupCommand("/etc")).toThrow();
  });
});
