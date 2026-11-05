import localFont from "next/font/local";

/**
 * The pixel display face. Public pages only (marketing, docs, login, status,
 * not found); never in the dashboard. Put `pixel.variable` on a wrapper and
 * use the `font-pixel` utility.
 *
 * Pixelify Sans is hosted with the app (SIL Open Font License, from Google
 * Fonts), so it does not depend on fonts.googleapis.com being reachable when
 * the server starts. The Latin and Latin-extended files are the same family.
 */
export const pixel = localFont({
  variable: "--font-pixel",
  display: "swap",
  src: [
    { path: "../app/fonts/pixelify-sans-latin.woff2", weight: "400 700", style: "normal" },
    { path: "../app/fonts/pixelify-sans-latin-ext.woff2", weight: "400 700", style: "normal" },
  ],
});
