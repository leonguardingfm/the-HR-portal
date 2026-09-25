/**
 * No signal at the post: the book-on and check call are kept on the phone and
 * reach Control when signal returns, counted from when they were made.
 */
import { execSync } from "node:child_process";
import { check, go, signIn, sql, text } from "./lib.mjs";

const USER = "callum.reid";

export default async function officerOffline(browser) {
  // A fresh picture of the day: Callum is on a post that always has check calls, and has not booked on.
  execSync("npm run -s demo:duty", { stdio: "ignore" });
  const assignment = sql(`select a.id from "Assignment" a join "Person" p on p.id = a."personId" join "User" u on u."personId" = p.id
    where u.username = '${USER}' and a."startsAt" <= now() + interval '30 minutes' and a."endsAt" > now() and a.state <> 'cancelled' order by a."startsAt" limit 1`);
  check("the officer has a shift starting now", !!assignment);

  const p = await signIn(browser, USER, { width: 390, height: 844, geo: { latitude: 51.5, longitude: -0.12, accuracy: 20 } });
  await p.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase("leon-offline"); q.onsuccess = q.onerror = () => r(null); }));
  await go(p, "/me");
  await p.context().setOffline(true);
  await p.waitForTimeout(300);
  check("with no signal the officer is told they can still book on", /No signal/.test(await text(p.locator("main"))));

  // Book on (camera not working, to keep the test simple) with no signal.
  await p.getByRole("button", { name: "Camera not working?" }).first().click();
  await p.getByPlaceholder("What is wrong with the camera?").fill("Testing with no signal");
  await p.getByRole("button", { name: "Book on without a selfie" }).click();
  await p.waitForTimeout(800);
  const main = await text(p.locator("main"));
  check("the book-on is saved on the phone", /saved on this phone/.test(main), main.slice(0, 300));
  check("…shown as waiting to send", /1 waiting to send to Control/.test(main));
  check("…and the check calls carry on", await p.getByRole("button", { name: /Check call — all well/ }).isVisible());

  // A check call with no signal too.
  await p.getByRole("button", { name: "Camera not working?" }).first().click();
  await p.getByPlaceholder("What is wrong with the camera?").fill("Testing with no signal");
  await p.getByRole("button", { name: "Check call without a selfie" }).click();
  await p.waitForTimeout(800);
  check("the check call waits too", /2 waiting to send to Control/.test(await text(p.locator("main"))));
  check("…and nothing reached Control yet", sql(`select count(*) from "BookOn" where "assignmentId" = '${assignment}'`) === "0");

  // Say they were made 20 and 10 minutes ago, as if the signal had been out that long.
  await p.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open("leon-offline", 1);
    r.onsuccess = () => {
      const t = r.result.transaction("queue", "readwrite");
      const s = t.objectStore("queue");
      s.getAll().onsuccess = (e) => {
        for (const item of e.target.result) s.put({ ...item, madeAt: Date.now() - (item.kind === "book_on" ? 20 : 10) * 60_000 });
      };
      t.oncomplete = () => resolve(null);
    };
  }));

  // Signal returns.
  await p.context().setOffline(false);
  let left = "";
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(1000);
    left = sql(`select count(*) from "CheckCall" where "assignmentId" = '${assignment}' and "sentLateAt" is not null`);
    if (left === "1") break;
  }
  const bookOn = sql(`select round(extract(epoch from now() - at) / 60), "sentLateAt" is not null from "BookOn" where "assignmentId" = '${assignment}'`);
  check("with signal back, the book-on reaches Control", !!bookOn, bookOn);
  const [minutesAgo, late] = bookOn.split("|");
  check("…counted from when it was made, not when it arrived", Number(minutesAgo) >= 19 && Number(minutesAgo) <= 22, bookOn);
  check("…and marked as sent late", late === "t");
  check("the check call follows it", left === "1");
  check("Control's record says both times", Number(sql(`select count(*) from "Event" where "assignmentId" = '${assignment}' and detail like '%Made with no signal at%'`)) >= 2);
  await p.waitForTimeout(1500);
  check("the phone's outbox is empty", !/waiting to send/.test(await text(p.locator("main"))));

  // Sent twice — a retry after a dropped reply — counts once.
  const ref = sql(`select "clientRef" from "CheckCall" where "assignmentId" = '${assignment}' and "clientRef" is not null limit 1`);
  const again = await p.evaluate(async ({ assignment, ref }) => {
    const fd = new FormData();
    fd.set("kind", "check_call"); fd.set("assignmentId", assignment); fd.set("clientRef", ref);
    fd.set("madeAt", String(Date.now() - 600_000)); fd.set("deviceNow", String(Date.now()));
    fd.set("allWell", "yes"); fd.set("noPhoto", "1"); fd.set("noPhotoReason", "retry");
    return (await fetch("/api/me/queue", { method: "POST", body: fd })).json();
  }, { assignment, ref });
  check("the same check call sent twice counts once", again.ok && sql(`select count(*) from "CheckCall" where "clientRef" = '${ref}'`) === "1", JSON.stringify(again));
  check("officer: no errors in the page", p.errors.length === 0, p.errors.join(" | "));
  await p.context().close();

  // Control sees it.
  const c = await signIn(browser, "daniel.okoye", { landing: "/duty/book-ons" });
  check("Control's book-on list shows it came with no signal", /No signal · sent/i.test(await text(c.locator("main"))));
  await c.context().close();
}
