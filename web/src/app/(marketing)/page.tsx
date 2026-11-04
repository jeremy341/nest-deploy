import Link from "next/link";
import { BuildLogs } from "@/components/build-logs";
import { DeploymentsView } from "@/components/deployments-view";
import { StepMarker, StepTrackLine } from "@/components/marketing/step-track";
import { TerminalCta } from "@/components/marketing/terminal-cta";
import { Reveal } from "@/components/motion/reveal";
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
const section = "scroll-mt-14 py-20 lg:py-28";

/** A small square, the same shape as the pixels in the background. */
function Square() {
  return <span aria-hidden="true" className="mt-[0.55em] size-[7px] shrink-0 bg-foreground" />;
}

/** A crosshair at a corner of the frame, as on vercel.com. */
function Plus({ className }: { className: string }) {
  return (
    <span aria-hidden="true" className={cn("absolute size-[13px]", className)}>
      <span className="absolute top-1/2 left-0 h-px w-full bg-foreground" />
      <span className="absolute top-0 left-1/2 h-full w-px bg-foreground" />
    </span>
  );
}

/** An opaque, hairline-framed block with a crosshair on each corner. */
function Framed({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="relative">
      <Plus className="-top-1.5 -left-1.5 z-10" />
      <Plus className="-top-1.5 -right-1.5 z-10" />
      <Plus className="-bottom-1.5 -left-1.5 z-10" />
      <Plus className="-right-1.5 -bottom-1.5 z-10" />
      <div className={cn("border bg-background", className)}>{children}</div>
    </div>
  );
}

function Hero() {
  return (
    <section className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <div className={cn(wrap, "flex flex-1 flex-col items-center justify-center py-16 text-center")}>
        <h1 className="hero-wipe font-pixel mx-auto max-w-[12ch] text-[clamp(3.5rem,10.5vw,11rem)] leading-[0.92] font-medium text-balance">
          Deploy to your Nest.
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
 * A short note and a feature list beside a headline and the real UI. `flip`
 * puts the note on the right. The frame has a header bar naming what is inside.
 */
function Showcase({
  id,
  note,
  features,
  title,
  frameLabel,
  flip = false,
  children,
}: {
  id?: string;
  note: string;
  features: string[];
  title: string;
  /** The name in the frame's header bar. */
  frameLabel: string;
  flip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={section}>
      <Reveal
        className={cn(
          wrap,
          "grid gap-12 lg:gap-20",
          flip ? "lg:grid-cols-[minmax(0,1fr)_260px]" : "lg:grid-cols-[260px_minmax(0,1fr)]"
        )}
      >
        {/* Pinned to the top so the demo beside it can grow and shrink (collapsing the log,
            filtering the list) without moving this text. */}
        <div className={cn("order-2 lg:sticky lg:top-24 lg:self-start lg:pt-2", flip ? "lg:order-2" : "lg:order-1")}>
          <p className="max-w-[28ch] text-[18px] leading-7">{note}</p>
          <p className="font-pixel mt-10 text-[16px] text-muted-foreground">Features</p>
          <ul className="mt-3 space-y-2 text-[14px]">
            {features.map((f) => (
              <li key={f} className="flex gap-2.5">
                <Square />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <div className={cn("order-1 min-w-0", flip ? "lg:order-1" : "lg:order-2")}>
          <h2 className={h2}>{title}</h2>
          <div className="relative mt-12">
            <Plus className="-top-1.5 -left-1.5 z-10" />
            <Plus className="-top-1.5 -right-1.5 z-10" />
            <Plus className="-bottom-1.5 -left-1.5 z-10" />
            <Plus className="-right-1.5 -bottom-1.5 z-10" />
            <div className="overflow-hidden border bg-background">
              <div className="flex h-10 items-center border-b px-4 font-mono text-[12px] text-muted-foreground">
                {frameLabel}
              </div>
              {children}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

const RUNTIMES = [
  ["Node.js", "Reads your lockfile to pick npm, pnpm or yarn, runs your build script, then starts the app with your start command. The default is npm start."],
  ["Python", "Installs requirements.txt into a virtual environment on your Nest, then runs your start command. The default is python3 app.py."],
  ["Static site", "Builds if you have a build script, then serves the output folder you pick."],
  ["Any command", "Skip detection and give the install, build and start commands yourself. The only rule is that the app listens on the PORT it is given."],
];

function Runtimes() {
  return (
    <section id="runtimes" className={section}>
      <Reveal className={cn(wrap, "grid gap-12 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-20")}>
        <div className="lg:self-end lg:pb-2">
          <p className="max-w-[28ch] text-[18px] leading-7">
            No config file to write. Nest Deploy looks at your repo and works out how to build and
            run it, and you can override any step.
          </p>
        </div>
        <div>
          <h2 className={h2}>Bring the app you already have.</h2>
          <div className="mt-12">
            <Framed>
              <dl className="divide-y px-6">
                {RUNTIMES.map(([term, text]) => (
                  <div key={term} className="grid gap-2 py-6 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10">
                    <dt className="font-pixel text-[21px] leading-6 font-medium">{term}</dt>
                    <dd className="max-w-[62ch] leading-7 text-muted-foreground">{text}</dd>
                  </div>
                ))}
              </dl>
            </Framed>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

const INCLUDED = [
  ["Deploys on push", "Install the GitHub app on a repo and every push to your production branch builds and ships. Public or private, whatever you grant it."],
  ["Rollbacks", "Production keeps your last five releases on disk. Switching back is a symlink and a restart, so it takes seconds."],
  ["Branch previews", "Any other branch builds on its own port, from 20000 up. The newest two previews stay; older ones are cleaned up."],
  ["Environment variables", "Set them once per project. They are encrypted, masked in logs, and never shown again in full."],
  ["Live logs", "Build output streams to the page as it happens. Runtime logs come from your app's systemd service."],
  ["Custom domains", "Nest maps domains by hand, so we tell you exactly what to enter and check your DNS until it matches."],
];

function Included() {
  return (
    <section id="included" className={section}>
      <Reveal className={wrap}>
        <h2 className={h2}>Everything else you would expect.</h2>
        <dl className="mt-14 grid gap-x-16 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map(([term, text]) => (
            <div key={term}>
              <dt className="font-pixel text-[21px] leading-6 font-medium">{term}</dt>
              <dd className="mt-3 max-w-[42ch] leading-7 text-muted-foreground">{text}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </section>
  );
}

const STEPS = [
  ["Sign in", "Log in with Hack Club. It confirms who you are and nothing more."],
  ["Add a key", "Paste the key we make into the SSH Keys page of your Nest dashboard, then test the connection."],
  ["Import a repo", "Pick a repository, set the port your app listens on, and deploy. After that, every push does it."],
];

/**
 * A hairline runs across the top of the frame with one lit square at the start
 * of each step. The squares switch on one after another as the section arrives.
 * On a phone they sit beside the step titles instead.
 */
function Start() {
  return (
    <section id="start" className={section}>
      <Reveal className={wrap}>
        <h2 className={h2}>Set up in three steps.</h2>
        <div className="mt-14">
          <Framed>
            <ol className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="relative p-6 md:pt-14 lg:p-8 lg:pt-16">
                  <StepTrackLine />
                  <h3 className="font-pixel flex items-center gap-3 text-[22px] leading-none font-medium">
                    <StepMarker index={i} />
                    {t}
                  </h3>
                  <p className="mt-3 max-w-[34ch] leading-7 text-muted-foreground">{d}</p>
                </li>
              ))}
            </ol>
          </Framed>
        </div>
      </Reveal>
    </section>
  );
}

const LEDGER = [
  ["One key, one job", "Each Nest account gets its own ed25519 key, made for Nest Deploy and used for nothing else."],
  ["Sealed at rest", "The private key is encrypted with AES-256-GCM before it reaches the database, and tied to your server so it cannot be moved."],
  ["Host key pinned", "The first connection records Nest's host key. If it ever changes, we stop before sending anything."],
  ["Builds stay out", "Your repo is built in a sandbox on our side, so your container's memory is for your app."],
  ["Sign-in is separate", "Hack Club Auth proves who you are. It has no route to your container."],
  ["Secrets masked", "Environment variables are encrypted, masked in logs, and never sent back to your browser."],
  ["Easy to leave", "Delete the key in your Nest dashboard. Access ends at once and your apps keep running."],
];

function Security() {
  return (
    <section id="security" className={section}>
      <Reveal className={wrap}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-end lg:gap-20">
          <h2 className={cn(h2, "max-w-[20ch]")}>The key is yours to take back.</h2>
          <div>
            <p className="max-w-[40ch] text-[18px] leading-7">
              SSH into Nest puts you in a root shell inside your own container, so the key we hold
              can do anything you can do there. We say so before you add it.
            </p>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="link mt-4 inline-flex items-center py-2 text-[14px] font-medium max-sm:py-2.5"
            >
              Read the source
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
        <div className="mt-16">
          <Framed>
            <dl className="divide-y px-6">
              {LEDGER.map(([term, text]) => (
                <div key={term} className="grid gap-2 py-6 md:grid-cols-[280px_minmax(0,1fr)] md:gap-10">
                  <dt className="font-pixel text-[21px] leading-6 font-medium">{term}</dt>
                  <dd className="max-w-[60ch] leading-7 text-muted-foreground">{text}</dd>
                </div>
              ))}
            </dl>
          </Framed>
        </div>
      </Reveal>
    </section>
  );
}

const FAQ = [
  ["Is it free?", "Yes. Nest is free and so is this. Your limits are your container's own: 2 vCPU, 2 GB of memory and 16 GB of disk by default."],
  ["Is it an official Hack Club product?", "No. It is an independent project by a Hack Club member. The Nest team does not run it."],
  ["Where do builds run?", "On our side, in a sandbox. Only the finished release is uploaded to your Nest, and the source is deleted when the build ends."],
  ["Can I use my own domain?", "Yes, with one manual step. Nest maps domains to ports on its own dashboard and has no API for it, so we show you what to enter and check your DNS."],
  ["What happens if I delete the key?", "Our access ends at once. Your apps carry on, because they are ordinary services in your container. We just can't update them."],
  ["Does it work with private repositories?", "Yes. Nest Deploy reads whatever repositories you give the GitHub app access to, and only those."],
  ["How do rollbacks work?", "Each release lives in its own folder and a current link points at the live one. Rolling back moves the link and restarts the service. Production keeps the last five releases."],
  ["Does it run databases?", "No. It deploys your app. If you need a database, run one in your Nest container yourself and point the app at it with an environment variable."],
  ["What can I deploy?", "Node.js, Python, static sites, or anything with a start command that listens on the PORT environment variable."],
];

/**
 * One native details element per question: it opens and closes with the
 * keyboard and without scripts. The height eases open where the browser
 * supports it (see .faq in globals.css).
 */
function Faq() {
  return (
    <section id="faq" className={section}>
      <Reveal className={cn(wrap, "grid gap-12 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-20")}>
        <div>
          <h2 className="font-pixel text-[clamp(2rem,3vw,2.75rem)] leading-none font-medium">Questions</h2>
          <p className="mt-5 max-w-[26ch] leading-7 text-muted-foreground">
            Short answers about cost, privacy and what it can and cannot do.
          </p>
          <p className="mt-4 max-w-[26ch] leading-7 text-muted-foreground">
            For the full picture, read the{" "}
            <Link href="/docs" className="link font-medium text-foreground">
              docs
            </Link>
            .
          </p>
        </div>
        <Framed>
          <div className="faq divide-y">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>
                  <span className="font-pixel text-[19px] leading-6 font-medium">{q}</span>
                  <span aria-hidden="true" className="faq-icon" />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </Framed>
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
            <h2 className="font-pixel max-w-[12ch] text-[clamp(2.75rem,6vw,5rem)] leading-[0.95] font-medium">
              Deploy your first app.
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
        note="Push to main and it is live. Push any other branch and it gets a preview on its own port."
        features={["Build sandbox", "Release switching", "Branch previews", "Streaming logs"]}
      >
        {/* On a phone the demo is too narrow for commit and branch, so those drop out. */}
        <div className="p-3 sm:p-6 max-sm:[&_p.font-mono]:hidden">
          <DeploymentsView deployments={SAMPLE_DEPLOYMENTS} showProject={false} demo />
        </div>
      </Showcase>

      <Runtimes />

      <Start />

      <Included />

      <Showcase
        flip
        title="Live only after it answers."
        frameLabel="pixel-garden / a08c6f1"
        note="Nest Deploy waits for your app to respond on its port. If it never does, the previous release is put back."
        features={["Health checks", "Automatic revert", "Instant rollback", "Kept releases"]}
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
