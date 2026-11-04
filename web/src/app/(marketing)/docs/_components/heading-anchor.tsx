"use client";

import { LinkSimpleIcon } from "@phosphor-icons/react";
import { toast } from "@/components/ui/toast";

/**
 * The "link to this heading" control that fades in beside an `h2` or `h3`.
 * Navigation is the browser's own hash navigation; on top of that it copies
 * the address and says so. If the clipboard is unavailable it only navigates.
 */
export function HeadingAnchor({ id, title }: { id: string; title: string }) {
  async function copy() {
    try {
      const url = `${window.location.origin}${window.location.pathname}#${id}`;
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      // No clipboard permission: the hash navigation still happened.
    }
  }

  return (
    <a
      href={`#${id}`}
      onClick={copy}
      aria-label={`Link to ${title}`}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-subtle-foreground opacity-0 transition-[opacity,color] duration-(--dur-fast) ease-snappy group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 max-sm:hidden pointer-coarse:opacity-100 lg:absolute lg:top-1/2 lg:-left-8 lg:-translate-y-1/2"
    >
      <LinkSimpleIcon aria-hidden="true" className="size-4" />
    </a>
  );
}
