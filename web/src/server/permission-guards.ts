import { assertAllowed, getPermissions, type ContainerPermission } from "@/server/permissions";
import { getProjectForUser } from "@/server/projects";

/**
 * Route-level checks for the per-server switches. Ownership comes first (404),
 * then the switch (403), so a refused request never reaches SSH and never
 * reveals whether someone else's project exists.
 */

/** Load the user's project and require this feature to be on for its server. */
export async function requireProjectFeature(userId: string, projectId: string, feature: ContainerPermission) {
  const project = await getProjectForUser(userId, projectId);
  assertAllowed(await getPermissions(userId, project.serverId), feature);
  return project;
}

/** Require this feature to be on for one of the user's servers. */
export async function requireServerFeature(userId: string, serverId: string, feature: ContainerPermission) {
  assertAllowed(await getPermissions(userId, serverId), feature);
}
