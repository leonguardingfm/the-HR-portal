/** Every desk signs in and its main screens open without an error. */
import { BASE, check, go, signIn, switchRole } from "./lib.mjs";

const DESKS = [
  { user: "daniel.okoye", pages: ["/", "/tasks", "/hub", "/live", "/duty/check-calls", "/settings"] },
  { user: "sam.supervisor", pages: ["/", "/hub", "/duty/book-ons"] },
  { user: "olivia", pages: ["/", "/reports", "/hub", "/hub/templates"] },
  { user: "priya", pages: ["/", "/tasks", "/hub", "/people"] },
  { user: "douglas", pages: ["/", "/admin/people", "/hub/templates"] },
];

export default async function smoke(browser) {
  for (const d of DESKS) {
    const p = await signIn(browser, d.user);
    for (const path of d.pages) {
      const res = await go(p, path);
      check(`${d.user} opens ${path}`, !!res && res.status() < 400 && new URL(p.url()).pathname === path, `${res?.status()} ${p.url()}`);
    }
    check(`${d.user}: no errors in the page`, p.errors.length === 0, p.errors.join(" | "));
    await p.context().close();
  }

  const md = await signIn(browser, "vivien", { role: /Higher Management/ });
  for (const path of ["/performance", "/performance/settings", "/system", "/system/audit", "/system/go-live", "/hub/templates", "/reports"]) {
    const res = await go(md, path);
    check(`the Managing Director opens ${path}`, !!res && res.status() < 400 && new URL(md.url()).pathname === path, `${res?.status()} ${md.url()}`);
  }
  check("the Managing Director: no errors in the page", md.errors.length === 0, md.errors.join(" | "));
  await md.context().close();

  const officer = await signIn(browser, "kieran.doyle", { width: 390, height: 844 });
  check("an officer lands on My duties", new URL(officer.url()).pathname === "/me", officer.url());
  const res = await go(officer, "/hub");
  check("an officer cannot open the hub", new URL(officer.url()).pathname === "/me", `${res?.status()} ${officer.url()}`);
  await officer.context().close();

  const health = await fetch(`${BASE}/api/health`);
  const body = await health.json().catch(() => ({}));
  check("the health address answers without signing in", health.status === 200 && body.ok === true, JSON.stringify(body));
}
