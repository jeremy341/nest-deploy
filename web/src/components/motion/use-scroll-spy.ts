"use client"

import { useEffect, useState } from "react"

/**
 * Which of these element ids is the reader on? Returns the id, or null on the
 * server (and before the first measurement).
 *
 * Every trigger re-measures all targets with getBoundingClientRect, so jumps
 * (Back to top, hash links, scrollbar drags) can never leave a stale id:
 *  1. scrolled to the very bottom: the last id;
 *  2. otherwise the first element whose top is above 40% of the viewport and
 *     whose bottom is below `offset`;
 *  3. otherwise the last element that is entirely above `offset`;
 *  4. otherwise the first id.
 *
 * Triggers: an IntersectionObserver (rootMargin `-offset 0 -60% 0`, so it
 * fires as headings cross the band), `scrollend`, `hashchange`, `resize` and
 * one evaluation on mount. There is no scroll listener.
 *
 * `ids` must be in document order.
 */
export function useScrollSpy(
  ids: string[],
  options: { offset?: number } = {}
): string | null {
  const offset = options.offset ?? 96
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join("|")

  useEffect(() => {
    const list = key ? key.split("|") : []
    const elements = list
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
    if (elements.length === 0) return

    const evaluate = () => {
      const doc = document.documentElement
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= doc.scrollHeight - 2) {
        setActive(elements[elements.length - 1].id)
        return
      }
      const bandBottom = window.innerHeight * 0.4
      let above: string | null = null
      for (const el of elements) {
        const rect = el.getBoundingClientRect()
        if (rect.bottom <= offset) {
          above = el.id
          continue
        }
        if (rect.top < bandBottom) {
          setActive(el.id)
          return
        }
        break
      }
      setActive(above ?? elements[0].id)
    }

    evaluate()
    let observer: IntersectionObserver | undefined
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(evaluate, {
        rootMargin: `-${offset}px 0px -60% 0px`,
      })
      elements.forEach((el) => observer!.observe(el))
    }
    window.addEventListener("hashchange", evaluate)
    window.addEventListener("resize", evaluate)
    window.addEventListener("scrollend", evaluate)
    return () => {
      observer?.disconnect()
      window.removeEventListener("hashchange", evaluate)
      window.removeEventListener("resize", evaluate)
      window.removeEventListener("scrollend", evaluate)
    }
  }, [key, offset])

  return active
}
