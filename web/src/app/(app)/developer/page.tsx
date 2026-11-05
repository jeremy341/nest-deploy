import { Suspense } from "react";
import { DeveloperDocs } from "@/components/developer-docs";
import { DeveloperTokens } from "@/components/developer-tokens";
import { PageHeader } from "@/components/page-header";
import { DeveloperSkeleton } from "@/components/skeletons/developer";
import { requireUser } from "@/server/auth/current";
import { SCOPES, SCOPE_LABEL } from "@/server/api-tokens";
import { config } from "@/server/config";

export const metadata = { title: "Developer" };

export default function DeveloperPage() {
  return (
    <Suspense fallback={<DeveloperSkeleton />}>
      <DeveloperContent />
    </Suspense>
  );
}

async function DeveloperContent() {
  await requireUser();
  const origin = new URL(config().APP_URL).origin;
  return (
    <div className="motion-enter mx-auto max-w-[760px]">
      <PageHeader title="Developer" description="Tokens and docs for scripts and AI agents that use the Nest Deploy API." />
      <div className="space-y-6">
        <DeveloperTokens scopes={SCOPES.map((id) => ({ id, label: SCOPE_LABEL[id] }))} />
        <DeveloperDocs origin={origin} />
      </div>
    </div>
  );
}
