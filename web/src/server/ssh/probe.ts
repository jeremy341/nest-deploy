import type { NestSession } from "@/server/ssh/connection";

export type NestProbe = {
  uid: number;
  os: string;
  arch: string;
  home: string;
  systemdState: string;
  has: Record<
    "systemctl" | "node" | "npm" | "python3" | "tar" | "curl" | "git" | "sha256sum",
    boolean
  >;
  nodeVersion: string | null;
  pythonVersion: string | null;
  cpus: number | null;
  memTotalMb: number | null;
  memUsedMb: number | null;
  diskTotalMb: number | null;
  diskUsedMb: number | null;
  load1: number | null;
};

const TOOLS = [
  "systemctl",
  "node",
  "npm",
  "python3",
  "tar",
  "curl",
  "git",
  "sha256sum",
] as const;

/** One round trip that reads everything the dashboard and deploys care about. */
export const PROBE_SCRIPT = `
set +e
echo "uid=$(id -u)"
echo "os=$( . /etc/os-release 2>/dev/null; echo "\${PRETTY_NAME:-unknown}" )"
echo "arch=$(uname -m)"
echo "home=$HOME"
for c in ${TOOLS.join(" ")}; do
  if command -v "$c" >/dev/null 2>&1; then echo "has_$c=1"; else echo "has_$c=0"; fi
done
echo "node_version=$(node -v 2>/dev/null)"
echo "python_version=$(python3 -V 2>&1 | head -n1)"
echo "cpus=$(nproc 2>/dev/null)"
awk '/^MemTotal:/ {t=$2} /^MemAvailable:/ {a=$2} END { if (t) { printf "mem_total_mb=%d\\nmem_used_mb=%d\\n", t/1024, (t-a)/1024 } }' /proc/meminfo 2>/dev/null
df -Pm "$HOME" 2>/dev/null | awk 'NR==2 { printf "disk_total_mb=%d\\ndisk_used_mb=%d\\n", $2, $3 }'
echo "load1=$(cut -d' ' -f1 /proc/loadavg 2>/dev/null)"
echo "systemd_state=$(systemctl is-system-running 2>/dev/null || echo unavailable)"
`;

export function parseProbe(output: string): NestProbe {
  const kv = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) kv.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  const num = (k: string) => {
    const v = kv.get(k);
    if (v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (k: string) => {
    const v = kv.get(k);
    return v ? v : null;
  };
  const has = Object.fromEntries(
    TOOLS.map((t) => [t, kv.get(`has_${t}`) === "1"])
  ) as NestProbe["has"];

  return {
    uid: num("uid") ?? -1,
    os: str("os") ?? "unknown",
    arch: str("arch") ?? "unknown",
    home: str("home") ?? "/root",
    systemdState: str("systemd_state") ?? "unavailable",
    has,
    nodeVersion: str("node_version"),
    pythonVersion: str("python_version"),
    cpus: num("cpus"),
    memTotalMb: num("mem_total_mb"),
    memUsedMb: num("mem_used_mb"),
    diskTotalMb: num("disk_total_mb"),
    diskUsedMb: num("disk_used_mb"),
    load1: num("load1"),
  };
}

export async function probeSession(session: NestSession): Promise<NestProbe> {
  const res = await session.script(PROBE_SCRIPT, { timeoutMs: 30_000 });
  return parseProbe(res.stdout);
}

export type ProbeIssue = { level: "error" | "warning"; message: string };

/**
 * What would stop deploys from working. Errors block deploying; warnings are
 * shown but do not.
 */
export function probeIssues(p: NestProbe): ProbeIssue[] {
  const issues: ProbeIssue[] = [];
  if (!p.has.systemctl || p.systemdState === "unavailable") {
    issues.push({
      level: "error",
      message:
        "systemd is not available in this container, so Nest Deploy cannot keep your apps running or restart them.",
    });
  }
  if (!p.has.tar) {
    issues.push({ level: "error", message: "tar is not installed." });
  }
  if (!p.has.sha256sum) {
    issues.push({
      level: "warning",
      message: "sha256sum is missing, so uploads cannot be verified.",
    });
  }
  if (!p.has.curl) {
    issues.push({
      level: "warning",
      message:
        "curl is missing. Health checks fall back to a plain TCP connection check.",
    });
  }
  if (!p.has.node && !p.has.python3) {
    issues.push({
      level: "warning",
      message:
        "Neither Node.js nor Python 3 is installed. Only projects that ship their own binary can run.",
    });
  }
  if (p.diskTotalMb !== null && p.diskUsedMb !== null) {
    const free = p.diskTotalMb - p.diskUsedMb;
    if (free < 1024) {
      issues.push({
        level: "warning",
        message: `Only ${free} MB of disk is free. Releases are kept for rollback, so deploys may fail.`,
      });
    }
  }
  return issues;
}
