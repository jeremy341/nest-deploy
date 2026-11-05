import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LABELS, describeAction } from "./audit";

const SERVER_DIR = __dirname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}

/** Split the text after an opening paren into top-level arguments. */
function splitArgs(src: string, start: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = "";
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      cur += ch;
      if (ch === "\\") cur += src[++i] ?? "";
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      cur += ch;
    } else if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      cur += ch;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) {
        args.push(cur);
        return args;
      }
      depth--;
      cur += ch;
    } else if (ch === "," && depth === 0) {
      args.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  return args;
}

const LITERAL = /["']([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)["']/g;

/** Every action name the server writes, from `audit(...)` calls and direct audit_log inserts. */
function writtenActions(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of sourceFiles(SERVER_DIR)) {
    const src = readFileSync(file, "utf8");
    const name = file.slice(SERVER_DIR.length + 1);

    for (const m of src.matchAll(/\baudit\(/g)) {
      const second = splitArgs(src, m.index + m[0].length)[1] ?? "";
      for (const lit of second.matchAll(LITERAL)) found.set(lit[1], name);
    }

    if (src.includes("insert(schema.auditLog)")) {
      for (const m of src.matchAll(/\baction:\s*["']([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)["']/g)) {
        found.set(m[1], name);
      }
    }
  }
  return found;
}

describe("audit labels", () => {
  const actions = writtenActions();

  it("finds the actions the server writes", () => {
    expect(actions.size).toBeGreaterThan(20);
    expect(actions.has("deploy.preview_delete")).toBe(true);
    expect(actions.has("hook.trigger")).toBe(true);
    expect(actions.has("monitor.down")).toBe(true);
  });

  it("has a friendly label for every action the server writes", () => {
    const missing = [...actions].filter(([action]) => !(action in LABELS)).map(([a, file]) => `${a} (${file})`);
    expect(missing).toEqual([]);
  });

  it("never shows a raw action name", () => {
    for (const action of actions.keys()) {
      expect(describeAction(action)).not.toBe(action);
    }
  });

  it("labels have no dashes used as punctuation", () => {
    for (const label of Object.values(LABELS)) {
      expect(label).not.toMatch(/[–—]/);
    }
  });
});
