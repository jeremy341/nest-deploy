import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { newId } from "@/server/crypto";
import { getDb, schema } from "@/server/db";
import { HttpError, notFound } from "@/server/http";
import { getServerForUser } from "@/server/servers";

/**
 * Nest maps a domain to a container port on its own dashboard, and that step
 * has no API. So this module records what the user intends, tells them exactly
 * what to enter in the Nest dashboard, and checks DNS to see if it is done.
 */

const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeDomain(input: string): string {
  const d = input.trim().toLowerCase().replace(/\.$/, "");
  if (isIP(d) || !HOSTNAME.test(d)) {
    throw new HttpError(
      400,
      "Enter a domain name such as app.example.com (not an IP address or a URL).",
      "validation"
    );
  }
  return d;
}

export const domainInput = z.object({
  serverId: z.string().min(1),
  domain: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  projectId: z.string().nullable().optional(),
});

/** The name a custom domain should point at (CNAME). */
export function cnameTarget(nestUsername: string) {
  return `${nestUsername}.hackclub.app`;
}

export function dashboardInstructions(domain: string, port: number, nestUsername: string) {
  const isNestName = domain.endsWith(".hackclub.app");
  return {
    steps: isNestName
      ? [
          `Open the Domains page in the Nest dashboard.`,
          `Add ${domain} and set its target port to ${port}.`,
        ]
      : [
          `At your DNS provider, create a CNAME record for ${domain} pointing to ${cnameTarget(nestUsername)}.`,
          `Open the Domains page in the Nest dashboard, add ${domain}, and set its target port to ${port}.`,
          `Come back here and press Check.`,
        ],
    cname: isNestName ? null : { name: domain, value: cnameTarget(nestUsername) },
  };
}

export async function addDomain(userId: string, raw: unknown) {
  const input = domainInput.parse(raw);
  const server = await getServerForUser(userId, input.serverId);
  const domain = normalizeDomain(input.domain);
  const db = await getDb();

  if (input.projectId) {
    const project = await db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.userId, userId)))
      .get();
    if (!project || project.serverId !== server.id) throw notFound("Project not found");
  }
  if (await db.select().from(schema.domains).where(eq(schema.domains.domain, domain)).get()) {
    throw new HttpError(409, `${domain} is already added.`, "conflict");
  }

  const id = newId();
  await db.insert(schema.domains).values({
    id,
    userId,
    serverId: server.id,
    projectId: input.projectId ?? null,
    domain,
    port: input.port,
    status: "pending",
    createdAt: new Date(),
  });
  return {
    domain: (await db.select().from(schema.domains).where(eq(schema.domains.id, id)).get())!,
    instructions: dashboardInstructions(domain, input.port, server.nestUsername),
  };
}

export async function listDomains(userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.domains)
    .where(eq(schema.domains.userId, userId))
    .orderBy(schema.domains.createdAt);
}

export async function removeDomain(userId: string, domainId: string) {
  const db = await getDb();
  const row = await db
    .select()
    .from(schema.domains)
    .where(and(eq(schema.domains.id, domainId), eq(schema.domains.userId, userId)))
    .get();
  if (!row) throw notFound("Domain not found");
  await db.delete(schema.domains).where(eq(schema.domains.id, row.id));
}

export type Resolver = {
  resolveCname: (name: string) => Promise<string[]>;
  resolve4: (name: string) => Promise<string[]>;
};

/** Check whether DNS already sends the domain to this Nest account. */
export async function verifyDomain(
  userId: string,
  domainId: string,
  resolver: Resolver = dns
): Promise<{ status: "valid" | "invalid"; reason: string | null }> {
  const db = await getDb();
  const row = await db
    .select()
    .from(schema.domains)
    .where(and(eq(schema.domains.id, domainId), eq(schema.domains.userId, userId)))
    .get();
  if (!row) throw notFound("Domain not found");
  const server = await getServerForUser(userId, row.serverId);
  const target = cnameTarget(server.nestUsername);

  let status: "valid" | "invalid" = "invalid";
  let reason: string | null = null;

  try {
    const cnames = (await resolver.resolveCname(row.domain)).map((c) => c.replace(/\.$/, "").toLowerCase());
    if (cnames.includes(target)) {
      status = "valid";
    } else if (cnames.some((c) => c.endsWith(".hackclub.app"))) {
      reason = `The CNAME points to ${cnames[0]}, but it should point to ${target}.`;
    } else {
      reason = `The CNAME points to ${cnames[0]}. It should point to ${target}.`;
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (row.domain.endsWith(`.${server.nestUsername}.hackclub.app`) || row.domain === target) {
      // A name Nest hands out has no CNAME we control; an A record is enough.
      try {
        status = (await resolver.resolve4(row.domain)).length > 0 ? "valid" : "invalid";
      } catch {
        reason = "The name does not resolve yet. Add it in the Nest dashboard first.";
      }
    } else if (code === "ENODATA" || code === "ENOTFOUND") {
      reason = `No CNAME found yet. Create one pointing to ${target}. DNS changes can take a few minutes.`;
    } else {
      reason = "DNS could not be checked right now. Try again in a minute.";
    }
  }

  await db
    .update(schema.domains)
    .set({ status, lastCheckedAt: new Date() })
    .where(eq(schema.domains.id, row.id));
  return { status, reason };
}
