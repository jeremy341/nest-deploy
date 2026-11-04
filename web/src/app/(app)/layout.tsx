import { Suspense } from "react";
import { AccountLoader } from "@/components/account-loader";
import { FindProvider } from "@/components/find-palette";
import { MobileDock } from "@/components/mobile-dock";
import { Sidebar } from "@/components/sidebar";
import { TopBar, TopBarSkeleton } from "@/components/top-bar";

/** What shows while the account loads: the frame, no data. */
function ShellSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex min-h-dvh">
      <div className="hidden w-[var(--sidebar-width)] shrink-0 border-r bg-background-subtle lg:block" />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBarSkeleton />
        <div className="mx-auto w-full max-w-[var(--page-width)] flex-1 px-4 py-6 lg:px-6">
          <div className="skeleton-sweep h-9 w-56 rounded-md" />
          <div className="skeleton-sweep mt-6 h-64 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AccountLoader>
        <FindProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[400] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow-menu"
          >
            Skip to content
          </a>
          <div className="flex min-h-dvh">
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
