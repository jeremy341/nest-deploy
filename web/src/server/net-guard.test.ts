import { describe, expect, it } from "vitest";
import { isPublicAddress, resolvePublicAddress, UnsafeAddressError } from "@/server/net-guard";

describe("isPublicAddress", () => {
  it("accepts ordinary public addresses", () => {
    for (const ip of [
      "8.8.8.8",
      "1.1.1.1",
      "93.184.216.34",
      "172.32.0.1",
      "100.63.255.255",
      "2606:4700:4700::1111",
      "2001:4860:4860::8888",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it("refuses private, loopback, link-local and reserved IPv4", () => {
    for (const ip of [
      "0.0.0.0",
      "10.0.0.1",
      "10.255.255.255",
      "127.0.0.1",
      "127.1.2.3",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1",
      "100.127.255.255",
      "192.0.0.1",
      "192.0.2.5",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.9",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("refuses non-public IPv6, including forms that embed IPv4", () => {
    for (const ip of [
      "::",
      "::1",
      "fe80::1",
      "fe80::abcd%eth0",
      "fc00::1",
      "fd12:3456::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "::ffff:7f00:1",
      "::127.0.0.1",
      "64:ff9b::7f00:1",
      "64:ff9b::10.0.0.1",
      "2002:7f00:1::1",
      "2002:c0a8:101::1",
      "fec0::1",
      "2001:0:4136:e378::1",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("allows IPv6 that embeds a public IPv4", () => {
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
    expect(isPublicAddress("64:ff9b::808:808")).toBe(true);
  });

  it("refuses anything that is not an IP address", () => {
    for (const v of ["", "example.com", "999.1.1.1", "1.2.3", "::g", "1::2::3"]) {
      expect(isPublicAddress(v), v).toBe(false);
    }
  });
});

describe("resolvePublicAddress", () => {
  const answer =
    (...addresses: string[]) =>
    async () =>
      addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));

  it("returns the first address when all are public", async () => {
    await expect(
      resolvePublicAddress("app.example.com", answer("93.184.216.34", "2606:4700::1"))
    ).resolves.toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("refuses a name that resolves to an internal address", async () => {
    for (const ip of ["127.0.0.1", "10.1.1.1", "169.254.169.254", "::1"]) {
      await expect(resolvePublicAddress("evil.example.com", answer(ip))).rejects.toBeInstanceOf(
        UnsafeAddressError
      );
    }
  });

  it("refuses a mixed answer where any record is internal", async () => {
    await expect(
      resolvePublicAddress("mixed.example.com", answer("93.184.216.34", "192.168.0.10"))
    ).rejects.toBeInstanceOf(UnsafeAddressError);
  });

  it("refuses IP literals, empty answers and lookup failures", async () => {
    await expect(resolvePublicAddress("8.8.8.8", answer("8.8.8.8"))).rejects.toBeInstanceOf(
      UnsafeAddressError
    );
    await expect(resolvePublicAddress("a.example.com", answer())).rejects.toBeInstanceOf(
      UnsafeAddressError
    );
    await expect(
      resolvePublicAddress("a.example.com", async () => {
        throw new Error("ENOTFOUND");
      })
    ).rejects.toBeInstanceOf(UnsafeAddressError);
  });
});
