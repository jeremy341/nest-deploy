/**
 * Pure helpers for the per-server container permissions: the switch names,
 * their plain-language descriptions, the defaults, and the typed confirmation
 * for turning the terminal on. No server or browser code, so it is safe to
 * import anywhere and easy to test.
 *
 * The server enforces these switches. The UI only hides or disables what is
 * off, and says so.
 */

export type ContainerPermissions = {
  terminal: boolean;
  fileWrites: boolean;
  orphanRemoval: boolean;
};

export type PermissionKey = keyof ContainerPermissions;

/** Order the switches are shown in. */
export const PERMISSION_KEYS: readonly PermissionKey[] = ["terminal", "fileWrites", "orphanRemoval"];

/** The terminal is a root shell, so it is off until the owner turns it on. */
export const DEFAULT_PERMISSIONS: Readonly<ContainerPermissions> = {
  terminal: false,
  fileWrites: true,
  orphanRemoval: true,
};

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  terminal: "Terminal",
  fileWrites: "File changes",
  orphanRemoval: "Removing leftovers",
};

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  terminal:
    "A shell on your container, running as root. Off by default. Anyone with access to your Nest Deploy account can use it while it is on.",
  fileWrites:
    "Create, edit, rename, delete and upload files in each project's folder. On by default.",
  orphanRemoval:
    "Stop and remove services and folders that no project uses any more. On by default. Removal still asks you to confirm each time.",
};

/** Words for the visible state next to a switch (never colour alone). */
export const PERMISSION_STATE: Record<"on" | "off", string> = { on: "On", off: "Off" };

/** Shown where a feature is off. */
export const OFF_MESSAGES: Record<PermissionKey, string> = {
  terminal: "The terminal is turned off for this server.",
  fileWrites: "Changes are turned off for this server.",
  orphanRemoval: "Removing leftovers is turned off for this server.",
};

/** Where the switches live. The id is the heading of the Account section. */
export const PERMISSIONS_HREF = "/account#container-permissions-heading";

/**
 * Turn whatever came back (a row, a JSON body, nothing) into a full set of
 * switches. Anything that is not a real boolean falls back to the default, so
 * a failed or partial read never turns the terminal on.
 */
export function normalizePermissions(raw: unknown): ContainerPermissions {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pick = (key: PermissionKey): boolean =>
    typeof src[key] === "boolean" ? (src[key] as boolean) : DEFAULT_PERMISSIONS[key];
  return { terminal: pick("terminal"), fileWrites: pick("fileWrites"), orphanRemoval: pick("orphanRemoval") };
}

/** Run a loader and return its permissions, or the defaults if it throws. */
export async function permissionsOrDefault(load: () => Promise<unknown>): Promise<ContainerPermissions> {
  try {
    return normalizePermissions(await load());
  } catch {
    return { ...DEFAULT_PERMISSIONS };
  }
}

export type TypedConfirm = {
  /** What the person has to type (the server's Nest username). */
  expected: string;
  /**
   * True when `typed` is the expected text. Exact match only: the case must be
   * the same and nothing may be added or missing. The only leniency is spaces,
   * tabs or line breaks at the very start and end of what was typed.
   */
  matches: (typed: string) => boolean;
};

/** The typed confirmation for turning the terminal on for one server. */
export function typedConfirmFor(serverName: string): TypedConfirm {
  const expected = serverName.trim();
  return {
    expected,
    // An empty name must never be satisfied by an empty field.
    matches: (typed) => expected.length > 0 && typed.trim() === expected,
  };
}
