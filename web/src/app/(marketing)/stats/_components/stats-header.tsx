import { cn } from "@/lib/utils";
import { WRAP } from "./layout";

export function StatsHeader() {
  return (
    <header className={cn(WRAP, "pt-14 pb-10 lg:pt-20 lg:pb-12")}>
      <h1 className="font-pixel text-docs-h1 text-foreground max-sm:text-[44px] max-sm:leading-12">Stats</h1>
      <p className="mt-5 max-w-[56ch] text-docs-lead text-muted-foreground">
        How much this installation gets used, in rounded totals: sign-ups, how deployments end, and what the work is made of. Recounted every few minutes.
      </p>
    </header>
  );
}
