import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A contextual link to the docs: a small ghost button with a trailing arrow.
 * `topic` finishes the accessible name ("Read the docs about environment variables").
 */
export function DocsLink({
  href,
  topic,
  className,
}: {
  href: string;
  topic: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={`Read the docs about ${topic}`}
      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0", className)}
    >
      Docs
      <ArrowUpRightIcon aria-hidden="true" className="size-3.5" />
    </Link>
  );
}

/**
 * A settings section: a title, a short description, content, and an optional
 * footer bar. `docsHref` adds a Docs link at the right of the title.
 * `tone="danger"` draws the frame and footer in the error tones.
 */
export function Card({
  id,
  title,
  description,
  children,
  footer,
  docsHref,
  docsTopic,
  tone = "default",
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  docsHref?: string;
  /** Finishes the Docs link's accessible name. Defaults to the lowercased title. */
  docsTopic?: string;
  tone?: "default" | "danger";
}) {
  const danger = tone === "danger";
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "rounded-lg bg-card",
        danger ? "shadow-[0_0_0_1px_var(--tone-error-ring)]" : "shadow-border-small"
      )}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id={id} className="scroll-mt-20 text-title-2">
            {title}
          </h2>
          {docsHref ? <DocsLink href={docsHref} topic={docsTopic ?? title.toLowerCase()} /> : null}
        </div>
        {description ? <p className="mt-1 text-muted-foreground">{description}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
      {footer ? (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t px-5 py-3",
            danger ? "bg-[var(--tone-error-bg)]" : "bg-background-subtle"
          )}
        >
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-label text-muted-foreground">
      {children}
    </label>
  );
}
