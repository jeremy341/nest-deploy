import { Suspense } from "react";
import { NewProjectFlow, type GithubState } from "@/components/new-project-flow";
import { NewProjectSkeleton } from "@/components/skeletons/new-project";
import { requireUser } from "@/server/auth/current";
import { config, githubConfigured } from "@/server/config";
import { userInstallations } from "@/server/github/app";
import { serverViews } from "@/server/queries";

export const metadata = { title: "New Project" };

const NOTICES: Record<string, string> = {
  connected: "GitHub is connected. Pick a repository below.",
  failed: "GitHub could not be connected. Try again.",
  invalid_state: "That GitHub link expired. Try again.",
  not_configured: "The GitHub App is not set up on this installation.",
};

type Props = { searchParams: Promise<{ github?: string }> };

export default function NewProjectPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<NewProjectSkeleton />}>
      <NewProjectContent searchParams={searchParams} />
    </Suspense>
  );
}

async function NewProjectContent({ searchParams }: Props) {
  const user = await requireUser();
  const { github: notice } = await searchParams;
  const [servers, installations] = await Promise.all([
    serverViews(user.id),
    githubConfigured() ? userInstallations(user.id) : Promise.resolve([]),
  ]);
  const c = config();

  const github: GithubState = {
    configured: githubConfigured(),
    installUrl: c.GITHUB_APP_SLUG
      ? `https://github.com/apps/${c.GITHUB_APP_SLUG}/installations/new`
      : null,
    installations: installations.map((i) => ({ id: i.id, account: i.accountLogin, type: i.accountType })),
    notice: notice ? (NOTICES[notice] ?? null) : null,
  };

  return (
    <NewProjectFlow
      servers={servers.map((s) => ({ id: s.id, nestUsername: s.nestUsername, status: s.status }))}
      github={github}
    />
  );
}
