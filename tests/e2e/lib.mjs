/**
 * Browser tests against a running portal (26 September 2026).
 *
 *   npm run dev            (or npm run build && npm start)
 *   npm run test:e2e       every suite
 *   npm run test:e2e -- security hub    some of them
 *
 * They sign in as the demonstration accounts, so they need the demonstration
 * data (npm run db:seed, npm run demo:duty, npm run demo:hub) — never run them
 * against production. E2E_BASE_URL, E2E_PASSWORD and DATABASE_URL override
 * the defaults; E2E_CHANNEL=chrome uses the installed Chrome.
 */

import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const PASSWORD = process.env.E2E_PASSWORD ?? "leon-portal-dev";

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.replace(/\?.*$/, "");
  const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
  const m = /^DATABASE_URL=["']?([^"'\n]+)/m.exec(env);
  if (!m) throw new Error("Set DATABASE_URL.");
  return m[1].replace(/\?.*$/, "");
}
const DB = databaseUrl();
if (/prod/i.test(DB) && !process.env.E2E_I_KNOW) throw new Error("That looks like a production database. The browser tests change demonstration data.");

/** One line of SQL against the test database; rows as text. */
export const sql = (q) => execSync(`psql "${DB}" -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim();

let fails = 0;
let passes = 0;
export function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  <- ${String(detail).replace(/\s+/g, " ").slice(0, 240)}` : ""}`);
  if (ok) passes++;
  else fails++;
}
export const results = () => ({ fails, passes });

export async function launch() {
  const channel = process.env.E2E_CHANNEL || undefined;
  return chromium.launch({ channel, headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
}

/** A signed-in page. Errors in the page are collected on page.errors. */
export async function signIn(browser, username, { width = 1440, height = 950, landing, role, geo } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    ...(geo ? { permissions: ["camera", "geolocation"], geolocation: geo } : {}),
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(m.text()) && page.errors.push(m.text().slice(0, 200)));
  await page.goto(BASE + "/signin");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  if (role) await switchRole(page, role);
  if (landing) {
    await page.goto(BASE + landing);
    await page.waitForLoadState("networkidle");
  }
  return page;
}

/** The name menu, top right: switch to another role this person holds. */
export async function switchRole(page, label) {
  await page.locator("header").locator('[aria-haspopup="menu"]').first().click();
  await page.getByRole("menuitemradio", { name: label }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}

export async function go(page, path) {
  const res = await page.goto(BASE + path);
  await page.waitForLoadState("networkidle");
  return res;
}

export const text = async (locator) => (await locator.innerText().catch(() => "")).replace(/\s+/g, " ").trim();

/** RFC 6238, as the authenticator app does it. */
export function totp(secret, at = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/[\s=]/g, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}
