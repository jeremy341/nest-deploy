import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { config } from "@/server/config";
import * as schema from "@/server/db/schema";

export type Db = LibSQLDatabase<typeof schema>;

type Holder = { client: Client; db: Db; ready: Promise<void> };

// Next.js re-evaluates modules in dev, so keep one connection on globalThis.
const g = globalThis as unknown as { __nestDeployDb?: Holder };

function open(): Holder {
  const url = config().DATABASE_URL;
  if (url.startsWith("file:") && !url.startsWith("file::memory:")) {
    const file = url.slice("file:".length);
    mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  }
  const client = createClient({ url });
  const db = drizzle(client, { schema });
  const ready = (async () => {
    await client.execute("PRAGMA foreign_keys = ON");
    await client.execute("PRAGMA busy_timeout = 5000");
    await migrate(db, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
  })();
  return { client, db, ready };
}

/** The database, with migrations applied. Await it before the first query. */
export async function getDb(): Promise<Db> {
  g.__nestDeployDb ??= open();
  await g.__nestDeployDb.ready;
  return g.__nestDeployDb.db;
}

/** For tests: close and forget the connection. */
export async function closeDbForTests() {
  if (g.__nestDeployDb) {
    g.__nestDeployDb.client.close();
    g.__nestDeployDb = undefined;
  }
}

export { schema };
