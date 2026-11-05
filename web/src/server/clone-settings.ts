/**
 * Which project settings can be copied from another project.
 *
 * This is an allow-list on purpose: a field is only copied if it is named
 * here. Anything added to the projects table later is not copied by default.
 * Environment variables and secrets live in other tables; the deploy hook,
 * notification URL, port, repository and branch are columns of the project but
 * are never part of a copy.
 */
export const CLONE_FIELDS = [
  "runtime",
  "installCommand",
  "buildCommand",
  "startCommand",
  "outputDir",
  "rootDir",
  "healthPath",
] as const;

export type CloneField = (typeof CLONE_FIELDS)[number];

export type CloneSettings = {
  runtime: "node" | "python" | "static" | "command";
  installCommand: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  outputDir: string | null;
  rootDir: string;
  healthPath: string;
};

/** Pick only the allow-listed fields from a project row (or anything shaped like one). */
export function pickCloneSettings(source: Record<string, unknown> & CloneSettings): CloneSettings {
  const out: Record<string, unknown> = {};
  for (const field of CLONE_FIELDS) out[field] = source[field] ?? null;
  return out as CloneSettings;
}
