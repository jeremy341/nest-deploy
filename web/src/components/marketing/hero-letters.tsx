import type { CSSProperties } from "react";

/**
 * The hero headline with every letter in its own span, so each one can light up
 * like a pixel (see `.hero-letter` in globals.css). This needs no JavaScript on
 * either side: the letters are ordinary server-rendered text, fully visible by
 * default, and the animation is CSS only, so there is no hidden-text flash.
 *
 * Accessibility: the heading's accessible name is the plain text in the
 * screen-reader span; the visual letters are aria-hidden. Words stay whole
 * (inline-block, no wrap inside) so the line breaks match the plain text.
 */
export function HeroLetters({ text }: { text: string }) {
  let index = 0;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.split(" ").map((word, w) => (
          <span key={w}>
            {w > 0 ? " " : null}
            <span className="inline-block whitespace-nowrap">
              {Array.from(word).map((char, c) => (
                <span
                  key={c}
                  data-l=""
                  style={{ "--i": index++ } as CSSProperties}
                  className="hero-letter inline-block"
                >
                  {char}
                </span>
              ))}
            </span>
          </span>
        ))}
      </span>
    </>
  );
}
