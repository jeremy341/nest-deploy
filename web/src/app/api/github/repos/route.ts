import {
  assertInstallationOwned,
  GithubError,
  listInstallationRepos,
} from "@/server/github/app";
import { authed, handle, HttpError, ok } from "@/server/http";

export const GET = handle(async (req) => {
  const user = await authed();
  const id = Number(req.nextUrl.searchParams.get("installation"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, "installation is required", "validation");
  }
  try {
    await assertInstallationOwned(user.id, id);
    return ok({ repos: await listInstallationRepos(id) });
  } catch (err) {
    if (err instanceof GithubError) {
      throw new HttpError(err.status === 403 ? 403 : 502, err.message, "github");
    }
    throw err;
  }
});
