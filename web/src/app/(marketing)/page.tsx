import Link from "next/link";
import { ArrowRightIcon, GithubLogoIcon, PlusIcon } from "@phosphor-icons/react/dist/ssr";
import { HeroConsole } from "@/components/marketing/hero-console";
import { Pipeline } from "@/components/marketing/pipeline";
import { ReleaseStrip } from "@/components/marketing/release-strip";
import { Reveal } from "@/components/marketing/reveal";
import { PixelField } from "@/components/pixel-field";
import { buttonVariants } from "@/components/ui/button";
import { REPO_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata = {
  title: { absolute: "Nest Deploy: push to GitHub, live on your Nest" },
  description:
    "Push to GitHub and it goes live on your free Hack Club Nest container. Builds, logs, rollbacks and branch previews, no terminal needed.",
};

const wrap = "mx-auto w-full max-w-[1200px] px-5 sm:px-8";
const h2 =
  "text-balance text-[clamp(2rem,4.4vw,3.5rem)] leading-[1.02] font-semibold tracking-[-0.035em]";
const lead = "mt-5 max-w-[60ch] text-[17px] leading-7 text-muted-foreground";
const tile = "rounded-xl bg-card p-6 shadow-border-small sm:p-7";
const tileTitle = "text-xl font-semibold tracking-[-0.02em]";

function Hero() {
  return (
    <section className="relative isolate overflow-hidden border-b">
      <PixelField
        autoDrops
        className="[mask-image:linear-gradient(to_bottom,black_62%,transparent)]"
      />
      <div
        className={cn(
          wrap,
          "relative grid gap-14 pt-14 pb-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-center lg:gap-12 lg:pt-24 lg:pb-28"
        )}
      >
        <div className="[text-shadow:0_0_28px_var(--background),0_0_8px_var(--background)]">
          <h1 className="text-balance text-[clamp(2.75rem,6.6vw,5.4rem)] leading-[0.98] font-semibold tracking-[-0.04em]">
            Push to GitHub. It&apos;s <span className="text-brand-text">live</span> on your Nest.
          </h1>
          <p className="mt-6 max-w-[52ch] text-[18px] leading-7 text-muted-foreground">
            Nest Deploy builds your repo, ships it to your free Hack Club Nest container and keeps
            it running. Logs, rollbacks and branch previews included, no terminal needed.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3 [text-shadow:none]">
            <Link
              href="/projects"
              className={cn(
                buttonVariants({ variant: "brand", size: "lg" }),
                "h-12 px-5 text-[15px] active:scale-[0.97]"
              )}
            >
              Deploy your first project
              <ArrowRightIcon />
            </Link>
            <a
              href="#how"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 px-5 text-[15px] active:scale-[0.97]"
              )}
            >
              See how it works
            </a>
          </div>
          <p className="mt-5 text-[14px] text-muted-foreground">
            Free and open source. Made by a Hack Club member.
          </p>
        </div>

        <div className="relative">
          <HeroConsole />
        </div>
      </div>
    </section>
  );
}

function What() {
  return (
    <section id="what" className="scroll-mt-16 py-24 lg:py-32">
      <div className={wrap}>
        <Reveal>
          <h2 className={cn(h2, "max-w-[18ch]")}>Nest gives you the server. We give it a dashboard.</h2>
          <p className={lead}>
            Hack Club Nest is free Linux hosting for teenagers. It is great, and it is a terminal.
            Nest Deploy sits on top: connect a GitHub repo once, and every push becomes a build, a
            release and a health check you can watch.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-4 md:grid-cols-12">
          <Reveal className="md:col-span-7">
            <article className={cn(tile, "h-full")}>
              <h3 className={tileTitle}>Every push becomes a release.</h3>
              <p className="mt-2 max-w-[52ch] text-muted-foreground">
                Push to your production branch and it deploys. Push any other branch and a preview
                starts on its own port. If the new version does not come up, the old one keeps
                running.
              </p>
              <div className="mt-8">
                <Pipeline />
              </div>
            </article>
          </Reveal>

          <Reveal delay={80} className="md:col-span-5">
            <article className={cn(tile, "h-full")}>
              <h3 className={tileTitle}>Watch it build, live.</h3>
              <p className="mt-2 text-muted-foreground">
                The log streams as it happens, with your secrets masked.
              </p>
              <div className="mt-6 space-y-1.5 font-mono text-[13px] leading-5">
                <p><span className="text-subtle-foreground">14:02:13</span> Building: pnpm build</p>
                <p><span className="text-subtle-foreground">14:02:27</span> Packed release: 4.1 MB</p>
                <p><span className="text-subtle-foreground">14:02:30</span> Checksum verified</p>
                <p><span className="text-subtle-foreground">14:02:33</span> <span className="text-brand-text">Live on port 3000.</span></p>
              </div>
            </article>
          </Reveal>

          <Reveal className="md:col-span-5">
            <article className={cn(tile, "h-full")}>
              <h3 className={tileTitle}>A preview for every branch.</h3>
              <p className="mt-2 text-muted-foreground">
                Test a change on a real container before it reaches production.
              </p>
              <ul className="mt-6 space-y-2 font-mono text-[13px]">
                {[
                  ["feature/login", "20000"],
                  ["fix/typo", "20001"],
                  ["redesign", "20002"],
                ].map(([b, p]) => (
                  <li key={b} className="flex items-center justify-between gap-3 rounded-md bg-[var(--ds-gray-100)] px-3 py-2">
                    <span className="truncate">{b}</span>
                    <span className="text-muted-foreground">:{p}</span>
                  </li>
                ))}
              </ul>
            </article>
          </Reveal>

          <Reveal delay={80} className="md:col-span-7">
            <article className={cn(tile, "h-full")}>
              <h3 className={tileTitle}>Roll back in one click.</h3>
              <p className="mt-2 max-w-[52ch] text-muted-foreground">
                The last few releases stay on your container. Pick an older one and it is live again
                in seconds. Try it:
              </p>
              <div className="mt-6">
                <ReleaseStrip />
              </div>
            </article>
          </Reveal>

          <Reveal className="md:col-span-12">
            <article className={cn(tile, "flex flex-col gap-6 md:flex-row md:items-center md:justify-between")}>
              <div className="max-w-[58ch]">
                <h3 className={tileTitle}>Runs what you already write.</h3>
                <p className="mt-2 text-muted-foreground">
                  If it listens on the <code className="font-mono text-[14px] text-foreground">PORT</code>{" "}
                  environment variable, it can run on your Nest.
                </p>
              </div>
              <ul className="flex flex-wrap gap-2">
                {["Node.js", "Python", "Static sites", "Any start command"].map((r) => (
                  <li key={r} className="rounded-md bg-[var(--ds-gray-100)] px-3 py-2 font-medium tracking-[-0.02em]">
                    {r}
                  </li>
                ))}
              </ul>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: "Sign in with Hack Club",
    text: "One click. Hack Club confirms who you are, and nothing more.",
    visual: (
      <div className="rounded-lg bg-[var(--ds-gray-100)] p-4">
        <div className="flex h-10 items-center justify-center rounded-md bg-foreground font-medium text-background">
          Continue with Hack Club
        </div>
      </div>
    ),
  },
  {
    title: "Give us a key",
    text: "We make a key just for your Nest account. Paste it into the SSH Keys page of the Nest dashboard, and press Test connection.",
    visual: (
      <div className="rounded-lg bg-[var(--ds-gray-100)] p-4 font-mono text-[12.5px] leading-5 break-all">
        ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI<span className="text-brand-text">Bwb4kp1…</span> nest-deploy:sam-r
      </div>
    ),
  },
  {
    title: "Pick a repo",
    text: "Choose a repository, tell us the port your app listens on, and press Deploy.",
    visual: (
      <ul className="divide-y rounded-lg bg-[var(--ds-gray-100)]">
        {["sam-r/hello-world", "sam-r/standup-bot", "sam-r/pixel-garden"].map((r, i) => (
          <li key={r} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <span className="truncate font-mono text-[13px]">{r}</span>
            <span
              className={cn(
                "rounded-md px-2.5 py-1 text-[13px] font-medium",
                i === 0 ? "bg-brand text-brand-foreground" : "bg-background text-muted-foreground"
              )}
            >
              Import
            </span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    title: "Push",
    text: "From here on, git push is the whole deploy. Nest Deploy handles the rest.",
    visual: (
      <div className="rounded-lg bg-[var(--ds-gray-100)] p-4 font-mono text-[12.5px] leading-5">
        <p><span className="text-subtle-foreground">$</span> git push origin main</p>
        <p className="text-muted-foreground">To github.com:sam-r/hello-world.git</p>
        <p className="text-brand-text">Deploying to sam-r.hackclub.app</p>
      </div>
    ),
  },
];

function How() {
  return (
    <section id="how" className="scroll-mt-16 border-y bg-background-subtle py-24 lg:py-32">
      <div className={wrap}>
        <Reveal>
          <h2 className={cn(h2, "max-w-[16ch]")}>Four steps, then it runs itself.</h2>
          <p className={lead}>
            You do this once. After that, the only thing you do is write code.
          </p>
        </Reveal>

        <ol className="mt-16 space-y-14 lg:space-y-20">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Reveal className="grid gap-6 lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
                <span
                  aria-hidden="true"
                  className="font-[family-name:var(--font-pixel)] text-[64px] leading-none font-bold text-brand lg:text-[88px]"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-2xl font-semibold tracking-[-0.03em]">{s.title}</h3>
                  <p className="mt-2 max-w-[44ch] text-[16px] leading-7 text-muted-foreground">{s.text}</p>
                </div>
                <div className="max-w-[520px]">{s.visual}</div>
              </Reveal>
            </li>
          ))}
        </ol>

        <Reveal className="mt-16">
          <Link
            href="/connect"
            className={cn(buttonVariants({ variant: "brand", size: "lg" }), "h-12 px-5 text-[15px] active:scale-[0.97]")}
          >
            Connect your Nest
            <ArrowRightIcon />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

const SAFEGUARDS = [
  {
    title: "A key made for this, and only this.",
    text: "Each Nest account gets its own ed25519 key. Delete it on the Nest dashboard and our access ends at once.",
  },
  {
    title: "Encrypted where we keep it.",
    text: "Your private key is sealed with AES-256-GCM before it reaches the database, and tied to your server so it cannot be moved elsewhere.",
  },
  {
    title: "We check who we are talking to.",
    text: "The first connection pins Nest's host key. If it ever changes, we stop before sending anything.",
  },
  {
    title: "Builds happen away from your container.",
    text: "Your code is built in a locked-down sandbox on our side. Your 2 GB of memory stays free for your app.",
  },
  {
    title: "Signing in can't reach your server.",
    text: "Hack Club Auth proves who you are. It has no path to your container.",
  },
  {
    title: "Secrets stay secret.",
    text: "Environment variables are encrypted, masked in logs, and never sent back to your browser.",
  },
];

function Security() {
  return (
    <section id="security" className="scroll-mt-16 py-24 lg:py-32">
      <div className={wrap}>
        <Reveal>
          <h2 className={cn(h2, "max-w-[20ch]")}>Built so you can say no at any time.</h2>
          <p className={lead}>
            Nest Deploy has to reach your container to deploy to it. Here is exactly what that
            means, and how you stay in control.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:gap-14">
          <ul className="divide-y border-y">
            {SAFEGUARDS.map((s, i) => (
              <li key={s.title}>
                <Reveal delay={i * 40} className="grid gap-1 py-6 sm:grid-cols-[28px_minmax(0,1fr)] sm:gap-4">
                  <span aria-hidden="true" className="mt-2 hidden size-2.5 bg-brand sm:block" />
                  <div>
                    <h3 className="text-lg font-semibold tracking-[-0.02em]">{s.title}</h3>
                    <p className="mt-1 max-w-[56ch] text-muted-foreground">{s.text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
            <li>
              <Reveal className="grid gap-1 py-6 sm:grid-cols-[28px_minmax(0,1fr)] sm:gap-4">
                <span aria-hidden="true" className="mt-2 hidden size-2.5 bg-brand sm:block" />
                <div>
                  <h3 className="text-lg font-semibold tracking-[-0.02em]">Open source.</h3>
                  <p className="mt-1 text-muted-foreground">
                    Every line is on{" "}
                    <a href={REPO_URL} target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-4">
                      GitHub
                    </a>
                    . Read it before you trust it.
                  </p>
                </div>
              </Reveal>
            </li>
          </ul>

          <Reveal delay={120}>
            <aside className="rounded-xl bg-brand-soft p-7 lg:sticky lg:top-24">
              <h3 className="text-xl font-semibold tracking-[-0.02em]">Straight talk</h3>
              <p className="mt-3 leading-7">
                SSH into Nest lands in a root shell inside your container, so this key is as
                powerful as your own login.
              </p>
              <p className="mt-3 leading-7 text-muted-foreground">
                We tell you that on the Connect page before you add it. Only connect a container
                you are happy to deploy to, and remember you can end our access whenever you like.
              </p>
            </aside>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

const FAQ = [
  {
    q: "Is Nest Deploy free?",
    a: "Yes. Nest is free, and so is Nest Deploy. Your limits are your container's own: 2 vCPU, 2 GB of memory and 16 GB of disk by default.",
  },
  {
    q: "Is this an official Hack Club product?",
    a: "No. It is an independent project by a Hack Club member. The Nest team does not run it.",
  },
  {
    q: "What can I deploy?",
    a: "Node.js, Python, static sites, or anything with a start command, as long as it listens on the PORT environment variable and on 0.0.0.0.",
  },
  {
    q: "Where do my builds run?",
    a: "On our side, in a sandbox, not in your container. Only the finished release is uploaded to your Nest.",
  },
  {
    q: "What happens if I remove the key?",
    a: "Our access ends immediately. Your apps keep running, because they are ordinary services in your container. We just can't update them until you connect again.",
  },
  {
    q: "Can I use my own domain?",
    a: "Yes, with one manual step. Nest maps domains to ports on its own dashboard and has no API for it, so Nest Deploy tells you exactly what to enter and checks your DNS.",
  },
  {
    q: "Do you keep my code?",
    a: "Only for the length of a build. The finished release lives in your container.",
  },
];

function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 border-t bg-background-subtle py-24 lg:py-32">
      <div className={cn(wrap, "grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]")}>
        <Reveal>
          <h2 className={cn(h2, "max-w-[12ch]")}>Questions, answered.</h2>
          <p className={lead}>
            Anything missing? Open an issue on{" "}
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-4">
              GitHub
            </a>
            .
          </p>
        </Reveal>

        <Reveal delay={80}>
          <div className="divide-y border-y">
            {FAQ.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[17px] font-medium tracking-[-0.02em] outline-offset-4 select-none [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <PlusIcon
                    aria-hidden="true"
                    className="ease-out-strong size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45"
                  />
                </summary>
                <p className="max-w-[60ch] pb-6 leading-7 text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Closer() {
  return (
    <section className="relative isolate overflow-hidden border-t">
      <PixelField cell={20} className="[mask-image:linear-gradient(to_top,black_55%,transparent)]" />
      <div className={cn(wrap, "relative py-28 text-center lg:py-40")}>
        <Reveal>
          <h2 className="mx-auto max-w-[16ch] text-balance text-[clamp(2.25rem,5.6vw,4.5rem)] leading-[1] font-semibold tracking-[-0.04em] [text-shadow:0_0_28px_var(--background),0_0_8px_var(--background)]">
            Your next project is one push away.
          </h2>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              href="/projects"
              className={cn(buttonVariants({ variant: "brand", size: "lg" }), "h-12 px-5 text-[15px] active:scale-[0.97]")}
            >
              Open the dashboard
              <ArrowRightIcon />
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 px-5 text-[15px] active:scale-[0.97]")}
            >
              <GithubLogoIcon />
              Star on GitHub
            </a>
          </div>
          <p className="mt-6 text-[14px] text-muted-foreground [text-shadow:0_0_14px_var(--background)]">
            Psst. The pixels are clickable.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <What />
      <How />
      <Security />
      <Faq />
      <Closer />
    </>
  );
}
