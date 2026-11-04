import { AccountProvider } from "@/components/account-context";
import { requireUser } from "@/server/auth/current";
import { projectViews, serverViews } from "@/server/queries";

/** Loads the signed-in user, their servers and projects for the shell. */
export async function AccountLoader({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [servers, projects] = await Promise.all([
    serverViews(user.id),
    projectViews(user.id),
  ]);

  return (
    <AccountProvider
      value={{
        user: { name: user.name },
        servers: servers.map((s) => ({
          id: s.id,
          nestUsername: s.nestUsername,
          host: s.host,
          status: s.status,
        })),
        projects: projects.map((p) => ({ slug: p.slug, name: p.name })),
      }}
    >
      {children}
    </AccountProvider>
  );
}
