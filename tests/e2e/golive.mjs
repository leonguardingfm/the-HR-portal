/** The go-live checklist: honest about a development server, ticked by hand where it must be. */
import { check, go, signIn, sql, text } from "./lib.mjs";

export default async function golive(browser) {
  const before = sql(`select value from "Setting" where key = 'golive.manual'`);
  const md = await signIn(browser, "vivien", { role: /Higher Management/, landing: "/system/go-live" });
  const page = await text(md.locator("main"));
  check("a development server is not ready to go live", /Not ready yet/.test(page), page.slice(0, 200));
  check("…because demonstration accounts can sign in", /No demonstration accounts can sign in/.test(page) && /example\.com/.test(page));
  check("…and it says how to fix each", /How:/.test(page));
  check("the UK GDPR items are listed", /ICO/.test(page) && /impact assessment/.test(page) && /processing agreements/.test(page));
  const row = md.locator("li", { hasText: "restored to prove it works" });
  await row.getByRole("button", { name: "Mark as done" }).click();
  await row.getByLabel("How you know").fill("Restored last night's backup to a spare server, e2e");
  await row.getByRole("button", { name: "Done" }).click();
  await md.waitForTimeout(1200);
  await go(md, "/system/go-live");
  check("an item is ticked with how it is known", /Restored last night's backup/.test(await text(md.locator("main"))));
  check("…and the tick is recorded", Number(sql(`select count(*) from "Event" where type = 'golive.ticked' and at > now() - interval '2 minutes'`)) >= 1);
  const again = md.locator("li", { hasText: "restored to prove it works" });
  await again.getByRole("button", { name: "Untick" }).click();
  await md.waitForTimeout(1000);
  check("go-live: no errors in the page", md.errors.length === 0, md.errors.join(" | "));
  await md.context().close();

  const olivia = await signIn(browser, "olivia");
  await go(olivia, "/system/go-live");
  check("a manager cannot open the checklist", !new URL(olivia.url()).pathname.startsWith("/system/go-live"), olivia.url());
  await olivia.context().close();
  if (before) sql(`update "Setting" set value = '${before.replace(/'/g, "''")}' where key = 'golive.manual'`);
}
