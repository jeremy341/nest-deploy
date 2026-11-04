import Link from "next/link";
import { StartTiles } from "./_components/start-tiles";
import { DOCS_NAV, docsHref, SUMMARIES } from "./_data/nav";

export const metadata = {
  title: "Docs",
  description:
    "How Nest Deploy works: connecting a Nest server, deploying from GitHub, environment variables, domains, monitoring, analytics, security and limits.",
};

/** The docs home: where to start, then every page by group. */
export default function DocsHome() {
  return (
    <article id="docs-article" tabIndex={-1} className="max-w-[860px] outline-none">
      <h1 className="font-pixel text-docs-h1 text-foreground max-sm:text-[44px] max-sm:leading-12">Docs</h1>
      <p className="mt-5 max-w-[56ch] text-docs-lead text-muted-foreground">
        Everything Nest Deploy does and how to use it, from connecting your Nest server to uptime alerts. If you
        only want the short version, start with the quick start.
      </p>
      <StartTiles />

      <div className="mt-16 space-y-12">
        {DOCS_NAV.map((g) => (
          <section key={g.group} aria-labelledby={`home-${g.group}`}>
            <h2 id={`home-${g.group}`} className="text-docs-h3 text-foreground">
              {g.group}
            </h2>
            <ul className="mt-4 grid gap-px border bg-border sm:grid-cols-2">
              {g.sections.map((s) => (
                <li key={s.id} className="bg-background">
                  <Link
                    href={docsHref(s.id)}
                    className="group lit-corner card-interactive block h-full bg-background p-4 transition-[box-shadow,scale] duration-(--dur-fast) ease-snappy hover:z-[2] focus-visible:z-[2] active:scale-[0.99]"
                  >
                    <span className="text-[15px] leading-[22px] font-semibold text-foreground">{s.title}</span>
                    <span className="mt-1 block text-[14px] leading-5 text-muted-foreground">{SUMMARIES[s.id]}</span>
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
