/**
 * Site issues: an officer reports a broken lock with a photo; Control shares it
 * with the client in its own words; the client says it is fixed; the officer
 * on site confirms. Another client never sees it, and what Control keeps
 * internal never reaches the client.
 */
import { execSync } from "node:child_process";
import path from "node:path";
import { BASE, check, go, signIn, sql, text } from "./lib.mjs";

const PHOTO = path.resolve("scripts/demo-selfie.jpg");

async function report(page, { kind, urgency, where, what, photo }) {
  await page.getByRole("button", { name: /Report a problem at this site/ }).first().click();
  await page.getByLabel("What is it?").selectOption(kind);
  await page.getByLabel("How urgent?").selectOption(urgency);
  await page.getByLabel("Where on the site?").fill(where);
  await page.getByLabel("What did you find?").fill(what);
  if (photo) {
    await page.locator('input[type="file"][name="photo"]').setInputFiles(photo);
    await page.getByRole("img", { name: "Photo 1" }).waitFor();
  }
  await page.getByRole("button", { name: "Send to Control" }).click();
  await page.waitForTimeout(1500);
}

export default async function siteIssues(browser) {
  execSync("npm run -s demo:duty", { stdio: "ignore" });
  execSync("npm run -s demo:client", { stdio: "ignore" });
  const stamp = Date.now().toString(36);
  const lock = `Fire exit lock broken ${stamp}`;
  const lamp = `Our torch charger faulty ${stamp}`;

  // --- The officer on duty at Meridian reports two things ----------------------------
  const officer = await signIn(browser, "kieran.doyle", { width: 390, height: 844, landing: "/me" });
  await report(officer, { kind: "door_or_lock", urgency: "urgent", where: "Rear fire exit", what: lock, photo: PHOTO });
  const sent = await text(officer.locator("main"));
  check("an officer reports a broken lock with a photo", /Sent to Control as SI-\d+/.test(sent), sent.slice(0, 300));
  const issue = sql(`select id from "SiteIssue" where description = '${lock}'`);
  check("…Control is alarmed at once, because it is urgent", sql(`select count(*) from "WorkItem" where "siteIssueId" = '${issue}' and state = 'open' and title like 'Urgent site issue%'`) === "1");
  check("…and the photo is kept, not yet shared", sql(`select count(*) || '|' || bool_or(shared) from "SiteIssuePhoto" where "issueId" = '${issue}'`) === "1|false");
  await report(officer, { kind: "other", urgency: "routine", where: "Gatehouse", what: lamp });
  const internal = sql(`select id from "SiteIssue" where description = '${lamp}'`);

  // --- The client sees nothing until Control has reviewed it ------------------------------
  const grace = await signIn(browser, "grace.meridian", { landing: "/client-portal/site-issues" });
  check("the client sees nothing before Control reviews it", !(await text(grace.locator("main"))).includes(stamp));
  const photoId = sql(`select id from "SiteIssuePhoto" where "issueId" = '${issue}'`);
  check("…not even the photo", (await grace.request.get(`${BASE}/api/site-issues/photo/${photoId}`)).status() === 404);

  // --- Control shares one, in its own words, and keeps the other internal ------------------
  const d = await signIn(browser, "daniel.okoye", { landing: "/duty/site-issues" });
  const row = d.locator("li", { hasText: lock });
  await row.getByRole("button", { name: "Review" }).click();
  const drawer = d.getByRole("dialog");
  await drawer.getByLabel("What the client reads").fill("The lock on the rear fire exit is broken and the door will not stay shut. Please arrange a repair.");
  await drawer.getByRole("button", { name: "Share with the client" }).click();
  await drawer.waitFor({ state: "detached" });
  check("Control shares it with the client", sql(`select status from "SiteIssue" where id = '${issue}'`) === "open");
  check("…and the alarm stops", sql(`select count(*) from "WorkItem" where "siteIssueId" = '${issue}' and state = 'open'`) === "0");
  const row2 = d.locator("li", { hasText: lamp });
  await row2.getByRole("button", { name: "Review" }).click();
  const drawer2 = d.getByRole("dialog");
  await drawer2.getByLabel("Keep internal").check();
  await drawer2.getByLabel("Why the client should not see it").fill("Our own equipment");
  await drawer2.getByRole("button", { name: "Keep internal" }).click();
  await drawer2.waitFor({ state: "detached" });
  check("…and keeps the other internal", sql(`select status from "SiteIssue" where id = '${internal}'`) === "kept_internal");

  // --- The client sees the shared one, with its photo — and not the other ----------------------
  await go(grace, "/client-portal/site-issues");
  const page = await text(grace.locator("main"));
  check("the client sees it, in Control's words", /rear fire exit is broken/.test(page) && !page.includes(lock), page.slice(0, 400));
  check("…with the photo Control shared", (await grace.request.get(`${BASE}/api/site-issues/photo/${photoId}`)).status() === 200);
  check("…and not what Control kept internal", !page.includes(lamp));
  await go(grace, "/client-portal");
  check("the client's overview counts it", /Needs attention at your sites\s*1/.test(await text(grace.locator("main"))), (await text(grace.locator("main"))).slice(0, 300));

  const tom = await signIn(browser, "tom.riverside", { landing: "/client-portal/site-issues" });
  check("another client does not see it", !/rear fire exit/.test(await text(tom.locator("main"))));
  check("…nor its photo", (await tom.request.get(`${BASE}/api/site-issues/photo/${photoId}`)).status() === 404);
  await tom.context().close();

  // --- The client says it is fixed; the officer on site checks ---------------------------------
  await go(grace, "/client-portal/site-issues");
  const item = grace.locator("li", { hasText: "rear fire exit is broken" });
  await item.getByRole("button", { name: /fixed it/ }).click();
  await item.getByLabel("What was done (optional)").fill("Locksmith replaced the lock");
  await item.getByRole("button", { name: "Tell Leon Guarding" }).click();
  await grace.waitForTimeout(1200);
  await go(grace, "/client-portal/site-issues");
  check("the client says it is fixed, and waits for our check", /Waiting for our officer to check/.test(await text(grace.locator("main"))));

  await go(officer, "/me");
  const card = officer.locator("section", { hasText: "Please check" }).filter({ hasText: "rear fire exit" });
  check("the officer on site is asked to check it", await card.isVisible());
  await card.getByRole("button", { name: "✓ It is fixed" }).click();
  await officer.waitForTimeout(1500);
  check("…confirms it is fixed, and it closes", sql(`select status from "SiteIssue" where id = '${issue}'`) === "resolved");
  await go(grace, "/client-portal/site-issues");
  check("the client sees it fixed and checked", /Fixed — checked by our officer/.test(await text(grace.locator("main"))));

  check("site issues: no errors in the page", officer.errors.length === 0 && grace.errors.length === 0 && d.errors.length === 0, [...officer.errors, ...grace.errors, ...d.errors].join(" | "));
  for (const p of [officer, grace, d]) await p.context().close();
}
