import { Suspense } from "react";
import { FindProvider } from "@/components/find-palette";
import { MobileDock } from "@/components/mobile-dock";
import { Sidebar } from "@/components/sidebar";
import { TopBar, TopBarSkeleton } from "@/components/top-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
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
  );
}
