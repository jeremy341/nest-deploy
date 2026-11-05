"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon, MinusCircleIcon } from "@phosphor-icons/react";
import { api } from "@/components/api";
import { Label } from "@/components/settings-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";
import type { CloneSettings } from "@/server/clone-settings";
import type { RootDetection } from "@/server/root-detect";

/** The build settings the form holds as text, before they are saved. */
export type BuildForm = {
  runtime: CloneSettings["runtime"];
  installCommand: string;
  buildCommand: string;
  outputDir: string;
  rootDir: string;
};

export function toBuildForm(s: CloneSettings): BuildForm {
  return {
    runtime: s.runtime,
    installCommand: s.installCommand ?? "",
    buildCommand: s.buildCommand ?? "",
    outputDir: s.outputDir ?? "",
    rootDir: s.rootDir || ".",
  };
}

/** The part of the save request that these fields own. */
export function buildBody(b: BuildForm) {
  return {
    runtime: b.runtime,
    installCommand: b.installCommand.trim() || null,
    buildCommand: b.buildCommand.trim() || null,
    outputDir: b.outputDir.trim() || null,
    rootDir: b.rootDir.trim() || ".",
  };
}

const RUNTIME_LABEL: Record<BuildForm["runtime"], string> = {
  node: "Node.js",
  python: "Python",
  static: "Static site",
  command: "Custom command",
};

type Source = { id: string; name: string; runtime: string };

const isSubfolder = (dir: string) => dir.trim().replace(/^\.\/?$/, "") !== "";

/**
 * Build settings that the main form does not carry (runtime, install, build,
 * output and root directory), the "copy from another project" control, and the
 * monorepo hint that shows what is in the root directory.
 *
 * Copying only fills the form: `onCopy` receives the values, and nothing is
 * saved until the user presses Save.
 */
export function ProjectBuildFields({
  projectId,
  build,
  onLoad,
  onChange,
  onCopy,
}: {
  projectId: string;
  /** Null until this project's own settings have been loaded. */
  build: BuildForm | null;
  onLoad: (b: BuildForm) => void;
  onChange: (b: BuildForm) => void;
  onCopy: (s: CloneSettings, sourceName: string) => void;
}) {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [pick, setPick] = useState("");
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<{ current: CloneSettings; sources: Source[] }>(`/api/projects/${projectId}/clone`)
      .then((r) => {
        if (!live) return;
        setSources(r.sources);
        onLoad(toBuildForm(r.current));
      })
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
    // Load once per project. onLoad only stores the values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function copy() {
    const source = sources?.find((s) => s.id === pick);
    if (!source) return;
    setCopying(true);
    try {
      const r = await api<{ settings: CloneSettings }>(
        `/api/projects/${projectId}/clone?from=${encodeURIComponent(source.id)}`
      );
      onCopy(r.settings, source.name);
      setCopied(source.name);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not copy the settings");
    } finally {
      setCopying(false);
    }
  }

  if (loadError) {
    return (
      <p role="alert" className="text-label text-destructive sm:col-span-2">
        Could not load the build settings. Reload the page to try again.
      </p>
    );
  }

  return (
    <>
      <div className="rounded-md bg-background-subtle p-3 sm:col-span-2">
        <Label htmlFor="ps-clone">Copy build settings from another project</Label>
        {sources && sources.length === 0 ? (
          <p className="text-muted-foreground">
            There are no other projects on this server to copy from.
          </p>
        ) : (
          <div className="flex gap-2">
            <NativeSelect
              id="ps-clone"
              value={pick}
              disabled={!sources}
              onChange={(e) => setPick(e.target.value)}
              aria-describedby="ps-clone-help"
            >
              <option value="">{sources ? "Choose a project" : "Loading…"}</option>
              {sources?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({RUNTIME_LABEL[s.runtime as BuildForm["runtime"]] ?? s.runtime})
                </option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              variant="outline"
              disabled={!pick}
              loading={copying}
              onClick={() => void copy()}
            >
              {copying ? "Copying…" : "Copy"}
            </Button>
          </div>
        )}
        <p id="ps-clone-help" role="status" className="mt-1.5 text-label text-muted-foreground">
          {copied
            ? `Copied from ${copied}. Review the fields below, then press Save. Nothing is saved yet.`
            : "Copies the runtime, install, build and start commands, output and root directory, and health path. Variables, secrets, hooks, notifications, the port and the repository are not copied."}
        </p>
      </div>

      {build ? (
        <>
          <div>
            <Label htmlFor="ps-runtime">Runtime</Label>
            <NativeSelect
              id="ps-runtime"
              value={build.runtime}
              onChange={(e) => onChange({ ...build, runtime: e.target.value as BuildForm["runtime"] })}
            >
              {(Object.keys(RUNTIME_LABEL) as BuildForm["runtime"][]).map((r) => (
                <option key={r} value={r}>
                  {RUNTIME_LABEL[r]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="ps-root">Root directory</Label>
            <Input
              id="ps-root"
              value={build.rootDir}
              placeholder="."
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange({ ...build, rootDir: e.target.value })}
              aria-describedby="ps-root-help"
              className="font-mono"
            />
          </div>
          <RootHelp projectId={projectId} rootDir={build.rootDir} />
          <div>
            <Label htmlFor="ps-install">Install command</Label>
            <Input
              id="ps-install"
              value={build.installCommand}
              placeholder="Chosen from your lockfile"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange({ ...build, installCommand: e.target.value })}
              className="font-mono"
            />
          </div>
          <div>
            <Label htmlFor="ps-build">Build command</Label>
            <Input
              id="ps-build"
              value={build.buildCommand}
              placeholder="npm run build"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange({ ...build, buildCommand: e.target.value })}
              className="font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ps-output">Output directory</Label>
            <Input
              id="ps-output"
              value={build.outputDir}
              placeholder="dist (static sites only)"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onChange({ ...build, outputDir: e.target.value })}
              className="font-mono"
            />
          </div>
        </>
      ) : (
        <p className="text-label text-muted-foreground sm:col-span-2">Loading build settings…</p>
      )}
    </>
  );
}

/**
 * Under the root directory field. Reads the folder from GitHub (the saved
 * branch) and says what a build would find there.
 */
function RootHelp({ projectId, rootDir }: { projectId: string; rootDir: string }) {
  const sub = isSubfolder(rootDir);
  const [state, setState] = useState<
    { for: string; detection: RootDetection | null; failed: boolean } | null
  >(null);

  useEffect(() => {
    if (!sub) return;
    const ctl = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/projects/${projectId}/detect?root=${encodeURIComponent(rootDir.trim())}`, {
        signal: ctl.signal,
      })
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) =>
          setState({
            for: rootDir,
            detection: ok ? (j.detection as RootDetection) : null,
            failed: !ok,
          })
        )
        .catch((e) => {
          if ((e as Error).name !== "AbortError") setState({ for: rootDir, detection: null, failed: true });
        });
    }, 600);
    return () => {
      window.clearTimeout(timer);
      ctl.abort();
    };
  }, [projectId, rootDir, sub]);

  const current = state && state.for === rootDir ? state : null;

  return (
    <div id="ps-root-help" role="status" className="sm:col-span-2">
      {!sub ? (
        <p className="text-label text-muted-foreground">
          Leave as . for the repository root. In a monorepo, set the folder the app lives in, such
          as apps/web.
        </p>
      ) : !current ? (
        <p className="text-label text-muted-foreground">Looking in {rootDir.trim()} on GitHub…</p>
      ) : current.failed || !current.detection ? (
        <p className="text-label text-muted-foreground">Could not look at the folder right now.</p>
      ) : current.detection.status !== "ok" ? (
        <p className="text-label text-muted-foreground">{current.detection.message}</p>
      ) : (
        <Found d={current.detection} dir={rootDir.trim()} />
      )}
    </div>
  );
}

function Found({ d, dir }: { d: RootDetection; dir: string }) {
  const rows: { label: string; found: boolean; value: string }[] = [
    {
      label: "package.json",
      found: d.packageJson,
      value: d.packageJson ? (d.packageName ? `found (${d.packageName})` : "found") : "not found",
    },
    {
      label: "Lockfile",
      found: d.lockfile !== null,
      value: d.lockfile ? `${d.lockfile} (${{ npm: "package-lock.json", pnpm: "pnpm-lock.yaml", yarn: "yarn.lock" }[d.lockfile]})` : "none found",
    },
    {
      label: "requirements.txt",
      found: d.requirements,
      value: d.requirements ? "found" : "not found",
    },
    {
      label: "Start script",
      found: d.scripts.start,
      value: d.scripts.start ? "start" : "no start script",
    },
  ];
  return (
    <div className="rounded-md bg-background-subtle p-3">
      <p className="mb-1.5 text-label text-muted-foreground">Found in {dir} on the saved branch</p>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              {r.found ? (
                <CheckCircleIcon aria-hidden="true" className="size-3.5 text-[var(--tone-success-icon)]" />
              ) : (
                <MinusCircleIcon aria-hidden="true" className="size-3.5" />
              )}
              {r.label}
            </dt>
            <dd className="font-mono text-[13px]">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
