import { createHash } from "node:crypto";
import { utils } from "ssh2";

export type GeneratedKey = {
  /** One line, ready to paste into the Nest dashboard's SSH Keys page. */
  publicKey: string;
  /** OpenSSH private key. Seal it before storing. */
  privateKey: string;
  /** SHA256:... fingerprint of the public key. */
  fingerprint: string;
};

/** Fingerprint in the same format `ssh-keygen -l` prints. */
export function fingerprintOfBlob(blob: Buffer): string {
  return `SHA256:${createHash("sha256").update(blob).digest("base64").replace(/=+$/, "")}`;
}

export function fingerprintOfPublicKey(publicKeyLine: string): string {
  const parsed = utils.parseKey(publicKeyLine);
  if (parsed instanceof Error) throw parsed;
  const key = Array.isArray(parsed) ? parsed[0] : parsed;
  return fingerprintOfBlob(key.getPublicSSH());
}

/**
 * A dedicated ed25519 key for one Nest server. It is never reused for another
 * user or service, so removing it from the Nest dashboard revokes our access.
 */
export function generateServerKey(comment: string): GeneratedKey {
  const pair = utils.generateKeyPairSync("ed25519", { comment });
  return {
    publicKey: pair.public.trim(),
    privateKey: pair.private,
    fingerprint: fingerprintOfPublicKey(pair.public),
  };
}
