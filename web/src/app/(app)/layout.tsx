import { Suspense } from "react";
import "@/components/dashboard.css";
import { AccountLoader } from "@/components/account-loader";
import { FindProvider } from "@/components/find-palette";
import { MobileDock } from "@/components/mobile-dock";
import { NavListSkeleton } from "@/components/nav-list";
import { Sidebar } from "@/components/sidebar";
import { TopBar, TopBarSkeleton } from "@/components/top-bar";
import {
  LoadingRegion,
  Skeleton,
  SkeletonCard,
  SkeletonPageHeader,
} from "@/components/ui/skeleton";

/** What shows while the account loads: the frame with no data, same sizes as the real one. */
function ShellSkeleton() {
  return (
    <LoadingRegion label="Loading…" className="flex min-h-dvh">
      <aside
        aria-hidden="true"
        className="sticky top-0 hidden h-dvh w-[var(--sidebar-width)] shrink-0 flex-col border-r bg-background-subtle lg:flex"
      >
        <div className="flex h-[var(--topbar-height)] shrink-0 items-center gap-1 border-b px-2">
          <div className="flex size-8 shrink-0 items-center justify-center">
            <Skeleton className="size-5 rounded-sm" />
          </div>
          <Skeleton className="h-9 flex-1" />
        </div>
        <div className="p-2 pb-0">
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex-1 p-2 pt-3">
          <NavListSkeleton />
        </div>
        <div className="flex flex-col gap-0.5 border-t p-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-8 items-center gap-2.5 px-2">
              <Skeleton className="size-4 rounded-sm" />
              <Skeleton className="h-3 w-24 rounded-sm" />
            </div>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBarSkeleton />
        <div className="mx-auto w-full max-w-[var(--page-width)] flex-1 px-4 py-6 pb-28 lg:px-6 lg:pb-10">
          <SkeletonPageHeader description />
          <SkeletonCard header className="h-64" />
        </div>
      </div>
      <div
        aria-hidden="true"
        className="shadow-menu fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 h-11 w-[150px] -translate-x-1/2 rounded-xl bg-background lg:hidden"
      />
    </LoadingRegion>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AccountLoader>
        <FindProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-(--z-skip) focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow-menu"
          >
            Skip to content
          </a>
          <div data-app-content="" className="flex min-h-dvh">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Suspense fallback={<TopBarSkeleton />}>
                <TopBar />
              </Suspense>
              <main
                id="main"
                className="mx-auto w-full max-w-[var(--page-width)] flex-1 px-4 py-6 pb-28 lg:px-6 lg:pb-10"
              >
                {children}
              </main>
            </div>
          </div>
          <MobileDock />
        </FindProvider>
      </AccountLoader>
    </Suspense>
  );
}
