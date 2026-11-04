import type { ReactNode } from "react";

export const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

/** A settings section: a title, a short description, content, and an optional footer bar. */
export function Card({
  id,
  title,
  description,
  children,
  footer,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-lg bg-card shadow-border-small">
      <div className="p-5">
        <h2 id={id} className="text-xl font-semibold tracking-[-0.02em]">
          {title}
        </h2>
        {description ? <p className="mt-1 text-muted-foreground">{description}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
      {footer ? (
        <div className="flex items-center justify-between gap-3 rounded-b-lg border-t bg-background-subtle px-5 py-3">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] text-muted-foreground">
      {children}
    </label>
  );
}
