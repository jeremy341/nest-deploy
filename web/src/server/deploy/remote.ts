import { shellQuote } from "@/server/ssh/connection";
import {
  RELEASE_ID,
  currentLink,
  incomingArchive,
  projectDir,
  releaseDir,
  sharedDir,
} from "@/server/deploy/layout";

/**
 * Shell scripts that run on the Nest container (fed to `bash -s`). Every
 * interpolated value goes through shellQuote, and ids and slugs are validated
 * before they get here, so nothing user-supplied is ever left unquoted.
 */

const HEAD = "set -euo pipefail\n";

export function prepareDirs(home: string, slug: string) {
  const p = projectDir(home, slug);
  return (
    HEAD +
    `mkdir -p ${shellQuote(`${p}/incoming`)} ${shellQuote(`${p}/releases`)} ${shellQuote(sharedDir(home, slug))}\n`
  );
}

/** Verify the upload, unpack it, and install production dependencies. */
export function unpackRelease(args: {
  home: string;
  slug: string;
  releaseId: string;
  sha256: string;
  remoteInstall: string | null;
}) {
  const archive = incomingArchive(args.home, args.slug, args.releaseId);
  const dir = releaseDir(args.home, args.slug, args.releaseId);
  return (
    HEAD +
    `archive=${shellQuote(archive)}\ndir=${shellQuote(dir)}\n` +
    `if command -v sha256sum >/dev/null 2>&1; then\n` +
    `  actual=$(sha256sum "$archive" | cut -d' ' -f1)\n` +
    `  if [ "$actual" != ${shellQuote(args.sha256)} ]; then echo "Upload is corrupted: checksum mismatch" >&2; exit 20; fi\n` +
    `  echo "Checksum verified"\n` +
    `else echo "sha256sum not found, skipping verification"; fi\n` +
    `rm -rf "$dir"\nmkdir -p "$dir"\n` +
    `tar -xzf "$archive" -C "$dir"\nrm -f "$archive"\n` +
    `echo "Unpacked release"\n` +
    (args.remoteInstall
      ? `cd "$dir"\necho ${shellQuote(`Installing dependencies: ${args.remoteInstall}`)}\nbash -lc ${shellQuote(args.remoteInstall)} 2>&1\necho "Dependencies installed"\n`
      : "")
  );
}

/** systemd expands $VAR and %specifiers in ExecStart; double them so bash sees them. */
export function systemdEscape(value: string) {
  return value.replace(/\$/g, "$$$$").replace(/%/g, "%%");
}

export function unitFile(args: {
  slug: string;
  description: string;
  workDir: string;
  envFile: string;
  port: number;
  startCommand: string;
  /** Extra PATH entries, such as the Python venv. */
  pathPrefix?: string;
}) {
  const path = args.pathPrefix
    ? `Environment=PATH=${args.pathPrefix}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n`
    : "";
  return (
    `[Unit]\nDescription=${args.description.replace(/[\r\n]/g, " ")}\nAfter=network.target\n\n` +
    `[Service]\nType=simple\nWorkingDirectory=${args.workDir}\n` +
    `EnvironmentFile=${args.envFile}\n` +
    `Environment=PORT=${args.port}\nEnvironment=HOST=0.0.0.0\nEnvironment=NODE_ENV=production\n` +
    path +
    // login shell so tools installed with nvm and friends are on PATH
    `ExecStart=/bin/bash -lc ${JSON.stringify(systemdEscape(`exec ${args.startCommand}`))}\n` +
    `Restart=always\nRestartSec=3\n\n` +
    `[Install]\nWantedBy=multi-user.target\n`
  );
}

export function installUnit(unitDir: string, unit: string) {
  return (
    HEAD +
    `[ -f ${shellQuote(`${unitDir}/${unit}`)} ]\n` +
    `systemctl daemon-reload\nsystemctl enable ${shellQuote(unit)} >/dev/null 2>&1 || true\n`
  );
}

/** Point `current` at a release (production) and restart the service. */
export function activateProduction(args: {
  home: string;
  slug: string;
  releaseId: string;
  unit: string;
}) {
  const link = currentLink(args.home, args.slug);
  const target = releaseDir(args.home, args.slug, args.releaseId);
  return (
    HEAD +
    `[ -d ${shellQuote(target)} ]\n` +
    `ln -sfn ${shellQuote(target)} ${shellQuote(link + ".new")}\n` +
    `mv -Tf ${shellQuote(link + ".new")} ${shellQuote(link)}\n` +
    `systemctl restart ${shellQuote(args.unit)}\n` +
    `echo "Switched to release ${args.releaseId.slice(0, 8)} and restarted"\n`
  );
}

export function startUnit(unit: string) {
  return HEAD + `systemctl restart ${shellQuote(unit)}\necho "Started ${unit}"\n`;
}

/** Wait until the app answers on its port. Exit 0 healthy, 1 timed out, 2 crashed. */
export function healthCheck(args: {
  unit: string;
  port: number;
  path: string;
  timeoutSeconds: number;
}) {
  const path = args.path.startsWith("/") ? args.path : `/${args.path}`;
  return (
    `unit=${shellQuote(args.unit)}\nport=${Number(args.port)}\npath=${shellQuote(path)}\n` +
    `deadline=$((SECONDS + ${Number(args.timeoutSeconds)}))\n` +
    `while [ $SECONDS -lt $deadline ]; do\n` +
    `  state=$(systemctl is-active "$unit" 2>/dev/null || true)\n` +
    `  if [ "$state" = "failed" ]; then echo "Service crashed on start"; exit 2; fi\n` +
    `  if command -v curl >/dev/null 2>&1; then\n` +
    `    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$port$path" || true)\n` +
    `    case "$code" in [234]??) echo "Healthy: HTTP $code on port $port"; exit 0;; esac\n` +
    `  elif (exec 3<>/dev/tcp/127.0.0.1/$port) 2>/dev/null; then echo "Healthy: port $port is accepting connections"; exit 0; fi\n` +
    `  sleep 1\n` +
    `done\n` +
    `echo "No healthy response on port $port after ${Number(args.timeoutSeconds)}s"; exit 1\n`
  );
}

export function journalTail(unit: string, lines = 40) {
  return (
    `journalctl -u ${shellQuote(unit)} -n ${Number(lines)} --no-pager -o short-iso 2>&1 || true\n`
  );
}

/** Delete release folders that are not in the keep list. */
export function pruneReleases(home: string, slug: string, keep: string[]) {
  const dir = `${projectDir(home, slug)}/releases`;
  const safeKeep = keep.filter((k) => RELEASE_ID.test(k));
  return (
    HEAD +
    `cd ${shellQuote(dir)} 2>/dev/null || exit 0\n` +
    `keep=" ${safeKeep.join(" ")} "\n` +
    `for d in */; do\n` +
    `  d=\${d%/}\n` +
    `  [ -d "$d" ] || continue\n` +
    `  if [[ "$d" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] && [[ "$keep" != *" $d "* ]]; then\n` +
    `    rm -rf -- "$d"; echo "Removed old release \${d:0:8}"\n` +
    `  fi\n` +
    `done\n` +
    `rm -f ${shellQuote(projectDir(home, slug))}/incoming/*.tar.gz 2>/dev/null || true\n`
  );
}

/** Stop and remove a preview service and its release folder. */
export function removePreview(args: {
  home: string;
  slug: string;
  releaseId: string;
  unit: string;
  unitDir: string;
}) {
  return (
    `systemctl stop ${shellQuote(args.unit)} >/dev/null 2>&1 || true\n` +
    `systemctl disable ${shellQuote(args.unit)} >/dev/null 2>&1 || true\n` +
    `rm -f ${shellQuote(`${args.unitDir}/${args.unit}`)}\n` +
    `systemctl daemon-reload >/dev/null 2>&1 || true\n` +
    `[[ ${shellQuote(args.releaseId)} =~ ^[0-9a-f-]{36}$ ]] && rm -rf ${shellQuote(releaseDir(args.home, args.slug, args.releaseId))}\n` +
    `true\n`
  );
}

/** Remove a whole project from the server: service, releases, data. */
export function removeProject(args: {
  home: string;
  slug: string;
  unit: string;
  unitDir: string;
  deleteData: boolean;
}) {
  const p = projectDir(args.home, args.slug);
  return (
    `systemctl stop ${shellQuote(args.unit)} >/dev/null 2>&1 || true\n` +
    `systemctl disable ${shellQuote(args.unit)} >/dev/null 2>&1 || true\n` +
    `rm -f ${shellQuote(`${args.unitDir}/${args.unit}`)}\n` +
    `systemctl daemon-reload >/dev/null 2>&1 || true\n` +
    (args.deleteData
      ? `rm -rf ${shellQuote(p)}\n`
      : `rm -rf ${shellQuote(`${p}/releases`)} ${shellQuote(`${p}/incoming`)} ${shellQuote(`${p}/current`)}\n`) +
    `true\n`
  );
}

export function runtimeLogs(unit: string, lines: number) {
  return journalTail(unit, Math.max(1, Math.min(lines, 1000)));
}

/**
 * Print the state of a service as ND_KEY=value lines: what systemd says about
 * it, the machine's uptime, and one real request to the app's health path.
 * Nothing here changes anything, and every step tolerates failure so a stopped
 * or missing service still produces a readable answer.
 */
export function serviceStatus(args: { unit: string; port: number; path: string }) {
  const path = args.path.startsWith("/") ? args.path : `/${args.path}`;
  return (
    `unit=${shellQuote(args.unit)}\nport=${Number(args.port)}\npath=${shellQuote(path)}\n` +
    `echo "ND_ACTIVE=$(systemctl is-active "$unit" 2>/dev/null || true)"\n` +
    `systemctl show "$unit" -p LoadState -p ActiveState -p SubState -p MainPID -p NRestarts ` +
    `-p MemoryCurrent -p ActiveEnterTimestampMonotonic 2>/dev/null | sed 's/^/ND_/' || true\n` +
    `echo "ND_UPTIME=$(cut -d' ' -f1 /proc/uptime 2>/dev/null || true)"\n` +
    `if command -v curl >/dev/null 2>&1; then\n` +
    `  echo "ND_HTTP=$(curl -s -o /dev/null -w '%{http_code} %{time_total}' --max-time 3 "http://127.0.0.1:$port$path" || true)"\n` +
    `fi\n` +
    `true\n`
  );
}
