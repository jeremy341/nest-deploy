import Link from "next/link";
import { BuildLogs } from "@/components/build-logs";
import { DeploymentsView } from "@/components/deployments-view";
import { NestMark } from "@/components/nest-mark";
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
  "max-w-[20ch] text-[clamp(2rem,3.7vw,3.25rem)] leading-[1.05] font-[450] tracking-[-0.04em] text-balance";
const pill =
  "inline-flex h-10 items-center rounded-full px-5 text-[14px] font-medium tracking-[-0.01em] transition-transform active:scale-[0.97]";

function Hero() {
  return (
    <section>
      <div
        className={cn(
          wrap,
          "relative grid min-h-[620px] items-center gap-12 py-20 lg:grid-cols-[1fr_auto_1fr] lg:gap-16"
        )}
      >
        <div>
          <h1 className="text-[clamp(3rem,5.6vw,4.75rem)] leading-[1] font-[450] tracking-[-0.045em]">
            Deploy to
            <br />
            your Nest.
          </h1>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/projects" className={cn(pill, "bg-foreground text-background")}>
              Start deploying
            </Link>
            <a href="#product" className={cn(pill, "shadow-border-base bg-background hover:bg-[var(--ds-gray-100)]")}>
              How it works
            </a>
          </div>
        </div>

        <div aria-hidden="true" className="mx-auto">
          <NestMark className="size-[190px] drop-shadow-[0_22px_26px_rgb(0_0_0/0.22)] sm:size-[230px]" />
        </div>

        <ul className="space-y-1.5 text-[15px] lg:justify-self-end">
          <li>From any GitHub repo</li>
          <li>To your free Nest container</li>
          <li>With logs, rollbacks and previews</li>
        </ul>
      </div>
    </section>
  );
}

const WORKS_WITH = ["GitHub", "Hack Club Nest", "Node.js", "Python", "Docker", "systemd"];

function WorksWith() {
  return (
    <section aria-label="Works with" className={cn(wrap, "py-12")}>
      <ul className="flex flex-wrap items-center justify-between gap-x-10 gap-y-5">
        {WORKS_WITH.map((n) => (
          <li key={n} className="text-[22px] font-semibold tracking-[-0.04em] text-[var(--ds-gray-700)]">
            {n}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Left: a short note and a feature list. Right: the headline and the real UI. */
function Showcase({
  id,
  note,
  features,
  title,
  children,
}: {
  id?: string;
  note: string;
  features: string[];
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-14 py-24 lg:py-32">
      <div className={cn(wrap, "grid gap-12 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-20")}>
        <div className="order-2 lg:order-1 lg:self-end lg:pb-2">
          <p className="max-w-[28ch] text-[18px] leading-7">{note}</p>
          <p className="mt-10 text-[13px] text-muted-foreground">Features</p>
          <ul className="mt-3 space-y-1.5 text-[14px]">
            {features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
        <div className="order-1 lg:order-2">
          <h2 className={h2}>{title}</h2>
          <div className="mt-12 rounded-2xl bg-[var(--ds-gray-100)] p-4 sm:p-8 lg:p-12">
            <div inert aria-hidden="true" className="overflow-hidden rounded-xl bg-background shadow-menu">
              {children}
            </div>
          </div>
        </div>
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
      <div className={cn(wrap, "grid gap-12 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-20")}>
        <div className="order-2 lg:order-1 lg:self-end">
          <p className="max-w-[30ch] text-[18px] leading-7">
            SSH into Nest puts you in a root shell inside your own container, so the key we hold
            can do anything you can do there. We say so before you add it.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-block text-[14px] font-medium underline underline-offset-4"
          >
            Read the source
          </a>
        </div>
        <div className="order-1 lg:order-2">
          <h2 className={h2}>You hold the key, and you can take it back.</h2>
          <dl className="mt-12 divide-y border-y">
            {LEDGER.map(([term, text]) => (
              <div key={term} className="grid gap-1 py-5 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-10">
                <dt className="font-medium tracking-[-0.01em]">{term}</dt>
                <dd className="max-w-[58ch] leading-7 text-muted-foreground">{text}</dd>
              </div>
            ))}
          </dl>
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
    <section className="border-t py-24 lg:py-32">
      <div className={wrap}>
        <h2 className={h2}>Three steps, once.</h2>
        <ol className="mt-14 grid gap-10 md:grid-cols-3">
          {STEPS.map(([t, d]) => (
            <li key={t} className="border-t border-foreground pt-5">
              <h3 className="text-[17px] font-medium tracking-[-0.02em]">{t}</h3>
              <p className="mt-2 max-w-[34ch] leading-7 text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>
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
    <section id="faq" className="scroll-mt-14 border-t py-24 lg:py-32">
      <div className={cn(wrap, "grid gap-12 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-20")}>
        <h2 className="text-[clamp(1.75rem,2.6vw,2.25rem)] leading-[1.1] font-[450] tracking-[-0.04em]">
          Questions
        </h2>
        <dl className="grid gap-x-14 gap-y-10 md:grid-cols-2">
          {FAQ.map(([q, a]) => (
            <div key={q}>
              <dt className="font-medium tracking-[-0.01em]">{q}</dt>
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
    <section className="border-t">
      <div className={cn(wrap, "py-28 text-center lg:py-36")}>
        <h2 className="mx-auto max-w-[14ch] text-[clamp(2.5rem,5vw,4rem)] leading-[1] font-[450] tracking-[-0.045em]">
          Ready to deploy?
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
      <WorksWith />

      <Showcase
        id="product"
        title="Every push becomes a release."
        note="Push to main and it is live. Push any other branch and it gets a preview on its own port."
        features={["Build sandbox", "Release switching", "Branch previews", "Streaming logs"]}
      >
        <div className="p-4 sm:p-6">
          <DeploymentsView deployments={SAMPLE_DEPLOYMENTS} showProject={false} />
        </div>
      </Showcase>

      <Showcase
        title="If it won't start, it won't ship."
        note="A new release has to answer on its port before it counts. If it stays silent, the old one is put back."
        features={["Health checks", "Automatic revert", "Instant rollback", "Kept releases"]}
      >
        <div className="p-4 sm:p-6">
          <BuildLogs deploymentId="sample" initialLines={SAMPLE_LOG} rawState="error" duration="48s" />
        </div>
      </Showcase>

      <Security />
      <Start />
      <Faq />
      <Cta />
    </>
  );
}
