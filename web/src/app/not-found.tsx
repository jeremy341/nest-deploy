import Link from "next/link";
import { PixelField } from "@/components/pixel-field";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="relative isolate flex min-h-[100dvh] flex-1 flex-col items-center justify-center gap-5 overflow-hidden px-4 text-center">
      <PixelField className="[mask-image:radial-gradient(ellipse_at_center,black_15%,transparent_72%)]" />
      <p
        aria-hidden="true"
        className="relative font-[family-name:var(--font-pixel)] text-[clamp(5rem,18vw,10rem)] leading-none font-bold text-brand"
      >
        404
      </p>
      <h1 className="relative text-2xl font-semibold tracking-[-0.03em]">
        This page could not be found
      </h1>
      <p className="relative max-w-[40ch] text-muted-foreground">
        It may have moved, or the link may be wrong. The pixels are still clickable, though.
      </p>
      <div className="relative flex gap-2">
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "px-3")}>
          Back to home
        </Link>
        <Link href="/projects" className={cn(buttonVariants({ variant: "brand" }), "px-3")}>
          Open the dashboard
        </Link>
      </div>
    </main>
  );
}
