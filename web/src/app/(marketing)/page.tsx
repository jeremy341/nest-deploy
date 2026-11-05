import Link from "next/link";
import { BuildLogs } from "@/components/build-logs";
import { DeploymentsView } from "@/components/deployments-view";
import { HeroLetters } from "@/components/marketing/hero-letters";
import { StepMarker, StepTrackLine } from "@/components/marketing/step-track";
import { TerminalCta } from "@/components/marketing/terminal-cta";
import { Reveal } from "@/components/motion/reveal";
import { curlExample, mcpConfigSnippet } from "@/lib/developer";
import { REPO_URL } from "@/lib/site";
import { SAMPLE_DEPLOYMENTS, SAMPLE_LOG } from "@/lib/sample";
import { cn } from "@/lib/utils";

export const metadata = {
  title: { absolute: "Nest Deploy: push to GitHub, live on your Nest" },
  description:
    "Nest Deploy builds your GitHub repo and runs it on your free Hack Club Nest container, with logs, rollbacks and branch previews.",
};

const wrap = "mx-auto w-full max-w-[1400px] px-6";
const h2 =
  "font-pixel max-w-[17ch] text-[clamp(2.1rem,4vw,3.5rem)] leading-[1.02] font-medium text-balance";
const pill =
  "inline-flex h-10 items-center rounded-full px-5 text-[14px] font-medium tracking-[-0.01em] transition-transform active:scale-[0.97]";
const section = "scroll-mt-14 py-16 lg:py-24";

/** A crosshair at a corner of the frame, as on vercel.com. */
function Plus({ className }: { className: string }) {
  return (
    <span aria-hidden="true" className={cn("absolute size-[13px]", className)}>
      <span className="absolute top-1/2 left-0 h-px w-full bg-foreground" />
      <span className="absolute top-0 left-1/2 h-full w-px bg-foreground" />
    </span>
  );
}

function Hero() {
  return (
    <section className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <div className={cn(wrap, "flex flex-1 flex-col items-center justify-center py-16 text-center")}>
        <h1 className="font-pixel mx-auto max-w-[12ch] text-[clamp(3.5rem,10.5vw,11rem)] leading-[0.92] font-medium text-balance">
          <HeroLetters text="Deploy to your Nest." />
        </h1>
        <p style={{ "--rise-delay": "0.95s" } as React.CSSProperties} className="hero-rise mx-auto mt-9 max-w-[46ch] text-[clamp(1.125rem,1.7vw,1.5rem)] leading-[1.5] text-muted-foreground text-balance">
          Push to GitHub and your app builds and goes live on your free Hack Club Nest container,
          with logs, rollbacks and previews.
        </p>
        <div style={{ "--rise-delay": "1.1s" } as React.CSSProperties} className="hero-rise mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/projects" className={cn(pill, "h-12 bg-foreground px-7 text-[15px] text-background")}>
            Start deploying
          </Link>
          <a
            href="#product"
            className={cn(pill, "shadow-border-base h-12 bg-background px-7 text-[15px] hover:bg-[var(--ds-gray-100)]")}
          >
            How it works
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * The hairline frame with crosshair corners and a header bar. `tag` is the
 * small note on the right of the bar ("Sample data", "Example").
 */
function Frame({ label, tag, children }: { label: string; tag: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <Plus className="-top-1.5 -left-1.5 z-10" />
      <Plus className="-top-1.5 -right-1.5 z-10" />
      <Plus className="-bottom-1.5 -left-1.5 z-10" />
      <Plus className="-right-1.5 -bottom-1.5 z-10" />
      <div className="overflow-hidden border bg-background">
        <div className="text-caption flex h-10 items-center justify-between gap-4 border-b px-4 font-mono font-normal text-muted-foreground">
          <span className="truncate">{label}</span>
          <span className="shrink-0">{tag}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * A headline and the real UI under it, with a short note beside it. `flip`
 * puts the note on the right. The frame's header bar says the data is sample
 * data, because it is.
 */
function Showcase({
  id,
  title,
  note,
  detail,
  frameLabel,
  flip = false,
  after,
  children,
}: {
  id?: string;
  title: string;
  /** The one thing to know, in larger type. */
  note: string;
  /** A second, quieter paragraph under the note. */
  detail: string;
  /** The name in the frame's header bar. */
  frameLabel: string;
  flip?: boolean;
  /** Notes that sit under the frame, in the same column. */
  after?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={section}>
      <Reveal
        className={cn(
          wrap,
          "grid gap-12 lg:gap-20",
          flip ? "lg:grid-cols-[minmax(0,1fr)_280px]" : "lg:grid-cols-[280px_minmax(0,1fr)]"
        )}
      >
        {/* Pinned to the top so the demo beside it can grow and shrink (collapsing the log,
            filtering the list) without moving this text. */}
        <div
          className={cn(
            "order-2 lg:row-start-1 lg:sticky lg:top-24 lg:self-start lg:pt-2",
            after && "lg:row-span-2",
            flip ? "lg:col-start-2" : "lg:col-start-1"
          )}
        >
          <p className="text-docs-lead text-reading max-w-[30ch]">{note}</p>
          <p className="text-body mt-5 max-w-[34ch] text-muted-foreground">{detail}</p>
        </div>
        <div className={cn("order-1 min-w-0 lg:row-start-1", flip ? "lg:col-start-1" : "lg:col-start-2")}>
          <h2 className={cn(h2, "max-w-[20ch]")}>{title}</h2>
          <div className="mt-12">
            <Frame label={frameLabel} tag="Sample data">
              {children}
            </Frame>
          </div>
        </div>
        {after && (
          <div className={cn("order-3 min-w-0 lg:row-start-2", flip ? "lg:col-start-1" : "lg:col-start-2")}>{after}</div>
        )}
      </Reveal>
    </section>
  );
}

const STEPS = [
  ["Sign in", "Log in with Hack Club. It confirms who you are and has no route to your container."],
  ["Add the key", "Copy the public key Nest Deploy makes for your server, paste it into the SSH Keys page of your Nest dashboard, then press Test connection."],
  ["Import the repo", "Install the GitHub app on a repository and pick it. Check the runtime, port and commands it detected, then press Deploy."],
];

/** Each step starts one stair lower than the last (wide screens only). */
const STAIR = ["", "md:mt-14", "md:mt-28"];

/**
 * Three steps drawn as a pixel staircase: a hairline over each step, a riser
 * down from the end of the last one, and a lit square where each begins. The
 * squares switch on one after another as the section arrives. On a phone the
 * steps simply stack.
 */
function Start() {
  return (
    <section id="start" className={section}>
      <Reveal className={wrap}>
        <h2 className={cn(h2, "max-w-[20ch]")}>Setup is one key and one repo.</h2>
        <p className="text-docs-lead text-reading mt-6 max-w-[48ch]">
          Do it once. After that, every push to your production branch deploys on its own.
        </p>
        <ol className="mt-16 grid md:mt-20 md:grid-cols-3">
          {STEPS.map(([title, text], i) => (
            <li key={title} className={cn("relative pt-8 pr-8 pb-2 max-md:pb-8", STAIR[i])}>
              <StepTrackLine />
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-14 left-0 hidden h-14 w-px bg-[var(--ds-gray-alpha-500)] md:block"
                />
              )}
              <StepMarker index={i} />
              <h3 className="font-pixel text-[24px] leading-none font-medium">{title}</h3>
              <p className="text-prose mt-4 max-w-[36ch] text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}

const RUNTIMES = [
  ["Node.js", "Reads your lockfile to choose npm, pnpm or yarn, then runs your build script if you have one.", "npm start"],
  ["Python", "Installs requirements.txt into a virtual environment on your Nest.", "python3 app.py"],
  ["Static site", "Builds if you have a build script, then serves the output folder you pick.", "a built-in file server"],
  ["Any command", "Skips detection. You write the install, build and start commands.", "your command"],
];

function Runtimes() {
  return (
    <section id="runtimes" className="scroll-mt-14 py-10 lg:py-16">
      <Reveal className={wrap}>
        <h2 className="font-pixel max-w-[30ch] text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.05] font-medium text-balance">
          It reads your repo and picks the commands.
        </h2>
        <div className="mt-10 border-y bg-background">
          <table className="w-full text-left max-md:block">
            <caption className="sr-only">What Nest Deploy runs for each kind of project</caption>
            <thead className="max-md:sr-only">
              <tr className="text-label border-b text-subtle-foreground">
                <th scope="col" className="w-[200px] px-6 py-3 font-normal">Runtime</th>
                <th scope="col" className="px-6 py-3 font-normal">Install and build</th>
                <th scope="col" className="w-[240px] px-6 py-3 font-normal">Starts with</th>
              </tr>
            </thead>
            <tbody className="max-md:block">
              {RUNTIMES.map(([name, text, start]) => (
                <tr key={name} className="border-b last:border-b-0 max-md:block max-md:px-4 max-md:py-5">
                  <th
                    scope="row"
                    className="font-pixel px-6 py-6 align-top text-[24px] leading-7 font-medium max-md:block max-md:p-0"
                  >
                    {name}
                  </th>
                  <td className="text-prose max-w-[52ch] px-6 py-6 align-top text-muted-foreground max-md:mt-2 max-md:block max-md:p-0">
                    {text}
                  </td>
                  <td className="px-6 py-6 align-top max-md:mt-3 max-md:block max-md:p-0">
                    <span className="text-label mr-2 text-subtle-foreground md:sr-only">Starts with</span>
                    <span className="inline-block bg-foreground px-2.5 py-1 font-mono text-[13px] leading-5 text-background">
                      {start}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-prose mt-6 max-w-[60ch] text-muted-foreground">
          No config file to write, and any step can be overridden in the project settings. Whichever it is, your app listens on the{" "}
          <code className="font-mono text-[0.9em] text-foreground">PORT</code> it is given, on{" "}
          <code className="font-mono text-[0.9em] text-foreground">0.0.0.0</code>.
        </p>
        <p className="text-prose mt-3 max-w-[60ch] text-muted-foreground">
          Your container&apos;s CPU, memory and disk are on the Resources page, over 24 hours or 7 days,
          with figures for each project.
        </p>
      </Reveal>
    </section>
  );
}

const TOKEN_SCOPES = [
  "projects:read",
  "deployments:read",
  "deployments:write",
  "logs:read",
  "domains:read",
  "resources:read",
];

/**
 * Tokens, the API and MCP. The frame shows the two setup snippets the
 * Developer page gives, with a placeholder token and host.
 */
function Agents() {
  const origin = "https://your-nest-deploy";
  const note = "border-t pt-5";
  const term = "font-pixel text-[21px] leading-6 font-medium";
  return (
    <section id="agents" className={section}>
      <Reveal className={wrap}>
        {/* Heading and notes in the left column, the snippets down the right. */}
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-x-20 lg:gap-y-14">
          <div className="lg:col-start-1 lg:row-start-1">
            <h2 className={cn(h2, "max-w-[16ch]")}>Give a script a token, not your password.</h2>
            <p className="text-docs-lead text-reading mt-6 max-w-[44ch]">
              Make an access token on the Developer page and tick only what the job needs. A script or an AI
              agent then works with your projects as that token, and nothing more.
            </p>
          </div>
          <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-3">
            <Frame label="API and MCP" tag="Example">
              <div className="space-y-6 p-4 sm:p-6">
                <div>
                  <p className="text-caption font-mono text-subtle-foreground">List your projects</p>
                  <pre
                    tabIndex={0}
                    role="region"
                    aria-label="curl example"
                    className="mt-2 overflow-x-auto py-1 font-mono text-[13px] leading-6"
                  >
                    {curlExample(origin).replace(" https://", " \\\n  https://")}
                  </pre>
                </div>
                <div>
                  <p className="text-caption font-mono text-subtle-foreground">Connect an AI agent</p>
                  <pre
                    tabIndex={0}
                    role="region"
                    aria-label="MCP client configuration"
                    className="mt-2 overflow-x-auto py-1 font-mono text-[13px] leading-6"
                  >
                    {mcpConfigSnippet(origin)}
                  </pre>
                </div>
              </div>
            </Frame>
          </div>
          <div className="space-y-8 lg:col-start-1 lg:row-start-2">
            <div className={note}>
              <h3 className={term}>Scopes and expiry</h3>
              <p className="text-prose mt-3 max-w-[48ch] text-muted-foreground">
                A token holds only the scopes you tick, from read-only access to deploys, and lasts 7, 30, 90 or 365
                days. You can rename it, change its scopes or revoke it at any time.
              </p>
              <ul className="text-caption mt-4 grid max-w-[30rem] grid-cols-2 gap-x-5 gap-y-1 font-mono text-foreground">
                {TOKEN_SCOPES.map((scope) => (
                  <li key={scope}>{scope}</li>
                ))}
              </ul>
            </div>
            <div className={note}>
              <h3 className={term}>An API and an MCP endpoint</h3>
              <p className="text-prose mt-3 max-w-[48ch] text-muted-foreground">
                The API lives under{" "}
                <code className="font-mono text-[0.9em] text-foreground">/api/v1</code>, and an{" "}
                <a href="/api/v1/openapi.json" className="link text-foreground font-medium">
                  OpenAPI description
                </a>{" "}
                lists every call. The MCP endpoint at{" "}
                <code className="font-mono text-[0.9em] text-foreground">/api/mcp</code> lets an AI agent list
                projects, deploy, read logs and check usage.
              </p>
            </div>
            <div className={note}>
              <h3 className={term}>What a token cannot do</h3>
              <p className="text-prose mt-3 max-w-[48ch] text-muted-foreground">
                It cannot remove leftovers, change container permissions, or manage your account, sessions or tokens.
                Those need you, signed in to the browser. Terminal and file access is only possible with those
                scopes, and such a token expires within 7 days.
              </p>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/** What else the app pages do, under the deployments demo. */
const PRODUCT_NOTES = [
  [
    "Find the one you want",
    "Search by commit, branch, author or pull request number. Filter by status, environment, project and time, and sort the list. The sample above keeps to the status filter.",
  ],
  [
    "Compare and clean up",
    "Pick two deployments to compare them side by side. Cancel builds, or delete old previews, in bulk.",
  ],
  [
    "See the whole container",
    "The Container page lists your projects, leftover services and folders with no project, and other processes listening on a port. A leftover is removed only after you confirm.",
  ],
  [
    "Read what changed",
    "Activity lists every change, with filters by kind and date and a readable detail for each entry. Secrets are hidden.",
  ],
];

function ProductNotes() {
  return (
    <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
      {PRODUCT_NOTES.map(([term, text]) => (
        <div key={term} className="border-t pt-5">
          <dt className="font-pixel text-[21px] leading-6 font-medium">{term}</dt>
          <dd className="text-prose mt-3 max-w-[44ch] text-muted-foreground">{text}</dd>
        </div>
      ))}
    </dl>
  );
}

const strong = "font-medium text-background";

/** The time limits on the terminal and file changes, as figures. */
const LIMITS = [
  ["5 min", "Turning the terminal or file changes on needs a Hack Club sign-in made this recently."],
  ["10 min", "An open terminal ends after this long without input."],
  ["60 min", "Or after this long in total, whichever comes first."],
];

/**
 * The one dark block on the page, because it is the one place we ask you to
 * trust us with something. The time limits are the real numbers from the code,
 * set large.
 */
function Security() {
  return (
    <section id="security" className="scroll-mt-14 bg-foreground py-20 text-background lg:py-32">
      <Reveal className={wrap}>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,600px)] lg:gap-20">
          <div>
            <h2 className={cn(h2, "max-w-[14ch]")}>The key can do what you can do.</h2>
            <p className="text-docs-lead mt-8 max-w-[40ch] text-background/85">
              SSH into Nest puts you in a root shell inside your own container, so the key we hold has the
              same reach. We say so before you add it.
            </p>
          </div>
          <div className="text-prose space-y-6 text-background/85 lg:pt-3">
            <p>
              Each server gets its own <span className={strong}>ed25519 key</span>, made for Nest Deploy and used
              for nothing else. It is encrypted with <span className={strong}>AES-256-GCM</span> before it reaches
              the database, and tied to your server so it cannot be moved. The first connection records
              Nest&apos;s host key, and if it ever changes we stop before sending anything.
            </p>
            <p>
              Your repo is built in a sandbox on our side, so your container&apos;s memory is for your app,
              and the source is deleted when the build ends. Environment variables are encrypted, masked in
              logs and never sent back to your browser. Sign-in is Hack Club Auth, which has no route to your
              container.
            </p>
            <p>
              The <span className={strong}>terminal</span> and <span className={strong}>file changes</span> are off for
              every server until you turn them on.
            </p>
            <ul className="space-y-3">
              {[
                "File changes can only touch the shared folder. The live release is read-only.",
                "An open terminal closes when you sign out or when its switch is turned off.",
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <span aria-hidden="true" className="mt-[11px] size-1.5 shrink-0 bg-background" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <ul className="mt-16 grid md:grid-cols-3 lg:mt-24">
          {LIMITS.map(([figure, text]) => (
            <li key={figure} className="relative border-t border-background/30 pt-8 pr-8 pb-2 max-md:pb-8">
              <span aria-hidden="true" className="absolute -top-[3.5px] left-0 block size-2 bg-background" />
              <p className="tabular font-mono text-[clamp(2.5rem,5vw,4rem)] leading-none font-medium tracking-[-0.05em]">{figure}</p>
              <p className="text-prose mt-4 max-w-[30ch] text-background/85">{text}</p>
            </li>
          ))}
        </ul>

        <div className="mt-12 flex flex-col gap-4 border-t border-background/30 pt-8 sm:flex-row sm:items-baseline sm:justify-between sm:gap-12">
          <p className={cn(strong, "text-prose max-w-[52ch]")}>
            To take access back, delete the key in your Nest dashboard. It ends at once, and your apps keep
            running.
          </p>
          <Link
            href="/docs#security"
            className="link inline-flex shrink-0 items-center py-2 text-[14px] font-medium text-background decoration-background/60! hover:decoration-background! max-sm:py-2.5"
          >
            Security notes in the docs
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

const FAQ: [string, React.ReactNode][] = [
  ["Is it free?", "Yes. Nest is free and so is this. Your limits are your container's own: 2 vCPU, 2 GB of memory and 16 GB of disk by default."],
  ["Is it an official Hack Club product?", "No. It is an independent project by a Hack Club member. The Nest team does not run it."],
  ["Does it work with private repositories?", "Yes. Nest Deploy reads whatever repositories you give the GitHub app access to, and only those."],
  ["Can I use my own domain?", "Yes, with one manual step. Nest maps domains to ports on its own dashboard and has no API for it, so we show you what to enter and check your DNS."],
  ["Does it run databases?", "No. It deploys your app. If you need a database, run one in your Nest container yourself and point the app at it with an environment variable."],
  ["Can an AI agent use it?", "Yes. Make an access token with only the permissions the job needs and point the agent at the MCP endpoint, so it can list projects, deploy, read logs and check usage. A token cannot remove leftovers or change permissions. With the terminal or file scopes it can open a terminal or change files, for 7 days at most."],
  ["Can it change my files or open a terminal?", "Only after you turn that on for a server and confirm with a fresh Hack Club sign-in. Both start off. A token gets either only if you grant its scope, and such a token expires within 7 days."],
  [
    "Where are the numbers on /stats from?",
    <>
      From this installation&apos;s own records, as rounded totals, with anything under 10 shown as
      &ldquo;fewer than 10&rdquo;. Nothing on the{" "}
      <Link href="/stats" className="link text-foreground font-medium">
        stats page
      </Link>{" "}
      identifies a person or a project.
    </>,
  ],
];

/**
 * One native details element per question: it opens and closes with the
 * keyboard and without scripts. The height eases open where the browser
 * supports it (see .faq in globals.css).
 */
function Faq() {
  return (
    <section id="faq" className={section}>
      <Reveal className={cn(wrap, "grid gap-12 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-20")}>
        <div>
          <h2 className="font-pixel text-[clamp(2rem,3vw,2.75rem)] leading-none font-medium">Questions</h2>
          <p className="text-prose mt-5 max-w-[26ch] text-muted-foreground">
            Anything else is in the{" "}
            <Link href="/docs" className="link text-foreground font-medium">
              docs
            </Link>
            .
          </p>
        </div>
        <div className="faq divide-y border bg-background">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>
                <span className="text-body-lg font-medium">{q}</span>
                <span aria-hidden="true" className="faq-icon" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function Cta() {
  return (
    <section>
      <div className={cn(wrap, "py-24 lg:py-36")}>
        <Reveal className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:items-center lg:gap-20">
          <div>
            <h2 className="font-pixel max-w-[18ch] text-[clamp(2.75rem,6vw,5rem)] leading-[0.95] font-medium">
              Connect your Nest and push.
            </h2>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-1">
              <Link
                href="/projects"
                className={cn(
                  pill,
                  "mr-1 bg-foreground text-background transition-[transform,background-color] duration-(--dur-fast) ease-snappy hover:bg-[color-mix(in_oklab,var(--foreground)_86%,var(--background))]"
                )}
              >
                Start deploying
              </Link>
              <Link href="/docs" className="link inline-flex items-center py-2 text-[14px] font-medium max-sm:py-2.5">
                Read the docs
              </Link>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="link inline-flex items-center py-2 text-[14px] font-medium max-sm:py-2.5"
              >
                View the source
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </div>
          <TerminalCta />
        </Reveal>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />

      <Showcase
        id="product"
        title="Every push becomes a release."
        frameLabel="Deployments"
        note="Push to main and it goes to production. Any other branch builds a preview on its own port, from 20000."
        detail="Production keeps your last five releases. Rolling back switches a symlink and restarts the service, so it takes seconds."
        after={<ProductNotes />}
      >
        {/* On a phone the demo is too narrow for commit and branch, so those drop out. */}
        <div className="p-3 sm:p-6 max-sm:[&_p.font-mono]:hidden">
          <DeploymentsView deployments={SAMPLE_DEPLOYMENTS} showProject={false} demo />
        </div>
      </Showcase>

      <Start />

      <Runtimes />

      <Agents />

      <Showcase
        flip
        title="A failed deploy puts the old release back."
        frameLabel="pixel-garden / a08c6f1"
        note="Nest Deploy waits for your app to answer on its port. If it never does, the previous release is put back."
        detail="Build output streams to this page as it happens. Runtime logs come from your app's systemd service. Show the last hour, day or week, only warnings and errors, search them, or download them as a text file."
      >
        <div className="p-4 sm:p-6">
          <BuildLogs deploymentId="sample" initialLines={SAMPLE_LOG} rawState="error" duration="48s" />
        </div>
      </Showcase>

      <Security />
      <Faq />
      <Cta />
    </>
  );
}
