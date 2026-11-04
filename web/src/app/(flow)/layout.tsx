import { Suspense } from "react";
import Link from "next/link";
import { AccountLoader } from "@/components/account-loader";
import { NestMark } from "@/components/nest-mark";
import { ServerSwitcher } from "@/components/server-switcher";
import { Button } from "@/components/ui/button";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";

/** Full-width flows (import a project) have no sidebar, as on Vercel. */
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <LoadingRegion label="Loading…" className="min-h-dvh">
          <div
            aria-hidden="true"
            className="flex h-[var(--topbar-height)] items-center gap-3 border-b bg-background-subtle px-4 lg:px-6"
          >
            <Skeleton className="size-10" />
            <Skeleton className="h-9 w-56 max-w-[60%]" />
            <Skeleton className="ml-auto h-8 w-20 max-sm:h-10" />
          </div>
        </LoadingRegion>
      }
    >
      <AccountLoader>
        <div className="flex min-h-dvh flex-col">
          <header className="relative flex h-[var(--topbar-height)] shrink-0 items-center gap-3 border-b bg-background-subtle px-4 lg:px-6">
            <Link
              href="/projects"
              aria-label="Nest Deploy home"
              className="flex size-10 shrink-0 items-center justify-center rounded-md transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)]"
            >
              <NestMark className="size-6" />
            </Link>
            <div className="w-56 max-w-[50%]">
              <ServerSwitcher />
            </div>
            <p className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 font-medium tracking-[-0.02em] md:block">
              New Project
            </p>
            <Button
              variant="ghost"
              className="ml-auto"
              render={<Link href="/projects" />}
            >
              Cancel
            </Button>
          </header>
          <main id="main" className="flex-1 px-4 py-10 sm:py-14">
            {children}
          </main>
        </div>
      </AccountLoader>
    </Suspense>
  );
}
