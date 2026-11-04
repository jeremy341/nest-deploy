import { Pixelify_Sans } from "next/font/google";

/**
 * The pixel display face. Public pages only (marketing, docs, login, status,
 * not found); never in the dashboard. Put `pixel.variable` on a wrapper and
 * use the `font-pixel` utility.
 */
export const pixel = Pixelify_Sans({ variable: "--font-pixel", subsets: ["latin"] });
