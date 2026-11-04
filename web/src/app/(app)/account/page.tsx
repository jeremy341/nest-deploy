import { cookies } from "next/headers";
import { AccountView } from "@/components/account-view";
import { Card } from "@/components/settings-ui";
import { PageHeader } from "@/components/page-header";
import { timeAgo } from "@/lib/status";
import { browserLabel, listInstallations, listSessions } from "@/server/account";
import { requireUser } from "@/server/auth/current";
import { SESSION_COOKIE } from "@/server/auth/session";

export const metadata = { title: "Account" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-3 py-2.5 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-label text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default async function AccountPage() {
  const user = await requireUser();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const [sessions, installations] = await Promise.all([
    listSessions(user.id, token),
    listInstallations(user.id),
  ]);

  return (
    <div className="motion-enter mx-auto max-w-[720px]">
      <PageHeader title="Account" description="Who you are signed in as, and where." />

      <div className="space-y-6">
        <Card
          id="profile-heading"
          title="Profile"
          description="This comes from your Hack Club account. Change it there."
        >
          <dl className="hairline-y overflow-hidden rounded-md shadow-border-base">
            <Row label="Name">{user.name}</Row>
            <Row label="Email">{user.email ?? "Not shared"}</Row>
          </dl>
        </Card>

        <Card
          id="github-heading"
          title="GitHub"
          description="Accounts where the Nest Deploy app is installed. Change which repositories it can read on GitHub."
        >
          {installations.length === 0 ? (
            <p className="text-muted-foreground">Not connected yet. Import a project to install the app.</p>
          ) : (
            <ul className="hairline-y overflow-hidden rounded-md shadow-border-base">
              {installations.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0 truncate font-medium">
                    {i.accountLogin}
                    <span className="ml-2 text-label font-normal text-muted-foreground">{i.accountType}</span>
                  </span>
                  <a
                    href={`https://github.com/settings/installations/${i.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="link inline-flex shrink-0 items-center text-label font-medium max-sm:min-h-10"
                  >
                    Manage on GitHub<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <AccountView
          name={user.name}
          sessions={sessions.map((s) => ({
            id: s.id,
            label: browserLabel(s.userAgent),
            started: timeAgo(s.createdAt),
            current: s.current,
          }))}
        />
      </div>
    </div>
  );
}
