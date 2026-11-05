import https from "node:https";
import type { TLSSocket } from "node:tls";
import { resolvePublicAddress, UnsafeAddressError, type Lookup } from "@/server/net-guard";

/**
 * The "app answers" check: request the domain over HTTPS and report what came
 * back. The request is made to the address we resolved and vetted ourselves
 * (see net-guard), with the domain as the TLS name, so certificate checking is
 * normal and a second DNS lookup cannot redirect it. Redirects are never
 * followed and the body is never read.
 */

export const CHECK_TIMEOUT_MS = 5000;

export type ProbeResult =
  | {
      kind: "response";
      statusCode: number;
      /** True only when the TLS handshake finished and the certificate was accepted. */
      tlsVerified: boolean;
    }
  | { kind: "certificate"; detail: string }
  | { kind: "unreachable"; detail: string }
  | { kind: "refused"; detail: string };

export type Probe = (domain: string, path: string) => Promise<ProbeResult>;

export type AnswerReport = {
  path: string;
  statusCode: number | null;
  /** True when the app answered with a status below 500. */
  ok: boolean;
  message: string;
};

export type AppCheckReport = {
  /** True when at least one HTTPS request completed a verified TLS handshake. */
  certificateVerified: boolean;
  certificateLabel: string;
  answers: AnswerReport[];
  /** Null when everything answered below 500, otherwise a short problem summary. */
  problem: string | null;
};

/** Describe an HTTP status in plain words. 500 and above counts as a failure. */
export function classifyAnswer(statusCode: number): { ok: boolean; message: string } {
  if (statusCode < 500) return { ok: true, message: `Answers with HTTP ${statusCode}` };
  return { ok: false, message: `Reachable but returning ${statusCode}` };
}

const CERT_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_UNTRUSTED",
  "CERT_REVOKED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "HOSTNAME_MISMATCH",
]);

/** Turn a connection error into a probe result without leaking internals. */
export function classifyError(err: unknown): ProbeResult {
  const code = (err as NodeJS.ErrnoException | undefined)?.code ?? "";
  if (CERT_CODES.has(code)) {
    const detail =
      code === "CERT_HAS_EXPIRED"
        ? "The certificate has expired."
        : code === "ERR_TLS_CERT_ALTNAME_INVALID" || code === "HOSTNAME_MISMATCH"
          ? "The certificate is for a different name."
          : "The certificate is not trusted.";
    return { kind: "certificate", detail };
  }
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") {
    return { kind: "unreachable", detail: "No answer within 5 seconds." };
  }
  if (code === "ECONNREFUSED") {
    return { kind: "unreachable", detail: "The connection was refused on port 443." };
  }
  if (code === "ECONNRESET" || code.startsWith("ERR_SSL") || code.startsWith("ERR_TLS")) {
    return { kind: "unreachable", detail: "The secure connection could not be set up." };
  }
  return { kind: "unreachable", detail: "Could not connect." };
}

/** A path from a project's health setting, made safe to put in a request line. */
export function safeRequestPath(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/";
  // Whitespace and control characters could break the request line.
  if (/[\s\u0000-\u001f\u007f]/.test(path)) return "/";
  return path.slice(0, 200);
}

/** Make one HTTPS request to a vetted address. Exported for tests as `makeProbe`. */
export function makeProbe(lookup?: Lookup, timeoutMs = CHECK_TIMEOUT_MS): Probe {
  return async (domain, path) => {
    let target: { address: string; family: 4 | 6 };
    try {
      target = await resolvePublicAddress(domain, lookup);
    } catch (err) {
      if (err instanceof UnsafeAddressError) return { kind: "refused", detail: err.message };
      throw err;
    }
    return new Promise<ProbeResult>((resolve) => {
      let done = false;
      const finish = (r: ProbeResult) => {
        if (done) return;
        done = true;
        resolve(r);
      };
      const req = https.request(
        {
          host: target.address,
          family: target.family,
          port: 443,
          method: "GET",
          path,
          servername: domain,
          rejectUnauthorized: true,
          timeout: timeoutMs,
          headers: { host: domain, "user-agent": "nest-deploy-check", accept: "*/*" },
          agent: false,
        },
        (res) => {
          const socket = res.socket as TLSSocket;
          const tlsVerified = socket.authorized === true;
          const statusCode = res.statusCode ?? 0;
          // Status only: drop the body and the connection.
          res.destroy();
          req.destroy();
          finish({ kind: "response", statusCode, tlsVerified });
        }
      );
      req.on("timeout", () => {
        req.destroy();
        finish({ kind: "unreachable", detail: "No answer within 5 seconds." });
      });
      req.on("error", (err) => finish(classifyError(err)));
      // Hard stop in case a socket never emits timeout.
      const hard = setTimeout(() => {
        req.destroy();
        finish({ kind: "unreachable", detail: "No answer within 5 seconds." });
      }, timeoutMs + 500);
      hard.unref?.();
      req.on("close", () => clearTimeout(hard));
      req.end();
    });
  };
}

/** Request `paths` (the root, plus the health path if different) and summarise. */
export async function runAppCheck(
  domain: string,
  healthPath: string | null,
  probe: Probe = makeProbe()
): Promise<AppCheckReport> {
  const health = safeRequestPath(healthPath);
  const paths = health === "/" ? ["/"] : ["/", health];

  const answers: AnswerReport[] = [];
  let certificateVerified = false;
  let certificateLabel = "Certificate not verified yet";
  let problem: string | null = null;

  for (const path of paths) {
    const r = await probe(domain, path);
    const where = path === "/" ? "" : ` (${path})`;
    if (r.kind === "response") {
      if (r.tlsVerified) {
        certificateVerified = true;
        certificateLabel = "Certificate accepted";
      }
      const c = classifyAnswer(r.statusCode);
      answers.push({ path, statusCode: r.statusCode, ok: c.ok, message: `${c.message}${where}` });
      if (!c.ok && !problem) problem = c.message;
    } else {
      if (r.kind === "certificate") {
        certificateLabel = `Certificate not verified yet. ${r.detail}`;
      }
      answers.push({ path, statusCode: null, ok: false, message: `${r.detail}${where}` });
      if (!problem) problem = r.detail;
      // A failed connection will fail again on the next path.
      break;
    }
  }
  return { certificateVerified, certificateLabel, answers, problem };
}
