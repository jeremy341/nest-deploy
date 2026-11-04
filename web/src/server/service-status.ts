import { unitName } from "@/server/deploy/layout";
import { serviceStatus } from "@/server/deploy/remote";
import { HttpError } from "@/server/http";
import { getProjectForUser } from "@/server/projects";
import { getServerForUser, withServerSession } from "@/server/servers";
import { SshError } from "@/server/ssh/connection";

export type ServiceState = "running" | "starting" | "failed" | "stopped" | "not_deployed" | "unknown";

export type ServiceStatus = {
  state: ServiceState;
  /** systemd's own word for it, for example "running" or "auto-restart". */
  detail: string | null;
  pid: number | null;
  uptimeSeconds: number | null;
  /** Memory the service uses, in MB. */
  memoryMb: number | null;
  /** How many times systemd has restarted it since it was last started by hand. */
  restarts: number | null;
  /** One request to the health path. Code 0 means nothing answered. */
  http: { code: number; ms: number | null } | null;
  checkedAt: string;
};

/** systemd prints the largest 64-bit number when it has no figure. */
const UNSET = "18446744073709551615";

function num(value: string | undefined): number | null {
  if (!value || !/^\d+(\.\d+)?$/.test(value)) return null;
  return Number(value);
}

/** Turn the script's ND_KEY=value lines into a status. Pure, so it is easy to test. */
export function parseServiceStatus(stdout: string, at = new Date()): ServiceStatus {
  const kv = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^ND_([A-Za-z]+)=(.*)$/.exec(line.trim());
    if (m) kv.set(m[1], m[2].trim());
  }

  const active = kv.get("ActiveState") || kv.get("ACTIVE") || "";
  const detail = kv.get("SubState") || null;
  let state: ServiceState = "unknown";
  if (kv.get("LoadState") === "not-found") state = "not_deployed";
  else if (active === "active") state = "running";
  else if (active === "activating" || active === "reloading") state = "starting";
  else if (active === "failed") state = "failed";
  else if (active === "inactive" || active === "deactivating") state = "stopped";

  let memoryMb: number | null = null;
  const mem = kv.get("MemoryCurrent");
  if (mem && /^\d+$/.test(mem) && mem !== UNSET) {
    memoryMb = Math.round((Number(mem) / 1048576) * 10) / 10;
  }

  let uptimeSeconds: number | null = null;
  const mono = num(kv.get("ActiveEnterTimestampMonotonic"));
  const machine = num(kv.get("UPTIME"));
  if (state === "running" && mono && machine !== null) {
    uptimeSeconds = Math.max(0, Math.round(machine - mono / 1e6));
  }

  let http: ServiceStatus["http"] = null;
  const h = /^(\d{3})\s+([\d.]+)$/.exec(kv.get("HTTP") ?? "");
  if (h) {
    const code = Number(h[1]);
    http = { code, ms: code === 0 ? null : Math.round(Number(h[2]) * 1000) };
  }

  const pid = num(kv.get("MainPID"));
  return {
    state,
    detail,
    pid: pid && pid > 0 ? pid : null,
    uptimeSeconds,
    memoryMb,
    restarts: num(kv.get("NRestarts")),
    http,
    checkedAt: at.toISOString(),
  };
}

/** Ask the container how the project's production service is doing right now. */
export async function fetchServiceStatus(userId: string, projectId: string): Promise<ServiceStatus> {
  const project = await getProjectForUser(userId, projectId);
  const server = await getServerForUser(userId, project.serverId);
  let res;
  try {
    res = await withServerSession(server, (s) =>
      s.script(
        serviceStatus({ unit: unitName(project.slug), port: project.port, path: project.healthPath }),
        { timeoutMs: 20_000 }
      )
    );
  } catch (err) {
    // Say what went wrong in words a person can act on, not as a 500.
    if (err instanceof SshError) {
      throw new HttpError(err.kind === "timeout" ? 504 : 502, err.message.replace(/\.$/, ""), "upstream");
    }
    throw err;
  }
  if (res.code !== 0) {
    throw new HttpError(502, "Could not read the service from your container.", "upstream");
  }
  return parseServiceStatus(res.stdout);
}
