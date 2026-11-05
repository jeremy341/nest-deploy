import Link from "next/link";
import { StartTiles } from "./_components/start-tiles";
import { DOCS_NAV, docsHref, SUMMARIES } from "./_data/nav";

export const metadata = {
  title: "Docs",
  description:
    "How Nest Deploy works: connecting a Nest server, deploying from GitHub, environment variables, domains, monitoring, analytics, security and limits.",
};

/** The docs home: where to start, then every page, listed like a table of contents. */
export default function DocsHome() {
  return (
    <article id="docs-article" tabIndex={-1} className="max-w-[860px] outline-none">
      <h1 className="font-pixel text-docs-h1 text-foreground max-sm:text-[44px] max-sm:leading-12">Docs</h1>
      <p className="mt-5 max-w-[56ch] text-docs-lead text-muted-foreground">
        How to connect your Nest server, deploy to it and keep an eye on it. In a hurry? Start with the quick
        start.
      </p>
      <StartTiles />

      <div className="mt-16 space-y-10">
        {DOCS_NAV.map((g) => (
          <section
            key={g.group}
            aria-labelledby={`home-${g.group}`}
            className="grid gap-3 border-t pt-5 sm:grid-cols-[148px_minmax(0,1fr)] sm:gap-8"
          >
            <h2 id={`home-${g.group}`} className="text-docs-h3 text-foreground">
              {g.group}
            </h2>
            <ul>
              {g.sections.map((s) => (
                <li key={s.id}>
                  <Link
                    href={docsHref(s.id)}
                    className="group relative -mx-3 grid gap-0.5 rounded-sm px-3 py-2.5 transition-colors duration-(--dur-fast) hover:bg-[var(--ds-gray-alpha-100)] max-sm:py-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-4"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 left-1 size-1.5 -translate-y-1/2 bg-[var(--pixel-lit)] opacity-0 [transition:opacity_var(--dur-fast)_steps(1,end)] group-hover:opacity-100 group-focus-visible:opacity-100"
                    />
                    <span className="text-[15px] leading-6 font-semibold text-foreground">{s.title}</span>
                    <span className="text-[14px] leading-6 text-muted-foreground">{SUMMARIES[s.id]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}
