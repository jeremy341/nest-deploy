import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NestSession, SshError, shellQuote } from "@/server/ssh/connection";
import { fingerprintOfPublicKey, generateServerKey } from "@/server/ssh/keys";
import { parseProbe, probeIssues, probeSession } from "@/server/ssh/probe";
import { startMockSsh, type MockSsh } from "@/server/test/mock-ssh";

describe("keys", () => {
  it("generates a dedicated ed25519 key with a matching fingerprint", () => {
    const key = generateServerKey("nest-deploy:sam-r");
    expect(key.publicKey).toMatch(/^ssh-ed25519 [A-Za-z0-9+/=]+ nest-deploy:sam-r$/);
    expect(key.privateKey).toContain("BEGIN OPENSSH PRIVATE KEY");
    expect(key.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    expect(fingerprintOfPublicKey(key.publicKey)).toBe(key.fingerprint);
  });

  it("never reuses a key", () => {
    expect(generateServerKey("a").publicKey).not.toBe(generateServerKey("a").publicKey);
  });
});

describe("shellQuote", () => {
  it("neutralises quotes and metacharacters", () => {
    expect(shellQuote("a'b")).toBe(`'a'\\''b'`);
    expect(shellQuote("$(rm -rf /)")).toBe("'$(rm -rf /)'");
  });
});

describe("NestSession against a mock Nest", () => {
  let mock: MockSsh;
  let key: ReturnType<typeof generateServerKey>;

  beforeEach(async () => {
    key = generateServerKey("test");
    mock = await startMockSsh({ authorizedKeys: [key.publicKey] });
  });
  afterEach(async () => {
    await mock.stop();
  });

  const connect = (over: Partial<Parameters<typeof NestSession.connect>[0]> = {}) =>
    NestSession.connect({
      host: "127.0.0.1",
      port: mock.port,
      username: "sam-r",
      privateKey: key.privateKey,
      ...over,
    });

  it("connects, runs a command and reports the host key", async () => {
    const s = await connect();
    expect(s.hostKeyFingerprint).toBe(mock.hostKeyFingerprint);
    const r = await s.exec("echo hello && echo oops 1>&2; exit 3");
    expect(r.code).toBe(3);
    expect(r.stdout.trim()).toBe("hello");
    expect(r.stderr.trim()).toBe("oops");
    s.close();
  });

  it("streams lines as they arrive", async () => {
    const s = await connect();
    const lines: string[] = [];
    await s.exec("printf 'a\\nb\\nc'", { onLine: (l) => lines.push(l) });
    expect(lines).toEqual(["a", "b", "c"]);
    s.close();
  });

  it("rejects a key the container does not know, with a helpful message", async () => {
    const other = generateServerKey("other");
    await expect(connect({ privateKey: other.privateKey })).rejects.toMatchObject({
      kind: "auth",
      message: expect.stringContaining("SSH Keys page"),
    });
  });

  it("refuses a changed host key", async () => {
    const wrong = "SHA256:" + "A".repeat(43);
    await expect(connect({ pinnedHostKey: wrong })).rejects.toMatchObject({
      kind: "host-key",
    });
  });

  it("accepts the pinned host key", async () => {
    const s = await connect({ pinnedHostKey: mock.hostKeyFingerprint });
    s.close();
  });

  it("reports network failures clearly", async () => {
    await expect(connect({ port: 1 })).rejects.toBeInstanceOf(SshError);
  });

  it("feeds a script through bash -s without quoting trouble", async () => {
    const s = await connect();
    const r = await s.script(`name="it's a \\"test\\""\necho "$name"`);
    expect(r.stdout.trim()).toBe(`it's a "test"`);
    s.close();
  });

  it("uploads a file over a plain exec channel", async () => {
    const s = await connect();
    const local = path.join(tmpdir(), `nd-upload-${Date.now()}.bin`);
    writeFileSync(local, Buffer.from([0, 1, 2, 250, 251, 252, 10, 13]));
    await s.uploadFile(local, `${mock.home}/remote.bin`);
    const back = await s.exec(`od -An -tu1 ${mock.home}/remote.bin`);
    expect(back.stdout.trim().split(/\s+/).map(Number)).toEqual([0, 1, 2, 250, 251, 252, 10, 13]);
    s.close();
  });

  it("times out a hung command", async () => {
    const s = await connect();
    await expect(s.exec("sleep 5", { timeoutMs: 300 })).rejects.toMatchObject({
      kind: "timeout",
    });
    s.close();
  });

  it("probes the container", async () => {
    const s = await connect();
    const probe = await probeSession(s);
    expect(probe.home.length).toBeGreaterThan(0);
    expect(probe.has.tar).toBe(true);
    s.close();
  });
});

describe("probe parsing", () => {
  const sample = [
    "uid=0",
    "os=Debian GNU/Linux 12 (bookworm)",
    "arch=x86_64",
    "home=/root",
    "has_systemctl=1",
    "has_node=1",
    "has_npm=1",
    "has_python3=1",
    "has_tar=1",
    "has_curl=1",
    "has_git=0",
    "has_sha256sum=1",
    "node_version=v22.11.0",
    "python_version=Python 3.11.2",
    "cpus=2",
    "mem_total_mb=2048",
    "mem_used_mb=512",
    "disk_total_mb=16384",
    "disk_used_mb=4096",
    "load1=0.42",
    "systemd_state=running",
  ].join("\n");

  it("parses a full report", () => {
    const p = parseProbe(sample);
    expect(p.uid).toBe(0);
    expect(p.os).toContain("Debian");
    expect(p.has.git).toBe(false);
    expect(p.cpus).toBe(2);
    expect(p.load1).toBeCloseTo(0.42);
    expect(probeIssues(p)).toEqual([]);
  });

  it("flags a container without systemd as an error", () => {
    const p = parseProbe(sample.replace("has_systemctl=1", "has_systemctl=0").replace("running", "unavailable"));
    expect(probeIssues(p).some((i) => i.level === "error" && i.message.includes("systemd"))).toBe(true);
  });

  it("warns on low disk and tolerates missing fields", () => {
    const p = parseProbe("uid=0\ndisk_total_mb=1000\ndisk_used_mb=900");
    expect(p.memTotalMb).toBeNull();
    expect(probeIssues(p).some((i) => i.message.includes("disk"))).toBe(true);
  });
});
