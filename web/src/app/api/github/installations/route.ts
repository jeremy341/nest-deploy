import { githubConfigured, config } from "@/server/config";
import { userInstallations } from "@/server/github/app";
import { authed, handle, ok } from "@/server/http";

export const GET = handle(async () => {
  const user = await authed();
  const c = config();
  return ok({
    configured: githubConfigured(),
    installUrl: c.GITHUB_APP_SLUG
      ? `https://github.com/apps/${c.GITHUB_APP_SLUG}/installations/new`
      : null,
    installations: (await userInstallations(user.id)).map((i) => ({
      id: i.id,
      account: i.accountLogin,
      type: i.accountType,
    })),
  });
});
