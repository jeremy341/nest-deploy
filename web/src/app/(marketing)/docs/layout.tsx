import { DocsMobileNav } from "./_components/docs-mobile-nav";
import { DocsNav } from "./_components/docs-nav";
import { LegacyHashRedirect } from "./_components/legacy-hash";

/**
 * The docs shell: the page list on the left (a bar on phones), one page on the
 * right. The reading band is opaque so the page grid never sits behind words.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-8 lg:pt-12">
      <LegacyHashRedirect />
      <div className="border-y bg-background">
        <DocsMobileNav />
        <div className="mx-auto grid w-full max-w-[1280px] gap-10 px-4 pt-10 pb-24 sm:px-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:pt-14 xl:gap-16">
          <aside className="hidden lg:block">
            <a
              href="#docs-article"
              className="sr-only focus:not-sr-only focus:mb-2 focus:block focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-[14px] focus:shadow-menu"
            >
              Skip to the article
            </a>
            <DocsNav />
          </aside>
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
