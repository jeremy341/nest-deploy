import { shellQuote } from "@/server/ssh/connection";

/**
 * What is on a Nest container, read in one SSH round trip, and the two small
 * scripts that remove an orphaned service or folder.
 *
 * The inventory script only reads. It never writes, stops or deletes anything.
 * Its output is tab-separated lines that `parseInventory` turns into a plain
 * object, so the parsing is testable without a container.
 */

export type UnitState = "running" | "starting" | "failed" | "stopped" | "unknown";

export type InventoryUnit = {
  /** `nd-<slug>.service` or `nd-<slug>-pv-<8 hex>.service`. */
  name: string;
  state: UnitState;
  /** systemd's own word, for example "running" or "auto-restart". */
  detail: string | null;
  loadState: string | null;
  mainPid: number | null;
  /** Where the unit file is on the container, when systemd or the unit folder shows it. */
  unitFile: string | null;
  /** The ExecStart line as written in the unit file. */
  execStart: string | null;
  /** cgroup of the unit, used to tell which listening process belongs to it. */
  controlGroup: string | null;
};

export type InventoryFolder = {
  /** Folder name under `~/.nest-deploy/`. */
  name: string;
  sizeKb: number | null;
  /** True when the entry is a symbolic link. Links are listed but never removed. */
  isLink: boolean;
};

export type ListeningPort = {
  port: number;
  /** Local addresses it listens on, for example `0.0.0.0` and `[::]`. */
  addresses: string[];
  /** Process name, when the container let us read it. */
  process: string | null;
  pid: number | null;
  /** cgroup paths of the owning process, when readable. */
  cgroups: string[];
};

export type RawInventory = {
  home: string;
  unitDir: string;
  hasSystemctl: boolean;
  disk: { totalMb: number; usedMb: number } | null;
  units: InventoryUnit[];
  folders: InventoryFolder[];
  ports: ListeningPort[];
  /** Which tool listed the ports. "none" means neither ss nor netstat was usable. */
  portsSource: "ss" | "netstat" | "none";
  /** False when the listing carried no process information (not root, or `ss -ltn` only). */
  portsHaveProcesses: boolean;
};

export class InventoryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryParseError";
  }
}

const UNIT_RE = /^nd-[a-z0-9-]+\.service$/;

/**
 * The read-only script. `unitDir` is where Nest Deploy installs units (the
 * app's own setting, not user input), and is quoted regardless.
 */
export function inventoryScript(unitDir: string): string {
  return `
set +e
unit_dir=${shellQuote(unitDir)}
base="$HOME/.nest-deploy"
echo "home=$HOME"
echo "unit_dir=$unit_dir"
if command -v systemctl >/dev/null 2>&1; then echo "has_systemctl=1"; else echo "has_systemctl=0"; fi
df -Pm "$HOME" 2>/dev/null | awk 'NR==2 { printf "disk_total_mb=%d\\ndisk_used_mb=%d\\n", $2, $3 }'

names=$( {
  ls -1 "$unit_dir" 2>/dev/null | grep -E '^nd-[a-z0-9-]+\\.service$'
  systemctl list-unit-files --type=service --no-legend --no-pager 'nd-*.service' 2>/dev/null | awk '{print $1}' | grep -E '^nd-[a-z0-9-]+\\.service$'
} | sort -u )
for u in $names; do
  load=""; active=""; sub=""; pid=""; frag=""; cg=""
  while IFS='=' read -r k v; do
    case "$k" in
      LoadState) load=$v;;
      ActiveState) active=$v;;
      SubState) sub=$v;;
      MainPID) pid=$v;;
      FragmentPath) frag=$v;;
      ControlGroup) cg=$v;;
    esac
  done < <(systemctl show "$u" -p LoadState -p ActiveState -p SubState -p MainPID -p FragmentPath -p ControlGroup 2>/dev/null)
  if [ -z "$frag" ] && [ -f "$unit_dir/$u" ]; then frag="$unit_dir/$u"; fi
  exec_start=""
  if [ -n "$frag" ] && [ -r "$frag" ]; then
    exec_start=$(grep -m1 '^ExecStart=' "$frag" 2>/dev/null | cut -c11- | tr '\\t\\r' '  ' | cut -c1-400)
  fi
  printf 'UNIT\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$u" "$load" "$active" "$sub" "$pid" "$frag" "$cg" "$exec_start"
done

if [ -d "$base" ]; then
  T=""; if command -v timeout >/dev/null 2>&1; then T="timeout 20"; fi
  for d in "$base"/*/; do
    [ -d "$d" ] || continue
    n=$(basename "$d")
    link=0; if [ -L "\${d%/}" ]; then link=1; fi
    kb=$($T du -sk "$d" 2>/dev/null | cut -f1)
    printf 'DIR\\t%s\\t%s\\t%s\\n' "$n" "$kb" "$link"
  done
fi

fmt=none; out=""
if command -v ss >/dev/null 2>&1; then
  if out=$(ss -ltnpH 2>/dev/null); then fmt=ss
  elif out=$(ss -ltnH 2>/dev/null); then fmt=ss
  elif out=$(ss -ltnp 2>/dev/null | sed 1d); then fmt=ss
  elif out=$(ss -ltn 2>/dev/null | sed 1d); then fmt=ss
  fi
fi
if [ "$fmt" = none ] && command -v netstat >/dev/null 2>&1; then
  if out=$(netstat -ltnp 2>/dev/null | awk 'NR>2'); then fmt=netstat; fi
fi
echo "ports_format=$fmt"
printf '%s\\n' "$out" | while IFS= read -r line; do
  [ -n "$line" ] && printf 'PORT\\t%s\\n' "$(printf '%s' "$line" | tr '\\t' ' ')"
done
pids=""
if [ "$fmt" = ss ]; then
  pids=$(printf '%s\\n' "$out" | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -un)
elif [ "$fmt" = netstat ]; then
  pids=$(printf '%s\\n' "$out" | awk '{ split($NF, a, "/"); if (a[1] ~ /^[0-9]+$/) print a[1] }' | sort -un)
fi
for p in $pids; do
  cgs=$(sed -n 's/^[0-9]*:[^:]*://p' "/proc/$p/cgroup" 2>/dev/null | tr '\\n' ',')
  printf 'PIDCG\\t%s\\t%s\\n' "$p" "$cgs"
done
echo "END=1"
`;
}

function toNumber(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function unitState(active: string): UnitState {
  if (active === "active") return "running";
  if (active === "activating" || active === "reloading") return "starting";
  if (active === "failed") return "failed";
  if (active === "inactive" || active === "deactivating") return "stopped";
  return "unknown";
}

/** `0.0.0.0:3000`, `[::]:3000`, `*:3000`, `:::3000` to the port and the address. */
function splitLocal(local: string): { address: string; port: number } | null {
  const i = local.lastIndexOf(":");
  if (i < 0) return null;
  const port = Number(local.slice(i + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const address = local.slice(0, i) || "*";
  return { address, port };
}

type PortLine = { port: number; address: string; process: string | null; pid: number | null };

/** One line of `ss -ltnp` output. Works with or without the header and the process column. */
export function parseSsLine(line: string): PortLine | null {
  const f = line.trim().split(/\s+/);
  if (f.length < 4 || f[0] === "State") return null;
  const local = splitLocal(f[3]);
  if (!local) return null;
  const m = /\("([^"]*)",pid=(\d+)/.exec(line);
  return { ...local, process: m ? m[1] : null, pid: m ? Number(m[2]) : null };
}

/** One line of `netstat -ltnp` output. */
export function parseNetstatLine(line: string): PortLine | null {
  const f = line.trim().split(/\s+/);
  if (f.length < 6 || !f[0].startsWith("tcp")) return null;
  const local = splitLocal(f[3]);
  if (!local) return null;
  const m = /^(\d+)\/(.+)$/.exec(f.slice(6).join(" "));
  return { ...local, process: m ? m[2] : null, pid: m ? Number(m[1]) : null };
}

/**
 * Turn the script's output into an inventory. Throws when the output is cut
 * short (a timeout, a dropped connection): a half-read inventory would make
 * things look like orphans that are not.
 */
export function parseInventory(output: string): RawInventory {
  const kv = new Map<string, string>();
  const units: InventoryUnit[] = [];
  const folders: InventoryFolder[] = [];
  const portLines: string[] = [];
  const pidGroups = new Map<number, string[]>();

  for (const raw of output.split(/\r?\n/)) {
    if (raw.startsWith("UNIT\t")) {
      const [, name, load, active, sub, pid, frag, cg, exec] = raw.split("\t");
      if (!name || !UNIT_RE.test(name)) continue;
      const mainPid = toNumber(pid);
      units.push({
        name,
        state: unitState(active ?? ""),
        detail: sub ? sub : null,
        loadState: load ? load : null,
        mainPid: mainPid && mainPid > 0 ? mainPid : null,
        unitFile: frag ? frag : null,
        execStart: exec ? exec : null,
        controlGroup: cg ? cg : null,
      });
    } else if (raw.startsWith("DIR\t")) {
      const [, name, kb, link] = raw.split("\t");
      if (!name) continue;
      folders.push({ name, sizeKb: toNumber(kb), isLink: link === "1" });
    } else if (raw.startsWith("PORT\t")) {
      portLines.push(raw.slice(5));
    } else if (raw.startsWith("PIDCG\t")) {
      const [, pid, cgs] = raw.split("\t");
      const n = toNumber(pid);
      if (n !== null) pidGroups.set(n, (cgs ?? "").split(",").filter(Boolean));
    } else {
      const i = raw.indexOf("=");
      if (i > 0 && !raw.includes("\t")) kv.set(raw.slice(0, i).trim(), raw.slice(i + 1).trim());
    }
  }

  if (kv.get("END") !== "1" || !kv.get("home")) {
    throw new InventoryParseError("The container's answer was cut short, so nothing was classified.");
  }

  const source = kv.get("ports_format");
  const portsSource: RawInventory["portsSource"] =
    source === "ss" || source === "netstat" ? source : "none";
  const parse = portsSource === "netstat" ? parseNetstatLine : parseSsLine;

  const byPort = new Map<number, ListeningPort>();
  let withProcess = 0;
  for (const line of portLines) {
    const p = parse(line);
    if (!p) continue;
    if (p.pid !== null) withProcess++;
    const existing = byPort.get(p.port);
    if (!existing) {
      byPort.set(p.port, {
        port: p.port,
        addresses: [p.address],
        process: p.process,
        pid: p.pid,
        cgroups: p.pid !== null ? (pidGroups.get(p.pid) ?? []) : [],
      });
      continue;
    }
    if (!existing.addresses.includes(p.address)) existing.addresses.push(p.address);
    if (existing.pid === null && p.pid !== null) {
      existing.pid = p.pid;
      existing.process = p.process;
      existing.cgroups = pidGroups.get(p.pid) ?? [];
    }
  }

  const total = toNumber(kv.get("disk_total_mb"));
  const used = toNumber(kv.get("disk_used_mb"));

  return {
    home: kv.get("home")!,
    unitDir: kv.get("unit_dir") ?? "",
    hasSystemctl: kv.get("has_systemctl") === "1",
    disk: total !== null && used !== null && total > 0 ? { totalMb: total, usedMb: used } : null,
    units,
    folders,
    ports: [...byPort.values()].sort((a, b) => a.port - b.port),
    portsSource,
    portsHaveProcesses: withProcess > 0,
  };
}

/** Exit codes of the removal scripts, so the caller can say what happened. */
export const REMOVE_EXIT = { notFound: 3, notRemoved: 4, refused: 5 } as const;

/**
 * Stop, disable and remove one unit file. The caller has already validated
 * `unit` against the strict pattern; it is quoted here as well.
 */
export function removeUnitScript(unitDir: string, unit: string): string {
  const file = `${unitDir.replace(/\/$/, "")}/${unit}`;
  return (
    `set +e\n` +
    `unit=${shellQuote(unit)}\nfile=${shellQuote(file)}\n` +
    `systemctl stop "$unit" >/dev/null 2>&1\n` +
    `systemctl disable "$unit" >/dev/null 2>&1\n` +
    `rm -f -- "$file"\n` +
    `systemctl daemon-reload >/dev/null 2>&1\n` +
    `systemctl reset-failed "$unit" >/dev/null 2>&1\n` +
    `if [ -e "$file" ]; then echo "The unit file is still there" >&2; exit ${REMOVE_EXIT.notRemoved}; fi\n` +
    `exit 0\n`
  );
}

/**
 * Delete one folder under `~/.nest-deploy`. Refuses a link, and anything that
 * does not resolve to a direct child of the base folder.
 */
export function removeFolderScript(folder: string): string {
  return (
    `set +e\n` +
    `name=${shellQuote(folder)}\nbase="$HOME/.nest-deploy"\ndir="$base/$name"\n` +
    `if [ -L "$dir" ]; then echo "That folder is a link, so it was left alone" >&2; exit ${REMOVE_EXIT.refused}; fi\n` +
    `if [ ! -d "$dir" ]; then exit ${REMOVE_EXIT.notFound}; fi\n` +
    `real=$(cd "$dir" 2>/dev/null && pwd -P)\nrealbase=$(cd "$base" 2>/dev/null && pwd -P)\n` +
    `if [ -z "$real" ] || [ -z "$realbase" ] || [ "$(dirname "$real")" != "$realbase" ]; then echo "Refusing a folder outside $base" >&2; exit ${REMOVE_EXIT.refused}; fi\n` +
    `rm -rf -- "$dir"\n` +
    `if [ -e "$dir" ]; then echo "The folder is still there" >&2; exit ${REMOVE_EXIT.notRemoved}; fi\n` +
    `exit 0\n`
  );
}
