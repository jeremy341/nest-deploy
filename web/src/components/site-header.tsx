import Link from "next/link";
import { NavTabs } from "@/components/nav-tabs";
import { NestMark } from "@/components/nest-mark";
import { ServerSwitcher } from "@/components/server-switcher";
import { UserMenu } from "@/components/user-menu";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-2 px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Nest Deploy home"
          className="rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <NestMark className="size-6" />
        </Link>
        <span aria-hidden="true" className="text-xl font-light text-border">
          /
        </span>
        <ServerSwitcher />
        <div className="ml-auto flex items-center gap-3">
          <a
            href="https://guides.hackclub.app"
            target="_blank"
            rel="noreferrer"
            className="hidden text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Nest guides
          </a>
          <UserMenu />
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1200px] px-3 sm:px-5">
        <NavTabs />
      </div>
    </header>
  );
}
