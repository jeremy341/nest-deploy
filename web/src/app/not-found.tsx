import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-mono text-[13px] text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">This page could not be found</h1>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Back to projects
      </Link>
    </main>
  );
}
