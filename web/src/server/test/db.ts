import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resetConfigForTests } from "@/server/config";
import { closeDbForTests, getDb } from "@/server/db";

/** Point the app at a fresh SQLite file for the current test file. */
export async function useFreshDb() {
  const dir = mkdtempSync(path.join(tmpdir(), "nd-db-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "test.db").replace(/\\/g, "/")}`;
  resetConfigForTests();
  await closeDbForTests();
  const db = await getDb();
  return {
    db,
    cleanup: async () => {
      await closeDbForTests();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows keeps the SQLite file locked for a moment; the OS temp
        // folder is cleaned up eventually, so this is best effort.
      }
    },
  };
}
