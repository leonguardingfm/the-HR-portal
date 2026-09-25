/** Sign-in security: lockout, one answer to "forgotten password", forced change, two-factor, headers. */
import { BASE, check, go, signIn, sql, text, totp } from "./lib.mjs";

const USER = "joel";

export default async function security(browser) {
  const original = sql(`select "passwordHash" from "User" where username = '${USER}'`);
  const reset = () => sql(`update "User" set "failedSignIns" = 0, "lockedUntil" = null, "mustChangePassword" = false, "totpEnabledAt" = null, "totpSecret" = null, "totpLastStep" = null, "passwordHash" = '${original}' where username = '${USER}'`);
  reset();
  try {
    // --- Headers --------------------------------------------------------------
    const res = await fetch(`${BASE}/signin`);
    const h = (k) => res.headers.get(k) ?? "";
    check("pages carry a content security policy", /default-src 'self'/.test(h("content-security-policy")), h("content-security-policy"));
    check("…cannot be framed by another site", h("x-frame-options") === "SAMEORIGIN");
    check("…and are not sniffed", h("x-content-type-options") === "nosniff");
    check("…and say which server they run on to nobody", !h("x-powered-by"));

    // --- Lockout --------------------------------------------------------------
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    for (let i = 0; i < 5; i++) {
      await p.goto(BASE + "/signin");
      await p.getByLabel("Username").fill(USER);
      await p.getByLabel("Password", { exact: true }).fill(`wrong-${i}-password`);
      await p.getByRole("button", { name: "Sign in", exact: true }).click();
      await p.waitForLoadState("networkidle");
    }
    check("five wrong passwords lock the account", /locked/i.test(await text(p.locator("main"))), await text(p.locator("main")));
    await p.goto(BASE + "/signin");
    await p.getByLabel("Username").fill(USER);
    await p.getByLabel("Password", { exact: true }).fill("leon-portal-dev");
    await p.getByRole("button", { name: "Sign in", exact: true }).click();
    await p.waitForLoadState("networkidle");
    check("…and the right password is refused while it is locked", new URL(p.url()).pathname.startsWith("/signin") && /locked/i.test(await text(p.locator("main"))));
    check("…and the lock is recorded", Number(sql(`select count(*) from "Event" where type = 'account.locked' and at > now() - interval '2 minutes'`)) >= 1);
    reset();

    // --- Forgotten password: the same answer whether or not the account exists ---
    const answer = async (who) => {
      await p.goto(BASE + "/signin/forgot");
      await p.getByLabel("Username or email address").fill(who);
      await p.getByRole("button", { name: "Email me a link" }).click();
      await p.waitForLoadState("networkidle");
      await p.waitForTimeout(500);
      return (await text(p.locator("main"))).replace(who, "WHO");
    };
    const real = await answer(USER);
    const none = await answer("nobody-at-all-e2e");
    check("“forgotten password” answers the same for a real and an unknown account", real === none && real.length > 0, `${real} ≠ ${none}`);
    await ctx.close();

    // --- A temporary password must be changed first -----------------------------
    sql(`update "User" set "mustChangePassword" = true where username = '${USER}'`);
    const m = await signIn(browser, USER);
    check("a temporary password lands on Settings to choose a new one", new URL(m.url()).pathname === "/settings", m.url());
    await go(m, "/tasks");
    check("…and nothing else opens until it is changed", new URL(m.url()).pathname === "/settings", m.url());
    await m.context().close();
    reset();

    // --- Two-factor ---------------------------------------------------------------
    const t = await signIn(browser, USER, { landing: "/settings" });
    await t.getByRole("button", { name: "Set up two-factor" }).click();
    const key = t.locator("code").filter({ hasText: /^[A-Z2-7 ]{16,}$/ }).first();
    await key.waitFor();
    const secret = (await key.innerText()).replace(/\s+/g, "");
    check("setting up two-factor shows a QR code and a typed key", (await t.getByLabel("QR code for your authenticator app").isVisible()) && secret.length >= 16);
    await t.getByLabel("3. Type the six digits it shows").fill(totp(secret));
    await t.getByRole("button", { name: "Turn on" }).click();
    await t.waitForTimeout(1500);
    check("…and turns on with the code from the app", sql(`select "totpEnabledAt" is not null from "User" where username = '${USER}'`) === "t");
    await t.getByRole("button", { name: "Sign out" }).click();
    await t.waitForURL((u) => u.pathname.startsWith("/signin"));
    await t.goto(BASE + "/signin");
    await t.getByLabel("Username").fill(USER);
    await t.getByLabel("Password", { exact: true }).fill("leon-portal-dev");
    await t.getByRole("button", { name: "Sign in", exact: true }).click();
    await t.waitForURL((u) => u.pathname === "/signin/verify");
    check("signing in then asks for the code", true);
    await t.getByLabel("Six-digit code").fill("000000");
    await t.getByRole("button", { name: "Continue" }).click();
    await t.waitForLoadState("networkidle");
    check("…a wrong code is refused", new URL(t.url()).pathname === "/signin/verify", t.url());
    // The next 30-second code: the one used to turn it on cannot be used twice.
    await t.getByLabel("Six-digit code").fill(totp(secret, Date.now() + 30_000));
    await t.getByRole("button", { name: "Continue" }).click();
    await t.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 15_000 }).catch(() => {});
    check("…and the right code lets them in", !new URL(t.url()).pathname.startsWith("/signin"), t.url());
    check("two-factor: no errors in the page", t.errors.length === 0, t.errors.join(" | "));
    await t.context().close();
  } finally {
    reset();
  }
}
