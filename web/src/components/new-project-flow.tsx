"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GitBranchIcon,
  GithubLogoIcon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { api } from "@/components/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Repo = {
  id: number;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  pushedAt: string | null;
  cloneUrl: string;
};

type Source = {
  repoUrl: string;
  repoFullName: string | null;
  installationId: number | null;
  branch: string;
};

export type GithubState = {
  configured: boolean;
  installUrl: string | null;
  installations: { id: number; account: string; type: string }[];
  notice: string | null;
};

type Server = { id: string; nestUsername: string; status: string };

const RUNTIMES = [
  { value: "node", label: "Node.js", hint: "npm start" },
  { value: "python", label: "Python", hint: "python3 app.py" },
  { value: "static", label: "Static site", hint: "served for you" },
  { value: "command", label: "Custom command", hint: "./my-binary" },
] as const;

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] text-muted-foreground">
      {children}
    </label>
  );
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "project"
  );
}

function Configure({
  source,
  servers,
  onBack,
}: {
  source: Source;
  servers: Server[];
  onBack: () => void;
}) {
  const router = useRouter();
  const repoName = (source.repoFullName ?? source.repoUrl).split("/").pop()?.replace(/\.git$/, "") ?? "project";
  const [name, setName] = useState(slugify(repoName));
  const [serverId, setServerId] = useState(servers[0]?.id ?? "");
  const [runtime, setRuntime] = useState<(typeof RUNTIMES)[number]["value"]>("node");
  const [rootDir, setRootDir] = useState(".");
  const [branch, setBranch] = useState(source.branch);
  const [port, setPort] = useState("3000");
  const [startCommand, setStartCommand] = useState("");
  const [buildCommand, setBuildCommand] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOk = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]?$/.test(name);
  const hint = RUNTIMES.find((r) => r.value === runtime)?.hint ?? "";

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const created = await api<{ project: { id: string; slug: string } }>("/api/projects", {
        body: {
          serverId,
          name,
          slug: name,
          repoUrl: source.repoUrl,
          repoFullName: source.repoFullName,
          installationId: source.installationId,
          productionBranch: branch,
          rootDir: rootDir || ".",
          runtime,
          startCommand: startCommand.trim() || null,
          buildCommand: buildCommand.trim() || null,
          outputDir: runtime === "static" ? outputDir.trim() || null : null,
          port: Number(port),
        },
      });
      const dep = await api<{ deployment: { id: string } }>(
        `/api/projects/${created.project.id}/deploy`,
        { body: {} }
      );
      router.push(`/projects/${created.project.slug}/deployments/${dep.deployment.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  if (servers.length === 0) {
    return (
      <div className="mx-auto max-w-[600px] rounded-lg bg-card p-6 text-center shadow-border-small">
        <p className="text-lg font-semibold tracking-[-0.02em]">Connect a server first</p>
        <p className="mt-1 text-muted-foreground">Projects are deployed to a Nest container.</p>
        <Link href="/connect" className={cn(buttonVariants(), "mt-4 h-10 px-4")}>
          Connect a server
        </Link>
      </div>
    );
  }

  return (
    <section aria-labelledby="new-heading" className="mx-auto w-full max-w-[600px] rounded-lg bg-card p-5 shadow-border-small">
      <h1 id="new-heading" className="text-2xl font-semibold tracking-[-0.04em]">
        New Project
      </h1>

      <div className="mt-5 rounded-md bg-[var(--ds-gray-100)] px-3 py-2.5">
        <p className="text-[12px] text-muted-foreground">Importing from GitHub</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5 font-medium">
            <GithubLogoIcon className="size-4" />
            {source.repoFullName ?? source.repoUrl.replace("https://github.com/", "")}
          </span>
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="np-server">Nest server</Label>
          <select id="np-server" className={selectClass} value={serverId} onChange={(e) => setServerId(e.target.value)}>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nestUsername}.hackclub.app
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="np-name">Project name</Label>
          <Input
            id="np-name"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            aria-invalid={!nameOk}
            autoComplete="off"
            spellCheck={false}
          />
          {!nameOk ? (
            <p className="mt-1.5 text-[13px] text-destructive">Use lowercase letters, numbers and hyphens.</p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="np-runtime">Application preset</Label>
          <select id="np-runtime" className={selectClass} value={runtime} onChange={(e) => setRuntime(e.target.value as typeof runtime)}>
            {RUNTIMES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="np-branch">Production branch</Label>
          <Input id="np-branch" value={branch} onChange={(e) => setBranch(e.target.value)} className="font-mono" />
        </div>
        <div>
          <Label htmlFor="np-root">Root directory</Label>
          <Input id="np-root" value={rootDir} onChange={(e) => setRootDir(e.target.value)} className="font-mono" />
        </div>
        <div>
          <Label htmlFor="np-port">Port your app listens on</Label>
          <Input id="np-port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} className="font-mono" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="np-start">Start command (optional)</Label>
          <Input id="np-start" value={startCommand} onChange={(e) => setStartCommand(e.target.value)} placeholder={hint} className="font-mono" />
        </div>
        <div className={runtime === "static" ? "" : "sm:col-span-2"}>
          <Label htmlFor="np-build">Build command (optional)</Label>
          <Input id="np-build" value={buildCommand} onChange={(e) => setBuildCommand(e.target.value)} placeholder="detected from package.json" className="font-mono" />
        </div>
        {runtime === "static" ? (
          <div>
            <Label htmlFor="np-out">Output directory</Label>
            <Input id="np-out" value={outputDir} onChange={(e) => setOutputDir(e.target.value)} placeholder="dist" className="font-mono" />
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-[13px] text-muted-foreground">
        Your app must listen on the <code className="font-mono">PORT</code> environment variable on{" "}
        <code className="font-mono">0.0.0.0</code>. Environment variables can be added in the project settings.
      </p>

      {error ? (
        <p role="alert" className="mt-4 flex gap-2 rounded-md bg-destructive/5 p-3 text-destructive">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <Button className="mt-5 h-10 w-full" onClick={() => void submit()} disabled={busy || !nameOk || !serverId}>
        {busy ? "Starting deployment..." : "Deploy"}
      </Button>
      <button type="button" onClick={onBack} className="mt-3 w-full text-center text-[13px] text-muted-foreground hover:text-foreground">
        Import a different Git repository
      </button>
    </section>
  );
}

function GithubRepos({
  installationId,
  onPick,
}: {
  installationId: number;
  onPick: (repo: Repo) => void;
}) {
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<{ repos: Repo[] }>(`/api/github/repos?installation=${installationId}`)
      .then((r) => {
        if (!cancelled) setRepos(r.repos);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load repositories");
      });
    return () => {
      cancelled = true;
    };
  }, [installationId]);

  if (error) return <p role="alert" className="text-destructive">{error}</p>;
  if (!repos) return <div aria-busy="true" className="skeleton-sweep h-40 rounded-lg" />;

  const q = query.trim().toLowerCase();
  const list = q ? repos.filter((r) => r.fullName.toLowerCase().includes(q)) : repos;

  return (
    <div>
      <div className="relative mb-3">
        <MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" aria-label="Search repositories" placeholder="Search..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
      </div>
      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed px-6 py-10 text-center text-muted-foreground">
          {repos.length === 0 ? "No repositories shared with the app yet." : `No repositories match “${query}”.`}
        </p>
      ) : (
        <ul className="hairline-y overflow-hidden rounded-lg bg-card shadow-border-small">
          {list.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="flex min-w-0 items-center gap-3">
                <GithubLogoIcon className="size-5 shrink-0" />
                <span className="truncate font-medium tracking-[-0.02em]">{r.fullName}</span>
                {r.private ? <span className="shrink-0 rounded-full border px-2 text-[12px] text-muted-foreground">Private</span> : null}
              </p>
              <Button onClick={() => onPick(r)} className="px-3">
                Import
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NewProjectFlow({ servers, github }: { servers: Server[]; github: GithubState }) {
  const [source, setSource] = useState<Source | null>(null);
  const [installation, setInstallation] = useState<number | null>(github.installations[0]?.id ?? null);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  if (source) return <Configure source={source} servers={servers} onBack={() => setSource(null)} />;

  function useUrl(e: React.FormEvent) {
    e.preventDefault();
    const m = url.trim().match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
    if (!m) {
      setUrlError("Enter a GitHub repository URL such as https://github.com/owner/name");
      return;
    }
    setUrlError(null);
    setSource({
      repoUrl: `https://github.com/${m[1]}/${m[2]}`,
      repoFullName: null,
      installationId: null,
      branch: "main",
    });
  }

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.04em]">Let&apos;s build something new</h1>
      <p className="mt-2 text-muted-foreground">
        Import a Git repository and it will be built and run on your Nest server.
      </p>

      {github.notice ? (
        <p role="status" className="mt-4 rounded-md bg-[var(--ds-gray-100)] p-3">
          {github.notice}
        </p>
      ) : null}

      <section aria-labelledby="import-heading" className="mt-8">
        <h2 id="import-heading" className="mb-3 text-xl font-semibold tracking-[-0.02em]">
          Import Git Repository
        </h2>

        {github.configured && github.installations.length > 0 && installation ? (
          <>
            <div className="mb-3 flex items-center gap-2">
              <label htmlFor="gh-install" className="sr-only">GitHub account</label>
              <select id="gh-install" value={installation} onChange={(e) => setInstallation(Number(e.target.value))} className={cn(selectClass, "max-w-56")}>
                {github.installations.map((i) => (
                  <option key={i.id} value={i.id}>{i.account}</option>
                ))}
              </select>
              {github.installUrl ? (
                <a href={github.installUrl} className="text-[13px] text-muted-foreground underline">
                  Add another account or repository
                </a>
              ) : null}
            </div>
            <GithubRepos
              key={installation}
              installationId={installation}
              onPick={(r) =>
                setSource({
                  repoUrl: `https://github.com/${r.fullName}`,
                  repoFullName: r.fullName,
                  installationId: installation,
                  branch: r.defaultBranch,
                })
              }
            />
          </>
        ) : github.configured ? (
          <div className="rounded-lg bg-card p-5 shadow-border-small">
            <p className="font-medium tracking-[-0.02em]">Connect GitHub</p>
            <p className="mt-1 text-muted-foreground">
              Install the Nest Deploy GitHub App to pick repositories, deploy private ones, and deploy on every push.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {github.installUrl ? (
                <a href={github.installUrl} className={cn(buttonVariants(), "h-9 px-3")}>
                  <GithubLogoIcon />
                  Install the GitHub App
                </a>
              ) : null}
              <a href="/api/github/connect" className={cn(buttonVariants({ variant: "outline" }), "h-9 px-3")}>
                I already installed it
              </a>
            </div>
          </div>
        ) : null}

        <form onSubmit={useUrl} className="mt-6 rounded-lg bg-card p-5 shadow-border-small">
          <label htmlFor="repo-url" className="font-medium tracking-[-0.02em]">
            {github.configured ? "Or use a public repository URL" : "Public repository URL"}
          </label>
          <div className="mt-2 flex gap-2">
            <Input
              id="repo-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/name"
              aria-invalid={Boolean(urlError)}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
            <Button type="submit" className="px-3" disabled={!url.trim()}>
              <GitBranchIcon />
              Continue
            </Button>
          </div>
          {urlError ? <p role="alert" className="mt-2 text-[13px] text-destructive">{urlError}</p> : null}
          {!github.configured ? (
            <p className="mt-2 text-[13px] text-muted-foreground">
              The GitHub App is not set up on this installation, so only public repositories work, and pushes do not deploy automatically.
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
