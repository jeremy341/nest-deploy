import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import { commitUrl } from "@/lib/github";
import { cn } from "@/lib/utils";

/**
 * A short commit SHA. It links to the commit on GitHub (new tab) when the
 * repository and the full SHA are known, and is plain text otherwise, so there
 * is never a dead link. Inside a row whose main link is stretched over it, the
 * anchor sits above that link (`relative z-10`) instead of nested in it.
 */
export function CommitLink({
  repo,
  sha,
  fallback,
  link = true,
  className,
}: {
  repo: string | null | undefined;
  /** Full SHA (a short one still links, GitHub resolves it). */
  sha: string | null | undefined;
  /** Text to show when there is no SHA yet. */
  fallback?: string;
  /** False for demo data: always plain text. */
  link?: boolean;
  className?: string;
}) {
  const short = sha ? sha.slice(0, 7) : null;
  const url = link ? commitUrl(repo, sha) : null;

  if (!short) return fallback ? <span className={className}>{fallback}</span> : null;
  if (!url) return <span className={className}>{short}</span>;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open commit ${short} on GitHub`}
      className={cn(
        "relative z-10 inline-flex shrink-0 items-center gap-0.5 underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline max-sm:min-h-10",
        className
      )}
    >
      {short}
      <ArrowUpRightIcon aria-hidden="true" className="size-3 shrink-0" />
    </a>
  );
}
