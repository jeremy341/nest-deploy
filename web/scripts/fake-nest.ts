// A stand-in for a Nest container, for trying Nest Deploy without a Nest account.
//
//   pnpm fake-nest
//
// It accepts the public key of every server saved in the local database, and
// runs the commands Nest Deploy sends in a scratch directory on Linux (WSL on
// Windows). A fake systemd starts your app as a background process.
//
// Point Nest Deploy at it in .env.local:
//   NEST_HOST=127.0.0.1
//   NEST_PORT=2222
//   UNIT_DIR=<home>/.nd-fake-nest/units   (printed below)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { utils } from "ssh2";
import { getDb, schema } from "../src/server/db";
import { installFakeSystemd } from "../src/server/test/fake-nest";
import { startMockSsh } from "../src/server/test/mock-ssh";

// Keep the scratch home under the real home directory: WSL clears /tmp when its
// VM shuts down, and its VM stops when no session is open.
const DISTRO = process.env.TEST_WSL_DISTRO ?? "Ubuntu";
const onWindows = process.platform === "win32";
const realHome = onWindows
  ? spawnSync("wsl.exe", ["-d", DISTRO, "-e", "bash", "-c", "echo $HOME"]).stdout.toString().trim()
  : os.homedir();
const HOME = `${realHome}/.nd-fake-nest`;
const PORT = Number(process.env.FAKE_NEST_PORT ?? 2222);
const keyFile = path.resolve("data/fake-nest-host-key");

mkdirSync(path.dirname(keyFile), { recursive: true });
if (!existsSync(keyFile)) {
  writeFileSync(keyFile, utils.generateKeyPairSync("ed25519").private, { mode: 0o600 });
}

async function main() {
const mock = await startMockSsh({
  home: HOME,
  port: PORT,
  hostKey: readFileSync(keyFile, "utf8"),
  authorizedKeys: async () => {
    const db = await getDb();
    return (await db.select({ k: schema.servers.publicKey }).from(schema.servers)).map((r) => r.k);
  },
});
installFakeSystemd(mock);

console.log(`Fake Nest listening on 127.0.0.1:${mock.port}`);
console.log(`Host key ${mock.hostKeyFingerprint}`);
console.log(`Scratch home ${HOME} (inside WSL on Windows)`);
console.log(`Set UNIT_DIR=${HOME}/units in .env.local`);

if (onWindows) {
  // An open session keeps the WSL VM, and the apps running in it, alive.
  spawn("wsl.exe", ["-d", DISTRO, "-e", "sleep", "infinity"], { stdio: "ignore" }).unref();
}
console.log("Press Ctrl+C to stop.");

process.on("SIGINT", async () => {
  await mock.stop();
  process.exit(0);
});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
