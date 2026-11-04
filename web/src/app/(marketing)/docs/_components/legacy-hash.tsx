"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { legacyHref } from "../_data/nav";

/**
 * Docs used to be one long page, so old links look like `/docs#servers`. A
 * server never sees the part after the `#`, so this checks it in the browser
 * and moves to the page that section lives on now. Nothing happens when the
 * hash points at something on the page already.
 */
export function LegacyHashRedirect() {
  const router = useRouter();
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash || document.getElementById(hash)) return;
    const href = legacyHref(hash);
    if (href) router.replace(href);
  }, [router]);
  return null;
}
