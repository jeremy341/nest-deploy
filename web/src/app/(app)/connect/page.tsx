import { ConnectFlow } from "@/components/connect-flow";
import { requireUser } from "@/server/auth/current";
import { serverViews } from "@/server/queries";

export const metadata = { title: "Connect a server" };

export default async function ConnectPage() {
  const user = await requireUser();
  return <ConnectFlow servers={await serverViews(user.id)} />;
}
