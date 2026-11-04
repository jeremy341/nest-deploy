import Link from "next/link";
import { GithubLogoIcon } from "@phosphor-icons/react/dist/ssr";
import { NestMark } from "@/components/nest-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { REPO_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#what", label: "What it is" },
  { href: "#how", label: "How it works" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
];

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <NestMark className="size-7" />
      <span className="font-[family-name:var(--font-pixel)] text-[19px] leading-none font-bold tracking-[0.01em] whitespace-nowrap">
        Nest Deploy
      </span>
    </span>
  );
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#top"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow-menu"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-5 sm:px-8">
          <Link href="/" aria-label="Nest Deploy, home" className="rounded-md outline-offset-4">
            <Wordmark />
          </Link>

          <nav aria-label="Page sections" className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="rounded-md px-3 py-2 font-medium tracking-[-0.02em] text-muted-foreground transition-colors hover:text-foreground"
              >
                {n.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Nest Deploy on GitHub"
              className="hidden size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground sm:flex"
            >
              <GithubLogoIcon className="size-5" />
            </a>
            <span className="hidden sm:block">
              <ThemeToggle />
            </span>
            <Link
              href="/login"
              className="hidden px-3 py-2 font-medium tracking-[-0.02em] text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Log in
            </Link>
            <Link
              href="/projects"
              className={cn(buttonVariants({ variant: "brand" }), "h-9 px-3.5 active:scale-[0.97]")}
            >
              <span className="sm:hidden">Dashboard</span>
              <span className="hidden sm:inline">Open dashboard</span>
            </Link>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {children}
      </main>

      <footer className="border-t">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-[38ch] text-muted-foreground">
              A dashboard for Hack Club Nest. Made by a Hack Club member. It is not an official
              Hack Club product and the Nest team does not run it.
            </p>
          </div>
          <nav aria-label="Footer, product" className="flex flex-col gap-2.5">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="w-fit text-muted-foreground hover:text-foreground">
                {n.label}
              </a>
            ))}
          </nav>
          <nav aria-label="Footer, links" className="flex flex-col gap-2.5">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="w-fit text-muted-foreground hover:text-foreground">
              Source on GitHub
            </a>
            <a href="https://guides.hackclub.app" target="_blank" rel="noreferrer" className="w-fit text-muted-foreground hover:text-foreground">
              Nest guides
            </a>
            <Link href="/login" className="w-fit text-muted-foreground hover:text-foreground">
              Log in
            </Link>
            <div className="mt-2 sm:hidden">
              <ThemeToggle />
            </div>
          </nav>
        </div>
      </footer>
    </>
  );
}
