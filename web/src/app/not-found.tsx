import Link from "next/link";
import { PixelField } from "@/components/pixel-field";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-[100dvh] flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-4 text-center">
      <PixelField tone="mono" className="[mask-image:radial-gradient(ellipse_at_center,black_15%,transparent_70%)]" />
      <p className="relative font-mono text-[13px] text-muted-foreground">404</p>
      <h1 className="relative text-2xl font-semibold tracking-[-0.03em]">
        This page could not be found
      </h1>
      <div className="relative mt-2 flex gap-2">
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "px-3")}>
          Back to home
        </Link>
        <Link href="/projects" className={cn(buttonVariants(), "px-3")}>
          Open the dashboard
        </Link>
      </div>
    </main>
  );
}
