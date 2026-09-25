/** Who sees whose performance: only the Managing Director sees people; managers see their own team's totals. */
import { BASE, check, go, signIn, sql, text } from "./lib.mjs";

export default async function oversight(browser) {
  // A manager: their own department only, and no one by name.
  const olivia = await signIn(browser, "olivia", { landing: "/reports" });
  const board = await text(olivia.locator("main"));
  check("a manager's Department board is their own department", /Control Room/.test(board) && !/Accounts & Admin|Recruitment work|Vetting work/.test(board), board.slice(0, 300));
  check("…with no one named from another department", !/\bPriya\b|\bDouglas\b|\bKirsty\b|\bJoel\b/.test(board), board.slice(0, 400));
  await go(olivia, "/performance");
  check("a manager cannot open the Performance portal", new URL(olivia.url()).pathname !== "/performance", olivia.url());
  const csv = await olivia.request.get(`${BASE}/performance/export?kind=people`);
  check("…nor download its figures", csv.status() >= 300 || !/csv/.test(csv.headers()["content-type"] ?? ""), `${csv.status()} ${csv.headers()["content-type"]}`);
  await go(olivia, "/system/audit");
  check("…nor the audit log", new URL(olivia.url()).pathname !== "/system/audit", olivia.url());
  await olivia.context().close();

  // The Managing Director: everyone, by name, and the whole company.
  const md = await signIn(browser, "vivien", { role: /Higher Management/, landing: "/performance?period=30d" });
  const perf = await text(md.locator("main"));
  check("the Managing Director sees every department", /Control Room/.test(perf) && /HR/.test(perf) && /Accounts & Admin/.test(perf), perf.slice(0, 300));
  check("…and people by name", /Hannah Brooks|Daniel Okoye/.test(perf), perf.slice(0, 400));
  const person = md.locator('main a[href^="/performance/person/"]').first();
  const href = await person.getAttribute("href");
  await go(md, href);
  check("…and one person's own page", /Closed|closed/.test(await text(md.locator("main"))), md.url());
  const out = await md.request.get(`${BASE}/performance/export?kind=people&period=30d`);
  check("…and can download it as a spreadsheet", out.status() === 200 && /csv/.test(out.headers()["content-type"] ?? ""), `${out.status()} ${out.headers()["content-type"]}`);
  check("…which is itself recorded", Number(sql(`select count(*) from "Event" where type = 'audit.performance_exported' and at > now() - interval '2 minutes'`)) >= 1);

  // The audit log, searched.
  await go(md, "/system/audit?text=signed%20in");
  const audit = await text(md.locator("main"));
  check("the audit log can be searched", /signed in/i.test(audit), audit.slice(0, 300));
  const exp = await md.request.get(`${BASE}/system/audit/export?text=signed%20in`);
  check("…and downloaded", exp.status() === 200 && /csv/.test(exp.headers()["content-type"] ?? ""), `${exp.status()}`);
  check("oversight: no errors in the page", md.errors.length === 0, md.errors.join(" | "));
  await md.context().close();
}
