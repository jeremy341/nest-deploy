"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CaretRightIcon,
  FolderIcon,
  GitBranchIcon,
  GithubLogoIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { server } from "@/lib/mock";
import { cn } from "@/lib/utils";

type Repo = { name: string; pushed: string; root: string; preset: string };

// Sample repositories. A real build would read these through the GitHub App.
const REPOS: Repo[] = [
  { name: "sam-r/new-idea", pushed: "3h ago", root: "web", preset: "Node.js" },
  { name: "sam-r/poorup", pushed: "Oct 30", root: "./", preset: "Node.js" },
  { name: "sam-r/loadout", pushed: "Oct 29", root: "./", preset: "Node.js" },
  { name: "sam-r/portfolio", pushed: "Oct 29", root: "./", preset: "Static" },
];

const PRESETS = ["Node.js", "Python", "Static", "Dockerfile"];

type Phase = "idle" | "deploying" | "done";

function Label({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[13px] text-muted-foreground"
    >
      {children}
    </label>
  );
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

function Configure({ repo, onBack }: { repo: Repo; onBack: () => void }) {
  const [name, setName] = useState(repo.name.split("/")[1]);
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const valid = /^[a-z0-9][a-z0-9-]{0,62}$/.test(name);

  function deploy() {
    if (!valid || phase !== "idle") return;
    setPhase("deploying");
    // Simulated: there is no build worker behind this yet.
    timer.current = setTimeout(() => setPhase("done"), 2600);
  }

  return (
    <div className="mx-auto w-full max-w-[600px] space-y-6">
      <section
        aria-labelledby="new-heading"
        className="rounded-lg bg-card p-5 shadow-border-small"
      >
        <h1
          id="new-heading"
          className="text-2xl font-semibold tracking-[-0.04em]"
        >
          New Project
        </h1>

        <div className="mt-5 rounded-md bg-[var(--ds-gray-100)] px-3 py-2.5">
          <p className="text-[12px] text-muted-foreground">
            Importing from GitHub
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5 font-medium">
              <GithubLogoIcon className="size-4" />
              {repo.name}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[13px] text-muted-foreground">
              <GitBranchIcon className="size-4" />
              main
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[13px] text-muted-foreground">
              <FolderIcon className="size-4" />
              {repo.root}
            </span>
          </p>
        </div>

        <p className="mt-5 text-muted-foreground">
          Choose where the project runs and give it a name.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="np-server">Nest server</Label>
            <select id="np-server" className={selectClass} defaultValue="s">
              <option value="s">{server.host}</option>
            </select>
          </div>
          <div>
            <Label htmlFor="np-name">Project name</Label>
            <Input
              id="np-name"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              aria-invalid={!valid}
              aria-describedby={valid ? undefined : "np-name-error"}
              autoComplete="off"
              spellCheck={false}
            />
            {!valid ? (
              <p id="np-name-error" className="mt-1.5 text-[13px] text-destructive">
                Use lowercase letters, numbers and hyphens.
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="np-root">Root directory</Label>
            <Input id="np-root" defaultValue={repo.root} className="font-mono" />
          </div>
          <div>
            <Label htmlFor="np-preset">Application preset</Label>
            <select
              id="np-preset"
              className={selectClass}
              defaultValue={repo.preset}
            >
              {PRESETS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {["Build and Output Settings", "Environment Variables"].map((t) => (
            <details
              key={t}
              className="group shadow-border-base rounded-md bg-background"
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-medium tracking-[-0.02em] select-none [&::-webkit-details-marker]:hidden">
                <CaretRightIcon className="size-4 transition-transform group-open:rotate-90" />
                {t}
              </summary>
              <div className="space-y-3 border-t px-3 py-3">
                {t.startsWith("Build") ? (
                  <>
                    <div>
                      <Label htmlFor="np-build">Build command</Label>
                      <Input
                        id="np-build"
                        placeholder="pnpm build"
                        className="font-mono"
                      />
                    </div>
                    <div>
                      <Label htmlFor="np-start">Start command</Label>
                      <Input
                        id="np-start"
                        placeholder="node server.js"
                        className="font-mono"
                      />
                    </div>
                    <div>
                      <Label htmlFor="np-port">Port</Label>
                      <Input
                        id="np-port"
                        inputMode="numeric"
                        placeholder="3000"
                        className="font-mono"
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Variables are stored encrypted and written to the server at
                    deploy time. Adding them is not built yet.
                  </p>
                )}
              </div>
            </details>
          ))}
        </div>

        <Button
          className="mt-5 h-10 w-full"
          onClick={deploy}
          disabled={!valid || phase !== "idle"}
        >
          {phase === "idle"
            ? "Deploy"
            : phase === "deploying"
              ? "Deploying..."
              : "Deployed"}
        </Button>
        <button
          type="button"
          onClick={onBack}
          className="mt-3 w-full text-center text-[13px] text-muted-foreground hover:text-foreground"
        >
          Import a different Git repository
        </button>
      </section>

      <section
        aria-labelledby="deployment-heading"
        aria-live="polite"
        className="rounded-lg bg-card p-5 shadow-border-small"
      >
        <h2
          id="deployment-heading"
          className={cn(
            "text-2xl font-semibold tracking-[-0.04em]",
            phase === "idle" && "text-subtle-foreground"
          )}
        >
          Deployment
        </h2>
        {phase === "idle" ? (
          <p className="mt-2 text-muted-foreground">
            Once you&apos;re ready, start deploying to see the progress here.
          </p>
        ) : phase === "deploying" ? (
          <p className="mt-2 flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 animate-pulse rounded-full bg-[var(--status-building)]"
            />
            Building {name}...
          </p>
        ) : (
          <div className="mt-2">
            <p className="flex items-center gap-2 font-medium">
              <span
                aria-hidden="true"
                className="size-2 rounded-full bg-ready"
              />
              {name} is ready
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Design preview: nothing was deployed.
            </p>
            <Link
              href="/"
              className={cn(buttonVariants({ variant: "outline" }), "mt-4 px-3")}
            >
              Back to projects
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

export function NewProjectFlow() {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Repo | null>(null);

  if (picked) return <Configure repo={picked} onBack={() => setPicked(null)} />;

  const q = query.trim().toLowerCase();
  const repos = q ? REPOS.filter((r) => r.name.includes(q)) : REPOS;

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.04em]">
        Let&apos;s build something new
      </h1>
      <p className="mt-2 text-muted-foreground">
        Import a Git repository and it will be built and run on your Nest
        server.
      </p>

      <section aria-labelledby="import-heading" className="mt-8">
        <h2
          id="import-heading"
          className="mb-3 text-xl font-semibold tracking-[-0.02em]"
        >
          Import Git Repository
        </h2>
        <div className="relative mb-3">
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search repositories"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {repos.length === 0 ? (
          <p className="rounded-lg border border-dashed px-6 py-10 text-center text-muted-foreground">
            No repositories match “{query}”.
          </p>
        ) : (
          <ul className="hairline-y overflow-hidden rounded-lg bg-card shadow-border-small">
            {repos.map((r) => (
              <li
                key={r.name}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <p className="flex min-w-0 items-center gap-3">
                  <GithubLogoIcon className="size-5 shrink-0" />
                  <span className="truncate font-medium tracking-[-0.02em]">
                    {r.name}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    · {r.pushed}
                  </span>
                </p>
                <Button onClick={() => setPicked(r)} className="px-3">
                  Import
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[13px] text-muted-foreground">
          Sample repositories. Connecting GitHub is not built yet.
        </p>
      </section>
    </div>
  );
}
