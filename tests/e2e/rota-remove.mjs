/**
 * Marking shifts on the calendar and acting on them together: a client stops
 * after ten days of a month — the rest are marked with a click and a
 * Shift-click and deleted in one go, the officer on one of them told; two open
 * shifts marked and given to an officer; a whole day marked from its heading.
 */
import { check, go, signIn, sql, text } from "./lib.mjs";

const ukDay = (offset) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const plus = (date, n) => new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

// Earlier runs' test shifts, cancelled so this run's can be made on the same dates.
const tidy = () => {
  // The officers first — the test's own, and any put on its open shifts — then the open shifts.
  sql(`update "Assignment" set state = 'cancelled' where (id like 'e2e-%' or id in (select "assignmentId" from "OpenShift" where id like 'e2e-%' and "assignmentId" is not null)) and state <> 'cancelled'`);
  sql(`update "OpenShift" set "assignmentId" = null, "cancelledAt" = coalesce("cancelledAt", now()), "cancelledReason" = coalesce("cancelledReason", 'Browser test tidy-up') where id like 'e2e-%' and ("cancelledAt" is null or "assignmentId" is not null)`);
};

export default async function rotaRemove(browser) {
  tidy();
  const post = sql(`select p.id from "Post" p join "Site" s on s.id = p."siteId" where s.name = 'Meridian — Depot 4' and p.name = 'Day patrol' limit 1`);
  const control = sql(`select id from "User" where username = 'daniel.okoye'`);
  const officer = sql(`select u."personId" || '|' || u.id from "User" u where username = 'shanice.bennett'`).split("|");
  const stamp = Date.now().toString(36);
  const base = ukDay(45);
  const at = (day, t) => `(date '${base}' + ${day} + time '${t}') at time zone 'Europe/London'`;
  // A month for the client: twenty days of open shifts, one filled and published, one filled as a draft.
  sql(`insert into "OpenShift"(id,"postId","startsAt","endsAt","createdById") select 'e2e-${stamp}-'||g, '${post}', ${at("g", "09:00")}, ${at("g", "17:00")}, '${control}' from generate_series(0,19) g`);
  sql(`insert into "Assignment"(id,"personId","postId","startsAt","endsAt",state,"publishedAt") values ('e2e-${stamp}-pub','${officer[0]}','${post}',${at(12, "09:00")},${at(12, "17:00")},'published',now())`);
  sql(`insert into "Assignment"(id,"personId","postId","startsAt","endsAt",state) values ('e2e-${stamp}-draft','${officer[0]}','${post}',${at(13, "09:00")},${at(13, "17:00")},'draft')`);
  sql(`update "OpenShift" set "assignmentId" = 'e2e-${stamp}-pub' where id = 'e2e-${stamp}-12'`);
  sql(`update "OpenShift" set "assignmentId" = 'e2e-${stamp}-draft' where id = 'e2e-${stamp}-13'`);

  // Four weeks on screen, from the Monday of the first day in question.
  const monday = sql(`select to_char(date_trunc('week', date '${base}'), 'YYYY-MM-DD')`);
  const col = (date) => Math.round((new Date(`${date}T12:00:00Z`) - new Date(`${monday}T12:00:00Z`)) / 86_400_000);
  const d = await signIn(browser, "daniel.okoye", { landing: `/scheduling?week=${monday}&span=4` });
  check("there is no separate Remove button — marking is on the calendar", !(await d.getByRole("button", { name: "Remove shifts" }).isVisible().catch(() => false)));
  const row = d.locator("tbody tr").filter({ has: d.locator('th[scope="row"]', { hasText: "Day patrol" }) }).filter({ hasText: "Meridian" }).first();
  const box = (date) => row.locator("td").nth(col(date)).getByRole("checkbox").first();

  // --- Boxes appear on hover; once one is picked, they all show --------------------------------
  const opacity = (loc) => loc.evaluate((el) => getComputedStyle(el).opacity);
  await d.mouse.move(5, 5);
  await d.waitForTimeout(200);
  check("a shift's box is hidden until it is hovered", (await opacity(box(plus(base, 10)))) === "0");
  await row.locator("td").nth(col(plus(base, 10))).locator(".mark-host").first().hover();
  await d.waitForTimeout(200);
  check("…hovering the shift shows its box", (await opacity(box(plus(base, 10)))) === "1");

  // --- The last ten days: a click, then Shift and a click --------------------------------------
  await box(plus(base, 10)).click();
  await d.mouse.move(5, 5);
  await d.waitForTimeout(200);
  check("once one is picked, every box shows without hovering", (await opacity(box(plus(base, 15)))) === "1");
  await box(plus(base, 19)).click({ modifiers: ["Shift"] });
  const marked = d.getByRole("region", { name: "Marked shifts" });
  const summary = await text(marked);
  check("a click and a Shift-click mark the ten days between", /10 marked/.test(summary) && /8 open/.test(summary) && /1 draft/.test(summary) && /1 with officers/.test(summary), summary.slice(0, 200));
  await marked.getByRole("button", { name: "Delete 10…" }).click();
  const why = await text(marked);
  check("…deleting names the officer who will be told", /Shanice Bennett/.test(why), why.slice(0, 300));
  await marked.getByLabel(/Why are these 10 not needed/).fill("Client does not need cover for the last ten days");
  await marked.getByRole("button", { name: "Delete 10 shifts" }).click();
  await marked.getByText(/Removed 10 shifts/).waitFor();
  check("the ten days come off in one go", sql(`select count(*) from "OpenShift" where id like 'e2e-${stamp}-%' and "cancelledAt" is not null`) === "10");
  check("…the first ten days stay", sql(`select count(*) from "OpenShift" where id like 'e2e-${stamp}-%' and "cancelledAt" is null`) === "10");
  check("…the officer's shift and the draft are cancelled", sql(`select string_agg(state::text, ',' order by id) from "Assignment" where id like 'e2e-${stamp}-%'`) === "cancelled,cancelled");
  check("…and the officer is told in their portal", sql(`select count(*) from "WorkItem" where "ownerUserId" = '${officer[1]}' and "assignmentId" = 'e2e-${stamp}-pub' and title like 'Control has cancelled your shift%'`) === "1");

  // --- Two open shifts marked and given to an officer ------------------------------------------
  await go(d, `/scheduling?week=${monday}&span=4`);
  await box(plus(base, 1)).click();
  await box(plus(base, 2)).click();
  const marked2 = d.getByRole("region", { name: "Marked shifts" });
  check("two marked", /2 marked/.test(await text(marked2)));
  const choice = await marked2.getByLabel("Give the marked open shifts to").locator("option", { hasText: "free for all 2" }).first().getAttribute("value");
  check("…the box lists who is free for both", !!choice);
  if (choice) {
    await marked2.getByLabel("Give the marked open shifts to").selectOption(choice);
    await marked2.getByRole("button", { name: "Assign" }).click();
    await d.waitForTimeout(2000);
    check("…and gives them both to that officer", sql(`select count(*) from "OpenShift" where id in ('e2e-${stamp}-1','e2e-${stamp}-2') and "assignmentId" is not null`) === "2");
  }

  // --- A whole day, from its heading -------------------------------------------------------------
  await go(d, `/scheduling?week=${monday}&span=4`);
  await d.locator("thead th").nth(col(plus(base, 5)) + 1).getByRole("checkbox").click();
  check("ticking a day's heading marks that day", /\d+ marked/.test(await text(d.getByRole("region", { name: "Marked shifts" }))));
  await d.getByRole("region", { name: "Marked shifts" }).getByRole("button", { name: "Clear" }).click();
  check("rota marking: no errors in the page", d.errors.length === 0, d.errors.join(" | "));
  await d.context().close();
  tidy();
}
