/**
 * Removing shifts that are not needed: a client stops after ten days of a
 * month — the rest come off in one go, officers on them told; and ticked
 * shifts deleted from the roster's selection box.
 */
import { check, go, signIn, sql, text } from "./lib.mjs";

const ukDay = (offset) => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/London" });

// Earlier runs' test shifts, cancelled so this run's can be made on the same dates.
const tidy = () => {
  sql(`update "OpenShift" set "assignmentId" = null, "cancelledAt" = coalesce("cancelledAt", now()), "cancelledReason" = coalesce("cancelledReason", 'Browser test tidy-up') where id like 'e2e-%' and ("cancelledAt" is null or "assignmentId" is not null)`);
  sql(`update "Assignment" set state = 'cancelled' where id like 'e2e-%' and state <> 'cancelled'`);
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

  // --- "The client does not need the last ten days": Remove shifts ------------------------
  const d = await signIn(browser, "daniel.okoye", { landing: "/scheduling" });
  await d.getByRole("button", { name: "Remove shifts" }).click();
  const drawer = d.getByRole("dialog");
  await drawer.locator(`input[type="checkbox"]`).first().waitFor();
  // The post, by its own tick box under Meridian — Depot 4.
  const site = drawer.locator("div", { has: d.getByText("Meridian — Depot 4", { exact: true }) }).last();
  await site.getByLabel("Day patrol").check();
  const from = new Date(new Date(`${base}T12:00:00Z`).getTime() + 10 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(new Date(`${base}T12:00:00Z`).getTime() + 19 * 86_400_000).toISOString().slice(0, 10);
  await drawer.getByLabel("From").fill(from);
  await drawer.getByLabel("To (included)").fill(to);
  await drawer.getByLabel(/Shifts with officers on them/).check();
  await drawer.getByRole("button", { name: "Check what will come off" }).click();
  await drawer.getByText(/\d+ shifts? will come off/).waitFor();
  const preview = await text(drawer);
  check("Remove shifts shows what will come off before anything does", /10 shifts will come off/.test(preview) && /8 open/.test(preview) && /1 draft/.test(preview) && /1 with officers/.test(preview), preview.slice(0, 400));
  check("…and names the officer who will be told", /Shanice Bennett \(1\)/.test(preview));
  check("…and nothing has changed yet", sql(`select count(*) from "OpenShift" where id like 'e2e-${stamp}-%' and "cancelledAt" is not null`) === "0");
  await drawer.getByLabel("Why they are not needed").fill("Client does not need cover for the last ten days");
  await drawer.getByRole("button", { name: "Remove 10 shifts" }).click();
  await drawer.getByText(/Removed 10 shifts/).waitFor();
  check("the ten days come off in one go", sql(`select count(*) from "OpenShift" where id like 'e2e-${stamp}-%' and "cancelledAt" is not null`) === "10");
  check("…the first ten days stay", sql(`select count(*) from "OpenShift" where id like 'e2e-${stamp}-%' and "cancelledAt" is null`) === "10");
  check("…the officer's shift is cancelled, the draft too", sql(`select string_agg(state::text, ',' order by id) from "Assignment" where id like 'e2e-${stamp}-%'`) === "cancelled,cancelled");
  check("…and the officer is told in their portal", sql(`select count(*) from "WorkItem" where "ownerUserId" = '${officer[1]}' and "assignmentId" = 'e2e-${stamp}-pub' and title like 'Control has cancelled your shift%'`) === "1");
  check("…with the reason recorded", sql(`select count(*) from "Event" where type = 'rota.shifts_removed' and detail like '%last ten days%'`) >= "1");
  await d.keyboard.press("Escape");

  // --- Ticked on the roster, deleted together ------------------------------------------------
  const monday = sql(`select to_char(date_trunc('week', date '${base}'), 'YYYY-MM-DD')`);
  await go(d, `/scheduling?week=${monday}`);
  await d.getByRole("button", { name: "Select shifts" }).click();
  const boxes = d.getByRole("checkbox", { name: /^Tick Day patrol/ });
  const n = Math.min(3, await boxes.count());
  for (let i = 0; i < n; i++) await boxes.nth(i).check();
  check("ticking shifts shows them in the box at the bottom", new RegExp(`${n} ticked`).test(await text(d.locator("main"))));
  await d.getByRole("button", { name: "Delete ticked…" }).click();
  await d.getByLabel(new RegExp(`Why are these ${n} not needed`)).fill("Client cancelled these days");
  await d.getByRole("button", { name: `Delete ${n} shifts` }).click();
  await d.waitForTimeout(1500);
  check("…and deleting them takes them all off in one go", sql(`select count(*) from "OpenShift" where id like 'e2e-${stamp}-%' and "cancelledReason" = 'Client cancelled these days'`) === String(n));
  check("rota removal: no errors in the page", d.errors.length === 0, d.errors.join(" | "));
  await d.context().close();
  tidy();
}
