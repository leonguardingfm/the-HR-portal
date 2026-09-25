/**
 * Colour contrast across every theme (26 September 2026).
 *
 * Reads the colour tokens straight out of app/globals.css — white, dark, and
 * each colour tinted and shaded — and measures each pairing the screens use
 * against WCAG 2.2 AA: 4.5:1 for text, 3:1 for the lines and dots that carry
 * meaning. Fails the build when a theme would leave text hard to read.
 *
 *   npm run test:contrast
 */

import { readFileSync } from "node:fs";
import path from "node:path";

type Rgba = [number, number, number, number];
type Tokens = Record<string, string>;

const css = readFileSync(path.join(__dirname, "..", "app", "globals.css"), "utf8");

/** The declarations inside the first block whose selector matches. */
function block(selector: RegExp): Tokens {
  const m = selector.exec(css);
  if (!m) throw new Error(`No block for ${selector}`);
  let depth = 0;
  let i = css.indexOf("{", m.index + m[0].length - 1);
  const start = i + 1;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) break;
  }
  const out: Tokens = {};
  for (const d of css.slice(start, i).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  return out;
}

function parse(c: string): Rgba {
  c = c.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join("") : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/.exec(c);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), rgba[4] === undefined ? 1 : Number(rgba[4])];
  throw new Error(`Cannot read colour ${c}`);
}

const over = (top: Rgba, under: Rgba): Rgba => {
  const a = top[3];
  return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
};
const lum = ([r, g, b]: Rgba) => {
  const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: Rgba, b: Rgba) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// The themes, built the way the browser builds them: base, then dark, then the tint.
const light = block(/:root\s*\{/);
const dark = { ...light, ...block(/:root\[data-theme="dark"\]\s*\{/) };
const deviceDark = { ...light, ...block(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:where\(:not\(\[data-theme="light"\]\)\)\s*\{/) };
const themes: Record<string, Tokens> = { White: light, Dark: dark, "Device (dark)": deviceDark };
for (const tint of ["lilac", "royal", "gold", "teal"]) {
  const name = tint[0].toUpperCase() + tint.slice(1);
  themes[`${name} tinted`] = { ...light, ...block(new RegExp(`:root\\[data-theme="light"\\]\\[data-tint="${tint}"\\]\\s*\\{`)) };
  themes[`${name} shaded`] = { ...dark, ...block(new RegExp(`:root\\[data-theme="dark"\\]\\[data-tint="${tint}"\\]\\s*\\{`)) };
}

const WHITE: Rgba = [255, 255, 255, 1];
type Pair = { fg: string; bg: string; on?: string; min: number; what: string };
const TEXT = 4.5;
const LINE = 3;
const pairs: Pair[] = [];
for (const ink of ["--text-primary", "--text-secondary", "--text-muted"]) {
  for (const bg of ["--page", "--surface-1"]) pairs.push({ fg: ink, bg, min: TEXT, what: "text" });
  for (const wash of ["--wash", "--wash-critical", "--wash-warning", "--wash-neutral"]) pairs.push({ fg: ink, bg: wash, on: "--surface-1", min: TEXT, what: "text on a highlighted row" });
}
for (const ink of ["--accent-text", "--critical-text", "--good-text", "--warning-text", "--serious-text", "--gold-text"]) {
  for (const bg of ["--page", "--surface-1"]) pairs.push({ fg: ink, bg, min: TEXT, what: "coloured text" });
  pairs.push({ fg: ink, bg: "--wash-critical", on: "--surface-1", min: TEXT, what: "coloured text on a red row" });
}
for (const fill of ["--series-1", "--brand-royal", "--brand-navy", "--status-critical", "--button-good"]) pairs.push({ fg: "#fff", bg: fill, min: TEXT, what: "white text on a button" });
pairs.push({ fg: "--text-primary", bg: "--brand-gold-wash", on: "--surface-1", min: TEXT, what: "text on a gold chip" });
for (const line of ["--series-1", "--status-critical", "--focus-ring"]) pairs.push({ fg: line, bg: "--surface-1", min: LINE, what: "line or focus ring" });

let failures = 0;
for (const [theme, t] of Object.entries(themes)) {
  const get = (k: string) => (k.startsWith("#") ? parse(k) : parse(t[k] ?? (() => { throw new Error(`${theme}: ${k} is not defined`); })()));
  const rows: string[] = [];
  for (const p of pairs) {
    const base = p.on ? get(p.on) : get("--page");
    const bg = over(get(p.bg), base);
    const fg = over(get(p.fg), bg);
    const r = ratio(fg, bg);
    if (r < p.min) {
      failures++;
      rows.push(`  ✕ ${p.fg} on ${p.bg}${p.on ? ` (over ${p.on})` : ""}: ${r.toFixed(2)} — needs ${p.min} (${p.what})`);
    }
  }
  console.log(`${rows.length ? "FAIL" : "PASS"}  ${theme}${rows.length ? "" : `  <- ${pairs.length} pairs`}`);
  for (const r of rows) console.log(r);
}
if (failures) {
  console.log(`\n${failures} pairing${failures === 1 ? "" : "s"} below WCAG AA.`);
  process.exit(1);
}
console.log("\nEvery theme meets WCAG AA contrast.");
