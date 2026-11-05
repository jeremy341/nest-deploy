import { z } from "zod";
import { SCOPE_LABEL, SCOPES } from "@/server/api-tokens";
import { API_LIMITS, ENDPOINTS, type Endpoint } from "@/server/api-v1";

/**
 * The OpenAPI 3.1 document, generated from the same ENDPOINTS list that
 * serves the routes and the MCP tools. Nothing here is written by hand per endpoint.
 */

type Json = Record<string, unknown>;

const ERROR_TEXT: Record<number, string> = {
  400: "The request was invalid.",
  401: "Missing or invalid access token. The response has a WWW-Authenticate: Bearer header. Revoked, expired and unknown tokens look the same.",
  403: "The token does not have the scope this endpoint needs. The message names it.",
  404: "No such item, or it belongs to someone else.",
  409: "The item is in a state that does not allow this.",
  413: "The request body or the file is too large.",
  503: "Too many terminals are open on the service right now.",
  429: "Too many requests for this token. Wait the number of seconds in the Retry-After header.",
  502: "The container could not be reached.",
};

const DESCRIPTION = `Manage your Nest Deploy projects from scripts and AI agents: read and change projects, deployments, environment variables, domains and settings, and (with their own tightly limited permissions) use a terminal and files on the container.

Authenticate every request with a personal access token created in Account:
\`Authorization: Bearer ndp_...\`. Browser sessions (cookies) are never accepted here. Each token has scopes; an endpoint needs the one listed on it.

Rate limits are per token: ${API_LIMITS.read.limit} requests a minute for reads and ${API_LIMITS.write.limit} a minute for changes. Anything that opens an SSH session to your container (inventory, file access, deployment logs, resource history, opening a terminal) shares a smaller allowance of ${API_LIMITS.ssh.limit} a minute, and terminal keystrokes get ${API_LIMITS.input.limit} a minute. Past that you get 429 with a Retry-After header.

Errors are always JSON: \`{ "error": { "code": "...", "message": "..." } }\`.

**Secrets are write-only.** Environment values, notification webhook URLs and token secrets are never returned. A deploy hook URL is returned once, by the call that creates it.

**Tightly limited:** the terminal (\`terminal:use\`) and file changes (\`files:write\`) need the owner to have turned the matching switch on for the server, and a token that holds either expires within 7 days. File changes only reach a project's \`shared/\` folder, never the live release.

**Deliberately not available to tokens:** removing leftovers on the container, container permission switches, account and session management, and token management. These stay with a signed-in browser. The same operations are exposed to AI agents over MCP at \`POST /api/mcp\`.`;

function schemaOf(zod: z.ZodType, io: "input" | "output", defs: Json): Json {
  const { $schema, $defs, ...rest } = z.toJSONSchema(zod, { io, target: "draft-2020-12", reused: "inline" }) as Json;
  void $schema;
  Object.assign(defs, $defs as Json | undefined);
  return rest;
}

/** Point `#/$defs/X` references at the OpenAPI components. */
function relink<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replaceAll("#/$defs/", "#/components/schemas/"));
}

function parameters(ep: Endpoint, defs: Json): Json[] {
  const make = (where: "path" | "query", shape: z.ZodRawShape) =>
    Object.entries(shape).map(([name, field]) => {
      const one = schemaOf(z.object({ [name]: field }), "input", defs);
      const props = one.properties as Record<string, Json>;
      const required = where === "path" || ((one.required as string[] | undefined) ?? []).includes(name);
      const { description, ...schema } = props[name];
      return { name, in: where, required, ...(description ? { description } : {}), schema };
    });
  return [...make("path", ep.pathParams), ...make("query", ep.query)];
}

function requestBody(ep: Endpoint, defs: Json): Json | undefined {
  if (Object.keys(ep.body).length === 0) return undefined;
  const schema = schemaOf(z.object(ep.body).strict(), "input", defs);
  const required = ((schema.required as string[] | undefined) ?? []).length > 0;
  return { required, content: { "application/json": { schema } } };
}

function errorResponse(status: number) {
  const headers: Json = {};
  if (status === 401) headers["WWW-Authenticate"] = { schema: { type: "string", const: "Bearer" } };
  if (status === 429) headers["Retry-After"] = { description: "Seconds to wait.", schema: { type: "integer", minimum: 1 } };
  return {
    description: ERROR_TEXT[status] ?? "Error.",
    ...(Object.keys(headers).length ? { headers } : {}),
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
  };
}

export function buildOpenApi(): Json {
  const defs: Json = {};
  const paths: Record<string, Json> = {};

  for (const ep of ENDPOINTS) {
    const errors = [...new Set([...ep.errors, 401, 403, 429])].sort((a, b) => a - b);
    const body = requestBody(ep, defs);
    const params = parameters(ep, defs);
    const op: Json = {
      operationId: ep.id,
      tags: [ep.tag],
      summary: ep.summary,
      description: `${ep.description}\n\nRequires the \`${ep.scope}\` scope. Counts toward the ${ep.bucket} rate limit.`,
      security: [{ bearerAuth: [ep.scope] }],
      ...(params.length ? { parameters: params } : {}),
      ...(body ? { requestBody: body } : {}),
      responses: {
        [String(ep.status)]: {
          description: "Success.",
          content: { "application/json": { schema: schemaOf(ep.response, "output", defs) } },
        },
        ...Object.fromEntries(errors.map((s) => [String(s), errorResponse(s)])),
      },
    };
    (paths[ep.path] ??= {})[ep.method.toLowerCase()] = op;
  }

  paths["/openapi.json"] = {
    get: {
      operationId: "get_openapi",
      tags: ["Meta"],
      summary: "This document",
      description: "The OpenAPI 3.1 description of this API. No token needed.",
      security: [],
      responses: { "200": { description: "The OpenAPI document.", content: { "application/json": { schema: { type: "object" } } } } },
    },
  };

  const doc: Json = {
    openapi: "3.1.0",
    info: { title: "Nest Deploy API", version: "1.0.0", description: DESCRIPTION },
    servers: [{ url: "/api/v1" }],
    tags: [...new Set(ENDPOINTS.map((e) => e.tag)), "Meta"].map((name) => ({ name })),
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: `A personal access token starting with ndp_. Scopes: ${SCOPES.map((s) => `${s} (${SCOPE_LABEL[s]})`).join("; ")}.`,
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: { code: { type: "string" }, message: { type: "string" } },
            },
          },
        },
        ...(defs as Record<string, Json>),
      },
    },
  };
  return relink(doc);
}
