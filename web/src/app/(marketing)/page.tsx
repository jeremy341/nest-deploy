import Link from "next/link";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { HatchControls } from "@/components/marketing/hatch-controls";
import { PixelNest } from "@/components/marketing/pixel-nest";
import { PushTicker } from "@/components/marketing/push-ticker";
import { ReleaseStrip } from "@/components/marketing/release-strip";
import { PixelField } from "@/components/pixel-field";
import { REPO_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata = {
  title: { absolute: "Nest Deploy: push to GitHub, live on your Nest" },
  description:
    "Nest Deploy builds your GitHub repo and puts it on your free Hack Club Nest container. No scp, no hand-written systemd files, no 1am SSH.",
};

const wrap = "mx-auto w-full max-w-[1200px] px-5 sm:px-8";
const display = "font-[family-name:var(--font-display)] font-extrabold tracking-[-0.035em]";
const inkButton =
  "inline-flex h-12 items-center gap-2 rounded-md bg-[#14110F] px-5 text-[15px] font-medium tracking-[-0.02em] text-[#FFF3E3] transition-transform active:scale-[0.97]";

function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-brand text-brand-foreground">
      <PixelNest />
      <div className={cn(wrap, "relative min-h-[820px] pt-12 pb-[300px] lg:min-h-[660px] lg:pt-20 lg:pb-24")}>
        <div className="max-w-[620px]">
          <h1 className={cn(display, "text-[clamp(3.6rem,9.5vw,8rem)] leading-[0.88]")}>
            Push it.
            <br />
            Watch it hatch.
          </h1>
          <p className="mt-7 max-w-[46ch] text-[19px] leading-7">
            Nest Deploy builds your GitHub repo and puts it on your free Hack Club Nest. No scp,
            no hand-written systemd files, no 1am SSH.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link href="/projects" className={inkButton}>
              Deploy your first project
              <ArrowRightIcon />
            </Link>
            <a
              href="#replaces"
              className="font-medium underline decoration-2 underline-offset-4 outline-offset-4 transition-opacity hover:opacity-70"
            >
              What does it replace?
            </a>
          </div>
          <div className="mt-8">
            <HatchControls />
          </div>
        </div>
      </div>
    </section>
  );
}

const MANUAL = [
  "npm run build",
  "tar czf release.tgz dist package.json",
  "scp release.tgz you@hackclub.app:~/",
  "ssh you@hackclub.app",
  "tar xzf release.tgz -C ~/app && cd ~/app",
  "npm ci --omit=dev",
  "nano /etc/systemd/system/app.service",
  "systemctl daemon-reload && systemctl restart app",
  "curl localhost:3000",
  "# it didn't work. journalctl -u app, then do it all again",
];

function Replaces() {
  return (
    <section id="replaces" className="scroll-mt-4 py-24 lg:py-36">
      <div className={cn(wrap, "grid gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-20")}>
        <div>
          <h2 className={cn(display, "text-[clamp(2.25rem,5vw,4.25rem)] leading-[0.95]")}>
            This is what a deploy used to be.
          </h2>
          <pre
            tabIndex={0}
            aria-label="Ten manual deploy commands"
            className="mt-10 overflow-x-auto rounded-md bg-[#14110F] p-6 font-mono text-[13.5px] leading-7 text-[#FFF3E3]"
          >
            {MANUAL.map((l) => (
              <span key={l} className={cn("block", l.startsWith("#") ? "text-[#FFF3E3]/50" : undefined)}>
                {l.startsWith("#") ? l : <><span className="select-none text-[#FFF3E3]/40">$ </span>{l}</>}
              </span>
            ))}
          </pre>
          <p className="mt-4 text-muted-foreground">Ten steps, every time. More when something breaks.</p>
        </div>

        <div className="lg:pt-24">
          <p className={cn(display, "text-[clamp(3.25rem,8vw,6.5rem)] leading-[0.9]")}>
            <span className="text-brand-text">$</span> git push
          </p>
          <p className="mt-8 max-w-[44ch] text-[18px] leading-8">
            That is the deploy now. A worker builds your repo, your container gets the release, a
            health check decides if it is real, and you watch every line of it in the dashboard.
          </p>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const row = "grid gap-8 border-t-2 border-foreground py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-14 md:py-16";
  const title = cn(display, "text-[clamp(1.9rem,3.6vw,3rem)] leading-[1]");
  return (
    <section id="features" className="scroll-mt-4 border-t bg-background-subtle py-24 lg:py-36">
      <div className={wrap}>
        <h2 className="sr-only">What you get</h2>

        <div className={row}>
          <div>
            <h3 className={title}>Logs, while it builds.</h3>
            <p className="mt-4 max-w-[40ch] text-muted-foreground">
              Not after. Every line streams to the page as it happens, with your secrets masked.
            </p>
          </div>
          <div className="self-center font-mono text-[13.5px] leading-6">
            <p><span className="text-muted-foreground">14:02:13</span> Building: pnpm build</p>
            <p><span className="text-muted-foreground">14:02:27</span> Packed release: 4.1 MB</p>
            <p><span className="text-muted-foreground">14:02:30</span> Checksum verified</p>
            <p><span className="text-muted-foreground">14:02:33</span> <span className="text-brand-text">Healthy: HTTP 200 on port 3000</span></p>
          </div>
        </div>

        <div className={row}>
          <div>
            <h3 className={title}>If it won&apos;t start, it doesn&apos;t ship.</h3>
            <p className="mt-4 max-w-[40ch] text-muted-foreground">
              A new release has to answer on its port before it counts. If it stays silent, the
              old release is put back and the log says why.
            </p>
          </div>
          <div className="self-center font-mono text-[13.5px] leading-6">
            <p>9d02a7e <span className="text-[var(--status-error)]">no answer on port 3000 after 45s</span></p>
            <p className="text-muted-foreground">Reverting to the previous release</p>
            <p>1a5ddab <span className="text-brand-text">serving traffic again</span></p>
          </div>
        </div>

        <div className={row}>
          <div>
            <h3 className={title}>Roll back in one click.</h3>
            <p className="mt-4 max-w-[40ch] text-muted-foreground">
              The last few releases stay on your container. Pick an older one and it is live again
              in seconds. Try it, these are fake.
            </p>
          </div>
          <div className="self-center">
            <ReleaseStrip />
          </div>
        </div>

        <div className={cn(row, "border-b-2")}>
          <div>
            <h3 className={title}>Every branch gets a preview.</h3>
            <p className="mt-4 max-w-[40ch] text-muted-foreground">
              Push a branch and it starts on its own port, next to production. Try the change on a
              real container before it matters.
            </p>
          </div>
          <div className="self-center font-mono text-[13.5px] leading-7">
            <p>main <span className="text-muted-foreground">production, :3000</span></p>
            <p>feature/login <span className="text-muted-foreground">preview, :20000</span></p>
            <p>fix/typo <span className="text-muted-foreground">preview, :20001</span></p>
          </div>
        </div>

        <p className="mt-10 max-w-[60ch] text-[17px] leading-7">
          Runs Node.js, Python, static sites, or anything with a start command, as long as it
          listens on the <code className="font-mono text-[15px]">PORT</code> environment variable.
        </p>
      </div>
    </section>
  );
}

function Setup() {
  return (
    <section className="py-24 lg:py-36">
      <div className={wrap}>
        <p className={cn(display, "max-w-[22ch] text-[clamp(2.5rem,6.4vw,5.5rem)] leading-[0.95]")}>
          Sign in with Hack Club. Paste{" "}
          <span className="underline decoration-brand decoration-[0.09em] underline-offset-[0.1em]">one key</span>{" "}
          into your Nest dashboard. Pick a repo. That is setup.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
          <Link href="/connect" className={inkButton}>
            Connect your Nest
            <ArrowRightIcon />
          </Link>
          <a
            href="#key"
            className="font-medium underline decoration-2 underline-offset-4 outline-offset-4 transition-opacity hover:opacity-70"
          >
            About that key
          </a>
        </div>
      </div>
    </section>
  );
}

const LEDGER = [
  ["One key, one job", "Each Nest account gets its own ed25519 key, made for Nest Deploy and used for nothing else."],
  ["Sealed at rest", "The private key is encrypted with AES-256-GCM before it reaches the database, and tied to your server so it cannot be moved."],
  ["We check the door", "The first connection pins Nest's host key. If it changes, we stop before sending anything."],
  ["Builds stay out", "Your repo is built in a sandbox on our side, so your 2 GB of memory is for your app."],
  ["Sign-in is separate", "Hack Club Auth proves who you are. It has no route to your container."],
  ["Secrets stay quiet", "Environment variables are encrypted, masked in logs, and never sent back to your browser."],
  ["Leaving is one click", "Delete the key in your Nest dashboard. Access ends that second. Your apps keep running."],
];

function Key() {
  return (
    <section id="key" className="scroll-mt-4 bg-[#14110F] py-24 text-[#FFF3E3] lg:py-36">
      <div className={cn(wrap, "grid gap-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20")}>
        <div>
          <h2 className={cn(display, "text-[clamp(2.5rem,5.6vw,4.75rem)] leading-[0.92]")}>
            About that SSH key.
          </h2>
          <p className="mt-8 max-w-[44ch] text-[19px] leading-8">
            SSH into Nest puts you in a root shell inside your own container. So the key we hold
            can do anything you can do there.
          </p>
          <p className="mt-5 max-w-[44ch] text-[17px] leading-7 opacity-70">
            We say that on the Connect page before you add it. Only connect a container you are
            happy to deploy to. Here is how we keep it from becoming a problem.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-block font-medium text-brand underline decoration-2 underline-offset-4 outline-offset-4"
          >
            Read the source on GitHub
          </a>
        </div>

        <dl className="divide-y divide-[#FFF3E3]/20 border-y border-[#FFF3E3]/20">
          {LEDGER.map(([term, text]) => (
            <div key={term} className="grid gap-1 py-5 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-8">
              <dt className="font-semibold tracking-[-0.02em]">{term}</dt>
              <dd className="leading-7 opacity-75">{text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const FAQ = [
  ["Is it free?", "Yes. Nest is free and so is this. Your limits are your container's own: 2 vCPU, 2 GB of memory and 16 GB of disk by default."],
  ["Is it an official Hack Club thing?", "No. It is an independent project by a Hack Club member. The Nest team does not run it."],
  ["Where do builds run?", "On our side, in a sandbox. Only the finished release is uploaded to your Nest, and the source is deleted when the build ends."],
  ["Can I use my own domain?", "Yes, with one manual step. Nest maps domains to ports on its own dashboard and has no API for it, so we show you exactly what to enter and check your DNS."],
  ["What if I delete the key?", "Our access ends immediately. Your apps carry on, because they are ordinary services in your container. We just can't update them."],
  ["What can I deploy?", "Node.js, Python, static sites, or anything with a start command. It has to listen on the PORT environment variable and on 0.0.0.0."],
];

function Faq() {
  return (
    <section id="faq" className="scroll-mt-4 py-24 lg:py-32">
      <div className={wrap}>
        <h2 className={cn(display, "text-[clamp(2.25rem,5vw,4rem)] leading-[0.95]")}>
          Things people ask.
        </h2>
        <dl className="mt-12 grid gap-x-16 gap-y-10 md:grid-cols-2">
          {FAQ.map(([q, a]) => (
            <div key={q}>
              <dt className="text-lg font-semibold tracking-[-0.02em]">{q}</dt>
              <dd className="mt-2 max-w-[52ch] leading-7 text-muted-foreground">{a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Closer() {
  return (
    <section className="relative isolate overflow-hidden bg-brand text-brand-foreground">
      <PixelField cell={20} tone="brand" className="[mask-image:linear-gradient(to_top,black_60%,transparent)]" />
      <div className={cn(wrap, "relative py-28 lg:py-40")}>
        <h2 className={cn(display, "max-w-[11ch] text-[clamp(3.25rem,9vw,7.5rem)] leading-[0.88]")}>
          Your Nest is waiting.
        </h2>
        <div className="mt-10">
          <Link href="/projects" className={inkButton}>
            Open the dashboard
            <ArrowRightIcon />
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <PushTicker />
      <Replaces />
      <Features />
      <Setup />
      <Key />
      <Faq />
      <Closer />
    </>
  );
}
