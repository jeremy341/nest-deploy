import { describe, expect, it } from "vitest";
import { cleanRootDir, detectRoot, repoFromProject, summarizeRoot } from "@/server/root-detect";

describe("summarizeRoot", () => {
  it("reads package.json, lockfile and scripts", () => {
    const d = summarizeRoot(["package.json", "pnpm-lock.yaml", "yarn.lock"], {
      name: "web",
      scripts: { start: "next start", build: "next build" },
    });
    expect(d).toMatchObject({
      status: "ok",
      packageJson: true,
      lockfile: "pnpm",
      requirements: false,
      scripts: { start: true, build: true },
      packageName: "web",
    });
  });
  it("detects python projects and a missing start script", () => {
    const d = summarizeRoot(["requirements.txt", "app.py"], null);
    expect(d).toMatchObject({ packageJson: false, lockfile: null, requirements: true });
    expect(d.scripts).toEqual({ start: false, build: false });
    expect(summarizeRoot(["package.json", "package-lock.json"], { scripts: {} }).lockfile).toBe("npm");
    expect(summarizeRoot(["yarn.lock"], null).lockfile).toBe("yarn");
  });
});

describe("cleanRootDir and repoFromProject", () => {
  it("normalises folders and refuses escapes", () => {
    expect(cleanRootDir("./apps//web/")).toBe("apps/web");
    expect(cleanRootDir(".")).toBe("");
    expect(cleanRootDir("../x")).toBeNull();
    expect(cleanRootDir("/etc")).toBeNull();
    expect(cleanRootDir("a/b?c")).toBeNull();
  });
  it("finds owner/name", () => {
    expect(repoFromProject({ repoFullName: "me/web", repoUrl: "x" })).toBe("me/web");
    expect(repoFromProject({ repoFullName: null, repoUrl: "https://github.com/me/web.git" })).toBe(
      "me/web"
    );
    expect(repoFromProject({ repoFullName: null, repoUrl: "https://evil.com/me/web" })).toBeNull();
  });
});

describe("detectRoot", () => {
  const project = {
    repoFullName: "me/web",
    repoUrl: "https://github.com/me/web",
    installationId: null,
    productionBranch: "main",
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("lists the folder and reads package.json from GitHub", async () => {
    const urls: string[] = [];
    const f = (async (url: string) => {
      urls.push(url);
      if (url.includes("apps/web/package.json")) {
        return new Response(JSON.stringify({ scripts: { start: "node ." } }));
      }
      return json([
        { name: "package.json", type: "file" },
        { name: "src", type: "dir" },
        { name: "yarn.lock", type: "file" },
      ]);
    }) as unknown as typeof fetch;
    const d = await detectRoot(project, "apps/web", f);
    expect(d).toMatchObject({ status: "ok", packageJson: true, lockfile: "yarn", scripts: { start: true } });
    expect(urls[0]).toBe("https://api.github.com/repos/me/web/contents/apps/web?ref=main");
  });

  it("reports a missing folder and unreachable GitHub without throwing", async () => {
    const notFound = (async () => json({}, 404)) as unknown as typeof fetch;
    expect((await detectRoot(project, "nope", notFound)).status).toBe("missing");
    const offline = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect((await detectRoot(project, "nope", offline)).status).toBe("unavailable");
  });
});
