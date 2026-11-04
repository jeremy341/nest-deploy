import Link from "next/link";
import { NestMark } from "@/components/nest-mark";
import { PixelField } from "@/components/pixel-field";
import { ThemeToggle } from "@/components/theme-toggle";
import { NEST_GUIDES_URL, REPO_URL } from "@/lib/site";

const NAV = [
  { href: "#product", label: "Product" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
];

const small =
  "inline-flex h-8 items-center rounded-md px-2.5 text-[13px] font-medium tracking-[-0.01em] transition-colors active:scale-[0.97]";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PixelField fixed autoDrops cell={16} />
      <a
        href="#top"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow-menu"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-50 bg-background-subtle/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-8 px-6">
          <Link href="/" aria-label="Nest Deploy, home" className="flex items-center gap-2 rounded-md outline-offset-4">
            <NestMark className="size-6" />
            <span className="text-[15px] font-semibold tracking-[-0.03em]">Nest Deploy</span>
          </Link>

          <nav aria-label="Page sections" className="hidden items-center gap-6 md:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="text-[14px] text-muted-foreground transition-colors hover:text-foreground">
                {n.label}
              </a>
            ))}
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-[14px] text-muted-foreground transition-colors hover:text-foreground">
              GitHub
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link href="/login" className={`${small} hidden text-muted-foreground hover:text-foreground sm:inline-flex`}>
              Log in
            </Link>
            <Link href="/projects" className={`${small} shadow-border-base bg-background hover:bg-[var(--ds-gray-100)]`}>
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {children}
      </main>

      <footer className="border-t">
        <div className="mx-auto grid max-w-[1400px] gap-12 px-6 py-16 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <NestMark className="size-6" />
              <span className="text-[15px] font-semibold tracking-[-0.03em]">Nest Deploy</span>
            </Link>
            <p className="mt-4 max-w-[36ch] text-[14px] leading-6 text-muted-foreground">
              Made by a Hack Club member. Not an official Hack Club product; the Nest team does
              not run it.
            </p>
          </div>
          <nav aria-label="Product" className="flex flex-col gap-3 text-[14px]">
            <p className="font-medium">Product</p>
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="w-fit text-muted-foreground hover:text-foreground">
                {n.label}
              </a>
            ))}
          </nav>
          <nav aria-label="Resources" className="flex flex-col gap-3 text-[14px]">
            <p className="font-medium">Resources</p>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="w-fit text-muted-foreground hover:text-foreground">
              Source on GitHub
            </a>
            <a href={NEST_GUIDES_URL} target="_blank" rel="noreferrer" className="w-fit text-muted-foreground hover:text-foreground">
              Nest guides
            </a>
          </nav>
          <nav aria-label="Account" className="flex flex-col gap-3 text-[14px]">
            <p className="font-medium">Account</p>
            <Link href="/login" className="w-fit text-muted-foreground hover:text-foreground">
              Log in
            </Link>
            <Link href="/projects" className="w-fit text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <div className="mt-1">
              <ThemeToggle />
            </div>
          </nav>
        </div>
      </footer>
    </>
  );
}
