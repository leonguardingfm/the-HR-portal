/**
 * The client portal: made by Leon staff, fenced to one client, live, and a
 * request followed from the client's screen to the hub and back.
 */
import { execSync } from "node:child_process";
import { BASE, check, go, signIn, sql, text } from "./lib.mjs";

export default async function clientPortal(browser) {
  execSync("npm run -s demo:client", { stdio: "ignore" });
  const meridian = sql(`select id from "Client" where name = 'Meridian Logistics'`);
  const depot7 = sql(`select id from "Site" where name = 'Meridian — Depot 7'`);
  const stamp = Date.now().toString(36);

  // --- Nobody signs themselves up as a client ------------------------------------
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(BASE + "/signup");
  check("the public sign-up offers no client login", !/Client Portal/.test(await text(anon.locator("main"))));
  await anon.context().close();

  // --- Leon staff make a login, limited to one site ------------------------------
  const staff = await signIn(browser, "douglas", { landing: `/clients/${meridian}/portal` });
  check("the Admin Manager opens Meridian's portal access", /Client portal · Meridian Logistics/.test(await text(staff.locator("main"))));
  await staff.getByRole("button", { name: "+ Add a contact" }).click();
  await staff.getByLabel("Full name").fill(`E2E Contact ${stamp}`);
  await staff.getByLabel("Work email").fill(`e2e.${stamp}@example.com`);
  await staff.getByLabel("Username (optional)").fill(`e2e.${stamp}`);
  await staff.locator(`input[name="siteId"][value="${depot7}"]`).first().check();
  await staff.getByRole("button", { name: /Add, and show the temporary password/ }).click();
  await staff.waitForTimeout(1500);
  const shown = await text(staff.locator("main"));
  check("…and is shown the temporary password once", /temporary password [A-Za-z0-9]{4}-/.test(shown), shown.slice(0, 300));
  check("…the login belongs to Meridian, seeing one site", sql(`select u."clientId" = '${meridian}' and (select count(*) from "ClientContactSite" c where c."userId" = u.id) = 1 from "User" u where username = 'e2e.${stamp}'`) === "t");
  await staff.context().close();
  // The new contact signs in with the temporary password, and must choose their own first.
  const temp = /temporary password ([A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4})/.exec(shown)?.[1] ?? "";
  const limited = await (await browser.newContext()).newPage();
  limited.errors = [];
  await limited.goto(BASE + "/signin");
  await limited.getByLabel("Username").fill(`e2e.${stamp}`);
  await limited.getByLabel("Password", { exact: true }).fill(temp);
  await limited.getByRole("button", { name: "Sign in", exact: true }).click();
  await limited.waitForURL((u) => !u.pathname.startsWith("/signin"));
  check("on first sign-in a new contact must choose their own password", new URL(limited.url()).pathname === "/settings", limited.url());
  await limited.getByLabel("Current password").fill(temp);
  await limited.getByLabel("New password (at least 10 characters)").fill(`Meridian-${stamp}-pass`);
  await limited.getByLabel("New password again").fill(`Meridian-${stamp}-pass`);
  await limited.getByRole("button", { name: "Change password" }).click();
  await limited.waitForTimeout(1500);
  await go(limited, "/client-portal/rota");
  check("…and then reaches their portal", new URL(limited.url()).pathname === "/client-portal/rota", limited.url());
  const limitedRota = await text(limited.locator("main"));
  check("a contact limited to Depot 7 sees Depot 7", /Depot 7/.test(limitedRota) || /Nothing booked yet/.test(limitedRota), limitedRota.slice(0, 200));
  check("…and not Meridian's other site", !/Depot 4/.test(limitedRota), limitedRota.slice(0, 300));
  await limited.context().close();

  // --- Grace at Meridian: her own sites, live ----------------------------------------
  const grace = await signIn(browser, "grace.meridian");
  check("a client lands on their portal", new URL(grace.url()).pathname === "/client-portal", grace.url());
  check("…the top bar names their organisation", /Meridian Logistics/.test(await text(grace.locator("header").first())));
  for (const path of ["/client-portal/live", "/client-portal/rota", "/client-portal/shifts?period=30d", "/client-portal/incidents", "/client-portal/requests", "/client-portal/report"]) {
    await go(grace, path);
    const t = await text(grace.locator("main"));
    check(`${path.split("?")[0]} shows no other client`, !/Riverside|Northgate|Halton|Clearwater/.test(t), t.slice(0, 200));
  }
  await go(grace, "/client-portal/live");
  check("Meridian's contract shows officers with SIA numbers", /SIA \d/.test(await text(grace.locator("main"))) || /Nobody on duty right now/.test(await text(grace.locator("main"))));
  for (const staffPage of ["/hub", "/live", "/people", "/clients", "/reports", "/performance", "/system/audit"]) {
    await go(grace, staffPage);
    check(`a client cannot open ${staffPage}`, new URL(grace.url()).pathname.startsWith("/client-portal"), grace.url());
  }
  const csv = await grace.request.get(`${BASE}/client-portal/shifts/export?period=30d`);
  const rows = await csv.text();
  check("the shift record downloads with only their sites", csv.status() === 200 && !/Riverside|Northgate|Halton|Clearwater/.test(rows), rows.slice(0, 200));

  // --- A request, from the client to the hub and back -----------------------------------
  await go(grace, "/client-portal/requests");
  await grace.getByRole("button", { name: "+ New request" }).click();
  await grace.getByLabel("What is it about?").selectOption("extra_cover");
  await grace.getByLabel("Which site?").selectOption(depot7);
  await grace.getByLabel("Title").fill(`Second officer on Saturday ${stamp}`);
  await grace.getByLabel("Details").fill("We have a delivery surge; a second officer at the gatehouse please.");
  await grace.getByLabel("When (if it is about a particular time)").fill("Saturday 08:00–20:00");
  await grace.getByRole("button", { name: "Send request" }).click();
  await grace.waitForTimeout(1500);
  const sent = await text(grace.locator("main"));
  check("the client sends a request and gets a reference", /Your reference is CP-\d+/.test(sent), sent.slice(0, 300));
  const taskId = sql(`select id from "HubTask" where subject = 'Second officer on Saturday ${stamp}'`);
  check("…it is a Control Room task, on the clock", sql(`select department || '|' || status || '|' || source from "HubTask" where id = '${taskId}'`) === "control|unassigned|client_portal");
  await go(grace, `/client-portal/requests/${taskId}`);
  check("…and the client sees it received", /Received/.test(await text(grace.locator("main"))));

  const d = await signIn(browser, "daniel.okoye", { landing: `/hub/${taskId}` });
  check("Control sees it came from the client portal", /From the client portal · Grace Whitfield \(Meridian Logistics\)/.test(await text(d.locator("main"))));
  await d.keyboard.press("a");
  await d.waitForTimeout(1500);
  await d.keyboard.press("m");
  const drawer = d.getByRole("dialog");
  await drawer.getByLabel("Message").fill("We are finding a second officer for Saturday and will confirm by Thursday.");
  await drawer.getByRole("button", { name: "Send to the client" }).click();
  await drawer.waitFor({ state: "detached" });
  await go(grace, `/client-portal/requests/${taskId}`);
  const progress = await text(grace.locator("main"));
  check("the client reads Control's message and sees it in progress", /In progress/.test(progress) && /confirm by Thursday/.test(progress), progress.slice(0, 400));
  await go(d, `/hub/${taskId}`);
  await d.keyboard.press("c");
  const close = d.getByRole("dialog");
  await close.getByLabel(/What to tell the client/).fill("Booked: a second officer at the gatehouse, Saturday 08:00–20:00.");
  await close.getByRole("button", { name: "Close task" }).click();
  await close.waitFor({ state: "detached" });
  await go(grace, `/client-portal/requests/${taskId}`);
  const finished = await text(grace.locator("main"));
  check("…and when it is closed, the client sees Done and what was arranged", /Done/.test(finished) && /Saturday 08:00–20:00/.test(finished), finished.slice(0, 400));
  check("…with no staff names shown to the client", !/Daniel Okoye|Hannah Brooks/.test(finished));
  check("client portal: no errors in the page", grace.errors.length === 0 && d.errors.length === 0, [...grace.errors, ...d.errors].join(" | "));
  await d.context().close();
  await grace.context().close();

  // --- Tom at Riverside: not Meridian's, and no officer names -----------------------------
  const tom = await signIn(browser, "tom.riverside");
  const other = await go(tom, `/client-portal/requests/${taskId}`);
  check("another client opening Meridian's request gets 'not found'", other.status() === 404, `${other.status()}`);
  await go(tom, "/client-portal/rota");
  const tomRota = await text(tom.locator("main"));
  check("Riverside sees only Riverside", !/Meridian/.test(tomRota), tomRota.slice(0, 200));
  check("…and no officer names, as its contract says", !/SIA \d/.test(tomRota));
  await tom.context().close();

  // --- Access removed: they cannot sign in -------------------------------------------------
  const staff2 = await signIn(browser, "douglas", { landing: `/clients/${meridian}/portal` });
  const row = staff2.locator("li", { hasText: `E2E Contact ${stamp}` });
  await row.getByRole("button", { name: "Remove" }).click();
  await row.getByLabel("Why").fill("E2E test finished");
  await row.getByRole("button", { name: "Remove their access" }).click();
  await staff2.waitForTimeout(1200);
  await staff2.context().close();
  const gone = await (await browser.newContext()).newPage();
  await gone.goto(BASE + "/signin");
  await gone.getByLabel("Username").fill(`e2e.${stamp}`);
  await gone.getByLabel("Password", { exact: true }).fill("leon-portal-dev");
  await gone.getByRole("button", { name: "Sign in", exact: true }).click();
  await gone.waitForLoadState("networkidle");
  check("a removed contact can no longer sign in", new URL(gone.url()).pathname.startsWith("/signin"), gone.url());
  await gone.context().close();
}
