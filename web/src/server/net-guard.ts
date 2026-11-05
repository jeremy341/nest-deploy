import { promises as dns } from "node:dns";
import { isIP } from "node:net";

/**
 * Guards for server-side requests to user-supplied hostnames (SSRF).
 *
 * A request is only allowed when every address the name resolves to is a
 * public, globally routable address. Loopback, private, link-local, carrier
 * grade NAT, documentation, multicast and reserved ranges are all refused, and
 * so are IPv6 forms that embed an IPv4 address (mapped, NAT64, 6to4) when the
 * embedded address is not public.
 */

function parseV4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

function publicV4(o: number[]): boolean {
  const [a, b, c] = o;
  if (a === 0) return false; // "this network"
  if (a === 10) return false; // private
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 0 && c === 0) return false; // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return false; // documentation
  if (a === 192 && b === 88 && c === 99) return false; // 6to4 relay
  if (a === 192 && b === 168) return false; // private
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // documentation
  if (a === 203 && b === 0 && c === 113) return false; // documentation
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** Expand an IPv6 address into eight 16-bit groups, or null if it is malformed. */
function parseV6(input: string): number[] | null {
  let ip = input.toLowerCase();
  const zone = ip.indexOf("%");
  if (zone !== -1) ip = ip.slice(0, zone);

  // A trailing dotted IPv4 (::ffff:1.2.3.4) counts as two groups.
  const lastColon = ip.lastIndexOf(":");
  if (lastColon !== -1 && ip.slice(lastColon + 1).includes(".")) {
    const v4 = parseV4(ip.slice(lastColon + 1));
    if (!v4) return null;
    ip = `${ip.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }

  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const toGroups = (s: string) => (s === "" ? [] : s.split(":"));
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

function v4FromGroups(hi: number, lo: number): number[] {
  return [hi >> 8, hi & 255, lo >> 8, lo & 255];
}

function publicV6(g: number[]): boolean {
  const allZero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
  if (allZero(0, 8)) return false; // ::
  if (allZero(0, 7) && g[7] === 1) return false; // ::1
  // ::ffff:a.b.c.d (IPv4-mapped) and ::a.b.c.d (deprecated IPv4-compatible)
  if (allZero(0, 5) && g[5] === 0xffff) return publicV4(v4FromGroups(g[6], g[7]));
  if (allZero(0, 6)) return publicV4(v4FromGroups(g[6], g[7]));
  // 64:ff9b::/96 NAT64 embeds an IPv4 address in the last 32 bits.
  if (g[0] === 0x64 && g[1] === 0xff9b && allZero(2, 6)) return publicV4(v4FromGroups(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return false; // local-use NAT64
  if (g[0] === 0x2002) return publicV4(v4FromGroups(g[1], g[2])); // 6to4 embeds IPv4
  if (g[0] === 0x2001 && g[1] === 0) return false; // Teredo
  if (g[0] === 0x2001 && g[1] === 0xdb8) return false; // documentation
  if (g[0] === 0x100 && allZero(1, 4)) return false; // discard-only 100::/64
  if ((g[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((g[0] & 0xffc0) === 0xfec0) return false; // site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return false; // multicast
  // Only global unicast 2000::/3 is routable on the public internet.
  return (g[0] & 0xe000) === 0x2000;
}

/** True only for a syntactically valid, publicly routable IPv4 or IPv6 address. */
export function isPublicAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    const o = parseV4(address);
    return o ? publicV4(o) : false;
  }
  if (kind === 6) {
    const g = parseV6(address);
    return g ? publicV6(g) : false;
  }
  return false;
}

export type Lookup = (host: string) => Promise<{ address: string; family: number }[]>;

const defaultLookup: Lookup = (host) => dns.lookup(host, { all: true, verbatim: true });

export class UnsafeAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeAddressError";
  }
}

/**
 * Resolve a hostname and return the address to connect to. Throws
 * UnsafeAddressError if it resolves to nothing, or to any address that is not
 * public (one bad record is enough to refuse, so a mixed answer cannot be used
 * to reach an internal host). Connect to the returned address, not the name, so
 * a second lookup cannot return something different (DNS rebinding).
 */
export async function resolvePublicAddress(
  host: string,
  lookup: Lookup = defaultLookup
): Promise<{ address: string; family: 4 | 6 }> {
  if (isIP(host)) {
    throw new UnsafeAddressError("Only domain names can be checked, not IP addresses.");
  }
  let found: { address: string; family: number }[];
  try {
    found = await lookup(host);
  } catch {
    throw new UnsafeAddressError("The name does not resolve to an address yet.");
  }
  if (found.length === 0) {
    throw new UnsafeAddressError("The name does not resolve to an address yet.");
  }
  if (!found.every((f) => isPublicAddress(f.address))) {
    throw new UnsafeAddressError(
      "The name resolves to a private or internal address, so it was not checked."
    );
  }
  const first = found[0];
  return { address: first.address, family: isIP(first.address) === 6 ? 6 : 4 };
}
