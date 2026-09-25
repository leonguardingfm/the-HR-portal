/**
 * Who sees whom. The Managing Director: everyone. The head of a department:
 * their own team, by name — never another department. Performance figures
 * and the audit log: the Managing Director only.
 */
import { BASE, check, go, signIn, sql, text } from "./lib.mjs";

export default async function oversight(browser) {
  // The head of the Control Room: their own team, by name, and nobody else's.
  const olivia = await signIn(browser, "olivia", { landing: "/reports" });
  const board = await text(olivia.locator("main"));
  check("the Control Room head's board is the Control Room", /Control Room/.test(board) && !/Recruitment pipeline/.test(board), board.slice(0, 300));
  check("…showing who in the team is doing what", /Hannah Brooks|Daniel Okoye|Sam Carter/.test(board), board.slice(0, 500));
  check("…and no one from another department", !/\bPriya\b|\bDouglas\b|\bKirsty\b|\bJoel\b/.test(board), board.slice(0, 500));
  // …and Performance for the Control Room only: each person, their speed, breaches and reasons.
  await go(olivia, "/performance?period=30d&department=recruitment");
  const headPerf = await text(olivia.locator("main"));
  check("the Control Room head opens Performance for the Control Room", new URL(olivia.url()).pathname === "/performance" && /Performance · Control Room/.test(headPerf), headPerf.slice(0, 200));
  check("…each person in the team, by name", /Hannah Brooks|Daniel Okoye|Sam Carter/.test(headPerf), headPerf.slice(0, 600));
  check("…nobody from another department, even when the address asks for HR", !/\bPriya\b|\bJoel\b|\bDouglas\b|\bKirsty\b/.test(headPerf), headPerf.slice(0, 600));
  check("…and not the MD's hub settings or weekly summaries", !/Hub settings|Weekly summaries/.test(headPerf));
  const daniel = sql(`select id from "User" where username = 'daniel.okoye'`);
  const priya = sql(`select id from "User" where username = 'priya'`);
  const own = await go(olivia, `/performance/person/${daniel}?period=30d`);
  check("…opens a team member's own page", own.status() === 200 && /Daniel Okoye/.test(await text(olivia.locator("main"))));
  const other = await go(olivia, `/performance/person/${priya}?period=30d`);
  check("…but not someone in HR", other.status() === 404, `${other.status()}`);
  await go(olivia, "/performance/settings");
  check("…nor the hub settings", new URL(olivia.url()).pathname === "/performance", olivia.url());
  const csv = await olivia.request.get(`${BASE}/performance/export?kind=people&period=30d&department=recruitment`);
  const rows = await csv.text();
  check("…and downloads only the Control Room's people", csv.status() === 200 && /Daniel Okoye|Hannah Brooks/.test(rows) && !/\bPriya\b|\bJoel\b/.test(rows), rows.slice(0, 300));
  await go(olivia, "/system/audit");
  check("…nor the audit log", new URL(olivia.url()).pathname !== "/system/audit", olivia.url());
  await olivia.context().close();

  // Not a head: no Performance page at all.
  const sam = await signIn(browser, "sam.supervisor");
  await go(sam, "/performance");
  check("a shift supervisor cannot open Performance", new URL(sam.url()).pathname !== "/performance", sam.url());
  const samCsv = await sam.request.get(`${BASE}/performance/export?kind=people`);
  check("…nor download it", samCsv.status() === 403 || !/csv/.test(samCsv.headers()["content-type"] ?? ""), `${samCsv.status()}`);
  await sam.context().close();

  // The head of HR: HR's people, and not the Control Room's.
  const hr = await signIn(browser, "eleanor", { role: /Recruitment Manager|HR manager|Head of HR/i, landing: "/reports" });
  const hrBoard = await text(hr.locator("main"));
  check("the HR head's board shows HR's people", /\bPriya\b|\bJoel\b/.test(hrBoard), hrBoard.slice(0, 500));
  check("…and not the Control Room's", !/Hannah Brooks|Daniel Okoye|Sam Carter/.test(hrBoard), hrBoard.slice(0, 500));
  await go(hr, "/performance?period=30d");
  const hrPerf = await text(hr.locator("main"));
  check("the HR head's Performance is HR's", /Performance · HR/.test(hrPerf) && /\bPriya\b|\bJoel\b/.test(hrPerf) && !/Hannah Brooks|Daniel Okoye/.test(hrPerf), hrPerf.slice(0, 600));
  await hr.context().close();

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
