import Link from "next/link";
import { PixelField } from "@/components/pixel-field";
import { buttonVariants } from "@/components/ui/button";
import { pixel } from "@/lib/fonts";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main
      className={cn(
        pixel.variable,
        "relative isolate flex min-h-[100dvh] flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-4 text-center"
      )}
    >
      <PixelField tone="mono" className="[mask-image:radial-gradient(ellipse_at_center,black_15%,transparent_70%)]" />
      {/* The same stepped wipe as the homepage headline: once, and not at all with reduced motion. */}
      <p className="hero-wipe font-pixel relative text-[clamp(5rem,14vw,9rem)] leading-none font-medium">
        404
      </p>
      <h1 className="relative text-[24px] leading-8 font-semibold tracking-[-0.025em]">
        This page could not be found
      </h1>
      <p className="relative -mt-2 max-w-[36ch] text-muted-foreground">
        The link may be old, or the page may have moved.
      </p>
      <div className="relative mt-2 flex flex-wrap justify-center gap-2">
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
