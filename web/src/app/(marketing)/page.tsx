import Link from "next/link";
import { BuildLogs } from "@/components/build-logs";
import { DeploymentsView } from "@/components/deployments-view";
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

function Hero() {
  return (
    <section className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <div className={cn(wrap, "flex flex-1 flex-col items-center justify-center py-16 text-center")}>
        <h1 className="font-pixel mx-auto max-w-[12ch] text-[clamp(3.5rem,10.5vw,11rem)] leading-[0.92] font-medium text-balance">
          Deploy to your Nest.
        </h1>
        <p className="mx-auto mt-9 max-w-[46ch] text-[clamp(1.125rem,1.7vw,1.5rem)] leading-[1.5] text-muted-foreground text-balance">
          Push to GitHub and your app builds and goes live on your free Hack Club Nest container,
          with logs, rollbacks and previews.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
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

      <div className={cn(wrap, "pb-10")}>
        <div className="relative mx-auto max-w-[620px]">
          <Plus className="-top-1.5 -left-1.5 z-10" />
          <Plus className="-top-1.5 -right-1.5 z-10" />
          <Plus className="-bottom-1.5 -left-1.5 z-10" />
          <Plus className="-right-1.5 -bottom-1.5 z-10" />
          <div className="border bg-background px-6 py-5 text-left font-mono text-[14px] leading-7">
            <p>
              <span className="text-muted-foreground select-none">$ </span>git push origin main
            </p>
            <p className="text-muted-foreground">Built my-app in 48s, uploaded to your Nest</p>
            <p>Live on port 3000</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** A short note and a feature list beside a headline and the real UI. `flip` puts the note on the right. */
function Showcase({
  id,
  note,
  features,
  title,
  flip = false,
  children,
}: {
  id?: string;
  note: string;
  features: string[];
  title: string;
  flip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-14 py-24 lg:py-32">
      <div
        className={cn(
          wrap,
          "grid gap-12 lg:gap-20",
          flip ? "lg:grid-cols-[minmax(0,1fr)_260px]" : "lg:grid-cols-[260px_minmax(0,1fr)]"
        )}
      >
        <div className={cn("order-2 lg:self-end lg:pb-2", flip ? "lg:order-2" : "lg:order-1")}>
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
        <div className={cn("order-1", flip ? "lg:order-1" : "lg:order-2")}>
          <h2 className={h2}>{title}</h2>
          <div className="relative mt-12">
            <Plus className="-top-1.5 -left-1.5 z-10" />
            <Plus className="-top-1.5 -right-1.5 z-10" />
            <Plus className="-bottom-1.5 -left-1.5 z-10" />
            <Plus className="-right-1.5 -bottom-1.5 z-10" />
            <div className="overflow-hidden border bg-background">
              {children}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  ["Sign in", "Log in with Hack Club. It confirms who you are and nothing more."],
  ["Add a key", "Paste the key we make into the SSH Keys page of your Nest dashboard, then test the connection."],
  ["Import a repo", "Pick a repository, set the port your app listens on, and deploy. After that, every push does it."],
];

function Start() {
  return (
    <section id="start" className="scroll-mt-14 border-y py-24 lg:py-32">
      <div className={wrap}>
        <h2 className={h2}>Set up in three steps.</h2>
        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map(([t, d]) => (
            <li key={t} className="border-t border-foreground pt-5">
              <h3 className="font-pixel text-[22px] leading-none font-medium">{t}</h3>
              <p className="mt-3 max-w-[34ch] leading-7 text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>
      </div>
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
    <section id="security" className="scroll-mt-14 py-24 lg:py-32">
      <div className={wrap}>
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
              className="mt-6 inline-block text-[14px] font-medium underline underline-offset-4"
            >
              Read the source
            </a>
          </div>
        </div>
        <dl className="mt-16 divide-y border-y">
          {LEDGER.map(([term, text]) => (
            <div key={term} className="grid gap-2 py-6 md:grid-cols-[280px_minmax(0,1fr)] md:gap-10">
              <dt className="font-pixel text-[21px] leading-6 font-medium">{term}</dt>
              <dd className="max-w-[60ch] leading-7 text-muted-foreground">{text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const FAQ = [
  ["Is it free?", "Yes. Nest is free and so is this. Your limits are your container's own: 2 vCPU, 2 GB of memory and 16 GB of disk by default."],
  ["Is it an official Hack Club product?", "No. It is an independent project by a Hack Club member. The Nest team does not run it."],
  ["Where do builds run?", "On our side, in a sandbox. Only the finished release is uploaded to your Nest, and the source is deleted when the build ends."],
  ["Can I use my own domain?", "Yes, with one manual step. Nest maps domains to ports on its own dashboard and has no API for it, so we show you what to enter and check your DNS."],
  ["What happens if I delete the key?", "Our access ends at once. Your apps carry on, because they are ordinary services in your container. We just can't update them."],
  ["What can I deploy?", "Node.js, Python, static sites, or anything with a start command that listens on the PORT environment variable."],
];

function Faq() {
  return (
    <section id="faq" className="scroll-mt-14 border-y py-24 lg:py-32">
      <div className={cn(wrap, "grid gap-12 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-20")}>
        <h2 className="font-pixel text-[clamp(2rem,3vw,2.75rem)] leading-none font-medium">Questions</h2>
        <dl className="grid gap-x-14 gap-y-10 md:grid-cols-2">
          {FAQ.map(([q, a]) => (
            <div key={q}>
              <dt className="font-pixel text-[19px] leading-6 font-medium">{q}</dt>
              <dd className="mt-2 max-w-[48ch] leading-7 text-muted-foreground">{a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section>
      <div className={cn(wrap, "py-28 text-center lg:py-40")}>
        <h2 className="font-pixel mx-auto max-w-[12ch] text-[clamp(2.75rem,6vw,5rem)] leading-[0.95] font-medium">
          Deploy your first app.
        </h2>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/projects" className={cn(pill, "bg-foreground text-background")}>
            Start deploying
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(pill, "shadow-border-base bg-background hover:bg-[var(--ds-gray-100)]")}
          >
            View the source
          </a>
        </div>
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
        note="Push to main and it is live. Push any other branch and it gets a preview on its own port."
        features={["Build sandbox", "Release switching", "Branch previews", "Streaming logs"]}
      >
        {/* On a phone the demo is too narrow for commit and branch, so those drop out. */}
        <div className="p-3 sm:p-6 max-sm:[&_p.font-mono]:hidden">
          <DeploymentsView deployments={SAMPLE_DEPLOYMENTS} showProject={false} demo />
        </div>
      </Showcase>

      <Start />

      <Showcase
        flip
        title="Live only after it answers."
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
