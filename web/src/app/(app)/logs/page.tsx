import { LogsView } from "@/components/logs-view";
import { PageHeader } from "@/components/page-header";
import { logs } from "@/lib/mock";

export const metadata = { title: "Logs" };

export default function LogsPage() {
  return (
    <>
      <PageHeader
        title="Logs"
        description="Build output and runtime messages from your projects."
      />
      <LogsView lines={logs} />
    </>
  );
}
