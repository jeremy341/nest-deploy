import { describe, expect, it } from "vitest";
import {
  InventoryParseError,
  inventoryScript,
  parseInventory,
  parseNetstatLine,
  parseSsLine,
  removeFolderScript,
  removeUnitScript,
} from "@/server/ssh/inventory-probe";

const T = "\t";

function output(lines: string[]) {
  return lines.join("\n") + "\n";
}

const HEAD = ["home=/home/sam", "unit_dir=/etc/systemd/system", "has_systemctl=1", "disk_total_mb=10240", "disk_used_mb=4096"];

describe("parseSsLine", () => {
  it("reads address, port and the owning process", () => {
    expect(
      parseSsLine('LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=4242,fd=19))')
    ).toEqual({ address: "0.0.0.0", port: 3000, process: "node", pid: 4242 });
  });

  it("handles IPv6, wildcard, interface suffixes and a missing process column", () => {
    expect(parseSsLine("LISTEN 0 4096 [::]:8080 [::]:*")).toEqual({
      address: "[::]",
      port: 8080,
      process: null,
      pid: null,
    });
    expect(parseSsLine("LISTEN 0 128 *:22 *:*")?.port).toBe(22);
    expect(parseSsLine("LISTEN 0 4096 127.0.0.53%lo:53 0.0.0.0:*")).toMatchObject({
      address: "127.0.0.53%lo",
      port: 53,
    });
  });

  it("skips headers and junk", () => {
    expect(parseSsLine("State Recv-Q Send-Q Local Address:Port Peer Address:Port Process")).toBeNull();
    expect(parseSsLine("")).toBeNull();
    expect(parseSsLine("LISTEN 0 1 nonsense x")).toBeNull();
  });
});

describe("parseNetstatLine", () => {
  it("reads the pid/program column", () => {
    expect(
      parseNetstatLine("tcp        0      0 0.0.0.0:5173            0.0.0.0:*               LISTEN      812/vite")
    ).toEqual({ address: "0.0.0.0", port: 5173, process: "vite", pid: 812 });
    expect(parseNetstatLine("tcp6       0      0 :::3000                 :::*                    LISTEN      -")).toEqual({
      address: "::",
      port: 3000,
      process: null,
      pid: null,
    });
  });
});

describe("parseInventory", () => {
  const full = output([
    ...HEAD,
    ["UNIT", "nd-blog.service", "loaded", "active", "running", "4242", "/etc/systemd/system/nd-blog.service", "/system.slice/nd-blog.service", '/bin/bash -lc "exec node server.js"'].join(T),
    ["UNIT", "nd-old.service", "loaded", "failed", "failed", "0", "/etc/systemd/system/nd-old.service", "", ""].join(T),
    ["UNIT", "../evil.service", "loaded", "active", "running", "1", "", "", ""].join(T),
    ["DIR", "blog", "20480", "0"].join(T),
    ["DIR", "old", "", "1"].join(T),
    "ports_format=ss",
    `PORT${T}LISTEN 0 511 0.0.0.0:3000 0.0.0.0:* users:(("node",pid=4242,fd=19))`,
    `PORT${T}LISTEN 0 511 [::]:3000 [::]:* users:(("node",pid=4242,fd=20))`,
    `PORT${T}LISTEN 0 128 0.0.0.0:22 0.0.0.0:*`,
    `PIDCG${T}4242${T}/system.slice/nd-blog.service,`,
    "END=1",
  ]);

  it("reads units, folders, disk and ports", () => {
    const inv = parseInventory(full);
    expect(inv.home).toBe("/home/sam");
    expect(inv.disk).toEqual({ totalMb: 10240, usedMb: 4096 });
    expect(inv.hasSystemctl).toBe(true);
    expect(inv.units.map((u) => u.name)).toEqual(["nd-blog.service", "nd-old.service"]); // traversal-looking name dropped
    expect(inv.units[0]).toMatchObject({
      state: "running",
      detail: "running",
      mainPid: 4242,
      unitFile: "/etc/systemd/system/nd-blog.service",
      controlGroup: "/system.slice/nd-blog.service",
      execStart: '/bin/bash -lc "exec node server.js"',
    });
    expect(inv.units[1]).toMatchObject({ state: "failed", mainPid: null, execStart: null });
    expect(inv.folders).toEqual([
      { name: "blog", sizeKb: 20480, isLink: false },
      { name: "old", sizeKb: null, isLink: true },
    ]);
    expect(inv.portsSource).toBe("ss");
    expect(inv.portsHaveProcesses).toBe(true);
  });

  it("merges the IPv4 and IPv6 listeners of one port and attaches the cgroup", () => {
    const inv = parseInventory(full);
    expect(inv.ports.map((p) => p.port)).toEqual([22, 3000]);
    const web = inv.ports.find((p) => p.port === 3000)!;
    expect(web).toMatchObject({ addresses: ["0.0.0.0", "[::]"], process: "node", pid: 4242 });
    expect(web.cgroups).toEqual(["/system.slice/nd-blog.service"]);
    expect(inv.ports.find((p) => p.port === 22)).toMatchObject({ process: null, pid: null });
  });

  it("works from netstat and when no tool is available", () => {
    const net = parseInventory(
      output([
        ...HEAD,
        "ports_format=netstat",
        `PORT${T}tcp 0 0 0.0.0.0:5173 0.0.0.0:* LISTEN 812/vite`,
        "END=1",
      ])
    );
    expect(net.portsSource).toBe("netstat");
    expect(net.ports[0]).toMatchObject({ port: 5173, process: "vite", pid: 812 });

    const none = parseInventory(output([...HEAD, "ports_format=none", "END=1"]));
    expect(none.portsSource).toBe("none");
    expect(none.ports).toEqual([]);
    expect(none.portsHaveProcesses).toBe(false);
  });

  it("notes when the listing carries no process names", () => {
    const inv = parseInventory(
      output([...HEAD, "ports_format=ss", `PORT${T}LISTEN 0 511 0.0.0.0:3000 0.0.0.0:*`, "END=1"])
    );
    expect(inv.portsHaveProcesses).toBe(false);
    expect(inv.ports).toHaveLength(1);
  });

  it("refuses output that was cut short", () => {
    expect(() => parseInventory(full.replace("END=1\n", ""))).toThrow(InventoryParseError);
    expect(() => parseInventory("")).toThrow(InventoryParseError);
    expect(() => parseInventory("END=1\n")).toThrow(InventoryParseError); // no home
  });

  it("copes with a container that reports no disk", () => {
    const inv = parseInventory(output(["home=/root", "END=1"]));
    expect(inv.disk).toBeNull();
    expect(inv.units).toEqual([]);
    expect(inv.folders).toEqual([]);
  });

  it("ignores stray lines from the shell", () => {
    const inv = parseInventory(`bash: warning: setlocale: LC_ALL\n${full}trailing noise\n`);
    expect(inv.units).toHaveLength(2);
  });
});

describe("the inventory script", () => {
  const script = inventoryScript("/etc/systemd/system");

  it("only reads: no verbs that change the container", () => {
    const body = script.replace(/2?>\s*\/dev\/null(\s+2>&1)?/g, "").replace(/NR>2/g, "");
    expect(body).not.toMatch(/\b(rm|mv|cp|kill|mkdir|touch|chmod|chown|tee|dd|reboot|shutdown)\b/);
    expect(body).not.toMatch(/systemctl\s+(stop|start|restart|enable|disable|daemon-reload|reset-failed|mask|kill)/);
    // The only redirections left are into /dev/null (removed above), so nothing is written.
    expect(body).not.toMatch(/(^|[^<>=-])>(?!\s*&)/m);
  });

  it("reads the units, folders and ports in one go", () => {
    expect(script).toContain("nd-*.service");
    expect(script).toContain("$HOME/.nest-deploy");
    expect(script).toContain("ss -ltnpH");
    expect(script).toContain("ss -ltnH");
    expect(script).toContain("netstat -ltnp");
    expect(script).toContain("df -Pm");
    expect(script).toContain("END=1");
  });

  it("quotes the unit folder", () => {
    expect(inventoryScript("/tmp/a b'c")).toContain(`unit_dir='/tmp/a b'\\''c'`);
  });
});

describe("the removal scripts", () => {
  it("removes a unit by stopping, disabling, deleting the file and reloading", () => {
    const s = removeUnitScript("/etc/systemd/system/", "nd-old.service");
    expect(s).toContain("systemctl stop");
    expect(s).toContain("systemctl disable");
    expect(s).toContain(`file='/etc/systemd/system/nd-old.service'`);
    expect(s).toContain("rm -f -- \"$file\"");
    expect(s).toContain("systemctl daemon-reload");
  });

  it("deletes only a direct, non-link child of the base folder", () => {
    const s = removeFolderScript("old");
    expect(s).toContain(`name='old'`);
    expect(s).toContain('dir="$base/$name"');
    expect(s).toContain('[ -L "$dir" ]');
    expect(s).toContain('"$(dirname "$real")" != "$realbase"');
    expect(s).toContain('rm -rf -- "$dir"');
  });
});
