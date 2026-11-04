import Link from "next/link";
import { NestMark } from "@/components/nest-mark";
import { ServerSwitcher } from "@/components/server-switcher";

/** Full-width flows (import a project) have no sidebar, as on Vercel. */
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-[var(--topbar-height)] shrink-0 items-center gap-3 border-b px-4 lg:px-6">
        <Link
          href="/"
          aria-label="Nest Deploy home"
          className="rounded-md p-1"
        >
          <NestMark className="size-6" />
        </Link>
        <div className="w-56 max-w-[60%]">
          <ServerSwitcher />
        </div>
        <p className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 font-medium tracking-[-0.02em] sm:block">
          New Project
        </p>
      </header>
      <main id="main" className="flex-1 px-4 py-10 sm:py-14">
        {children}
      </main>
    </div>
  );
}
