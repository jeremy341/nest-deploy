import { describe, expect, it } from "vitest";
import {
  classifyAnswer,
  classifyError,
  makeProbe,
  runAppCheck,
  safeRequestPath,
  type Probe,
  type ProbeResult,
} from "@/server/app-check";

describe("classifyAnswer", () => {
  it("treats anything below 500 as answering", () => {
    expect(classifyAnswer(200)).toEqual({ ok: true, message: "Answers with HTTP 200" });
    expect(classifyAnswer(301)).toEqual({ ok: true, message: "Answers with HTTP 301" });
    expect(classifyAnswer(404)).toEqual({ ok: true, message: "Answers with HTTP 404" });
    expect(classifyAnswer(499).ok).toBe(true);
  });
  it("treats 500 and above as reachable but failing", () => {
    expect(classifyAnswer(503)).toEqual({ ok: false, message: "Reachable but returning 503" });
    expect(classifyAnswer(500).ok).toBe(false);
  });
});

describe("classifyError", () => {
  it("separates certificate problems from connection problems", () => {
    const kind = (code: string) => classifyError(Object.assign(new Error(code), { code })).kind;
    expect(kind("CERT_HAS_EXPIRED")).toBe("certificate");
    expect(kind("DEPTH_ZERO_SELF_SIGNED_CERT")).toBe("certificate");
    expect(kind("ERR_TLS_CERT_ALTNAME_INVALID")).toBe("certificate");
    expect(kind("ECONNREFUSED")).toBe("unreachable");
    expect(kind("ETIMEDOUT")).toBe("unreachable");
    expect(classifyError(new Error("boom")).kind).toBe("unreachable");
  });
});

describe("safeRequestPath", () => {
  it("keeps normal paths and falls back to / for unsafe ones", () => {
    expect(safeRequestPath("/healthz")).toBe("/healthz");
    expect(safeRequestPath("/a?b=1")).toBe("/a?b=1");
    expect(safeRequestPath("//evil.com/x")).toBe("/");
    expect(safeRequestPath("healthz")).toBe("/");
    expect(safeRequestPath("/a b")).toBe("/");
    expect(safeRequestPath("/a\r\nHost: x")).toBe("/");
    expect(safeRequestPath(null)).toBe("/");
  });
});

const scripted =
  (script: Record<string, ProbeResult>): Probe =>
  async (_d, path) =>
    script[path];

describe("runAppCheck", () => {
  it("reports the status and a verified certificate after a successful handshake", async () => {
    const r = await runAppCheck(
      "a.example.com",
      null,
      scripted({ "/": { kind: "response", statusCode: 200, tlsVerified: true } })
    );
    expect(r.certificateVerified).toBe(true);
    expect(r.certificateLabel).toBe("Certificate accepted");
    expect(r.answers).toEqual([
      { path: "/", statusCode: 200, ok: true, message: "Answers with HTTP 200" },
    ]);
    expect(r.problem).toBeNull();
  });

  it("checks the health path too and flags a 503", async () => {
    const r = await runAppCheck(
      "a.example.com",
      "/healthz",
      scripted({
        "/": { kind: "response", statusCode: 200, tlsVerified: true },
        "/healthz": { kind: "response", statusCode: 503, tlsVerified: true },
      })
    );
    expect(r.answers.map((a) => a.message)).toEqual([
      "Answers with HTTP 200",
      "Reachable but returning 503 (/healthz)",
    ]);
    expect(r.problem).toBe("Reachable but returning 503");
  });

  it("never claims a certificate when the handshake was not verified", async () => {
    const r = await runAppCheck(
      "a.example.com",
      null,
      scripted({ "/": { kind: "response", statusCode: 200, tlsVerified: false } })
    );
    expect(r.certificateVerified).toBe(false);
    expect(r.certificateLabel).toBe("Certificate not verified yet");
  });

  it("keeps 'not verified yet' on certificate errors, unreachable hosts and refused addresses", async () => {
    const failures: ProbeResult[] = [
      { kind: "certificate", detail: "The certificate has expired." },
      { kind: "unreachable", detail: "No answer within 5 seconds." },
      { kind: "refused", detail: "The name resolves to a private or internal address." },
    ];
    for (const result of failures) {
      const r = await runAppCheck("a.example.com", "/h", scripted({ "/": result }));
      expect(r.certificateVerified).toBe(false);
      expect(r.certificateLabel.startsWith("Certificate not verified yet")).toBe(true);
      expect(r.answers).toHaveLength(1); // stops after the first failed connection
      expect(r.answers[0].ok).toBe(false);
    }
  });
});

describe("makeProbe", () => {
  it("refuses a domain that resolves to an internal address without connecting", async () => {
    const probe = makeProbe(async () => [{ address: "127.0.0.1", family: 4 }]);
    const r = await probe("internal.example.com", "/");
    expect(r.kind).toBe("refused");
  });
});
