/**
 * Everyone's own look (25 September 2026). White is the default; dark, or
 * following the device, for those who want it; and four colour themes, each
 * tinted (a light page with a touch of the colour) or shaded (a dark page in
 * the colour). Status colours never change with the theme: red still means
 * something is wrong, whatever the page around it looks like.
 */

export type ThemeId =
  | "white"
  | "dark"
  | "system"
  | "navy-tinted"
  | "navy-shaded"
  | "royal-tinted"
  | "royal-shaded"
  | "gold-tinted"
  | "gold-shaded"
  | "teal-tinted"
  | "teal-shaded";

export type Tint = "navy" | "royal" | "gold" | "teal";

export interface ThemeSpec {
  id: ThemeId;
  label: string;
  /** light or dark; system follows the device. */
  mode: "light" | "dark" | "system";
  tint: Tint | null;
  /** For the picker's preview: page, card and accent. */
  swatch: { page: string; card: string; accent: string; ink: string };
}

export const TINTS: { id: Tint; label: string }[] = [
  { id: "navy", label: "Navy" },
  { id: "royal", label: "Royal blue" },
  { id: "gold", label: "Gold" },
  { id: "teal", label: "Teal" },
];

export const THEMES: ThemeSpec[] = [
  { id: "white", label: "White", mode: "light", tint: null, swatch: { page: "#f9f9f7", card: "#ffffff", accent: "#2a78d6", ink: "#0b0b0b" } },
  { id: "dark", label: "Dark", mode: "dark", tint: null, swatch: { page: "#0d0d0d", card: "#1a1a19", accent: "#3987e5", ink: "#ffffff" } },
  { id: "system", label: "Match my device", mode: "system", tint: null, swatch: { page: "#f9f9f7", card: "#1a1a19", accent: "#2a78d6", ink: "#52514e" } },
  { id: "navy-tinted", label: "Navy, tinted", mode: "light", tint: "navy", swatch: { page: "#eef2f8", card: "#f8fafd", accent: "#0b1f3a", ink: "#0b1f3a" } },
  { id: "navy-shaded", label: "Navy, shaded", mode: "dark", tint: "navy", swatch: { page: "#0a1424", card: "#111e33", accent: "#6f9be0", ink: "#e8eef8" } },
  { id: "royal-tinted", label: "Royal blue, tinted", mode: "light", tint: "royal", swatch: { page: "#eef3fd", card: "#f8faff", accent: "#1f4fbf", ink: "#0d1f4d" } },
  { id: "royal-shaded", label: "Royal blue, shaded", mode: "dark", tint: "royal", swatch: { page: "#0b1330", card: "#131e45", accent: "#7ea4ff", ink: "#e9efff" } },
  { id: "gold-tinted", label: "Gold, tinted", mode: "light", tint: "gold", swatch: { page: "#faf6ea", card: "#fdfbf4", accent: "#a67c00", ink: "#2b2208" } },
  { id: "gold-shaded", label: "Gold, shaded", mode: "dark", tint: "gold", swatch: { page: "#17130a", card: "#221c0f", accent: "#e0bb45", ink: "#f6efdc" } },
  { id: "teal-tinted", label: "Teal, tinted", mode: "light", tint: "teal", swatch: { page: "#edf7f6", card: "#f7fcfb", accent: "#0e7c72", ink: "#082b28" } },
  { id: "teal-shaded", label: "Teal, shaded", mode: "dark", tint: "teal", swatch: { page: "#08171a", card: "#0f2226", accent: "#4fc2b5", ink: "#e3f5f2" } },
];

export const DEFAULT_THEME: ThemeId = "white";

export const themeOf = (id: string | null | undefined): ThemeSpec => THEMES.find((t) => t.id === id) ?? THEMES[0];

/** What goes on <html>: data-theme for light or dark (none follows the device), data-tint for a colour. */
export function themeAttributes(id: string | null | undefined): { "data-theme"?: "light" | "dark"; "data-tint"?: Tint } {
  const t = themeOf(id);
  return {
    ...(t.mode === "system" ? {} : { "data-theme": t.mode }),
    ...(t.tint ? { "data-tint": t.tint } : {}),
  };
}
