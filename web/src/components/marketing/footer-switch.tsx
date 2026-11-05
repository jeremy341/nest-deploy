"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NestMark } from "@/components/nest-mark";
import { NEST_GUIDES_URL, REPO_URL } from "@/lib/site";

/**
 * The full marketing footer everywhere except the docs. Docs pages end with a
 * slim footer instead: a docs reader wants the next page, not four columns.
 * `full` is the server-rendered footer, so it is not duplicated in the client.
 */
export function FooterSwitch({ full }: { full: React.ReactNode }) {
  const pathname = usePathname();
  if (!pathname.startsWith("/docs")) return full;

  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-4 py-8 text-[14px] sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/" className="flex w-fit items-center gap-2 rounded-md">
          <NestMark className="size-5" />
          <span className="font-pixel text-[16px] leading-none font-semibold">Nest Deploy</span>
        </Link>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-muted-foreground">
          <Link href="/docs" className="hover:text-foreground">Docs home</Link>
          <Link href="/stats" className="hover:text-foreground">Stats</Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
            Source on GitHub<span className="sr-only"> (opens in a new tab)</span>
          </a>
          <a href={NEST_GUIDES_URL} target="_blank" rel="noreferrer" className="hover:text-foreground">
            Nest guides<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </nav>
        <p className="text-[12px] text-subtle-foreground">
          Not an official Hack Club product. The Nest team does not run it.
        </p>
      </div>
    </footer>
  );
}
