import { describe, expect, it } from "vitest";
import { commitUrl } from "./github";

const FULL = "e90a1c3f1d0b4a7c8d9e2f3a4b5c6d7e8f901234";

describe("commitUrl", () => {
  it("builds the commit URL from a repo and a full SHA", () => {
    expect(commitUrl("sam-r/recipe-api", FULL)).toBe(`https://github.com/sam-r/recipe-api/commit/${FULL}`);
  });

  it("accepts short SHAs from 7 characters", () => {
    expect(commitUrl("sam-r/recipe-api", "e90a1c3")).toBe("https://github.com/sam-r/recipe-api/commit/e90a1c3");
    expect(commitUrl("sam-r/recipe-api", "e90a1c")).toBeNull();
  });

  it("lowercases the SHA", () => {
    expect(commitUrl("a/b", "E90A1C3")).toBe("https://github.com/a/b/commit/e90a1c3");
  });

  it("allows dots, dashes and underscores in the repo name", () => {
    expect(commitUrl("sam-r/my.site_v2-x", "e90a1c3")).not.toBeNull();
  });

  it("returns null without a repo or a SHA", () => {
    expect(commitUrl(null, FULL)).toBeNull();
    expect(commitUrl(undefined, FULL)).toBeNull();
    expect(commitUrl("", FULL)).toBeNull();
    expect(commitUrl("sam-r/recipe-api", null)).toBeNull();
    expect(commitUrl("sam-r/recipe-api", "")).toBeNull();
  });

  it("returns null for a repo that is not owner/name", () => {
    expect(commitUrl("recipe-api", FULL)).toBeNull();
    expect(commitUrl("a/b/c", FULL)).toBeNull();
    expect(commitUrl("https://github.com/a/b", FULL)).toBeNull();
    expect(commitUrl("a/b?x=1", FULL)).toBeNull();
    expect(commitUrl("a/..", FULL)).toBeNull();
    expect(commitUrl("-a/b", FULL)).toBeNull();
  });

  it("returns null for SHAs that are not 7 to 40 hex characters", () => {
    expect(commitUrl("a/b", "zzzzzzz")).toBeNull();
    expect(commitUrl("a/b", `${FULL}0`)).toBeNull();
    expect(commitUrl("a/b", "e90a1c3/../x")).toBeNull();
  });
});
