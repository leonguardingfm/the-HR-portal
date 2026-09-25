/** The Performance hub: reply templates, keyboard shortcuts, a task accepted and worked from the keyboard. */
import { check, go, signIn, sql, text } from "./lib.mjs";

export default async function hub(browser) {
  const stamp = Date.now().toString(36);
  const title = `Arranging cover e2e ${stamp}`;

  // A manager writes a template.
  const olivia = await signIn(browser, "olivia", { landing: "/hub/templates" });
  await olivia.getByRole("button", { name: "+ New template" }).click();
  await olivia.getByLabel("For").selectOption("client_request");
  await olivia.getByLabel("Title").fill(title);
  await olivia.getByLabel("Wording").fill("Thank you {sender} — we have your request ({ref}) and are arranging it now. {me}");
  await olivia.getByRole("button", { name: "Save" }).click();
  await olivia.waitForTimeout(1200);
  await go(olivia, "/hub/templates");
  check("a manager adds a reply template", (await text(olivia.locator("main"))).includes(title));
  await olivia.context().close();

  // Control works a task from the keyboard.
  const d = await signIn(browser, "daniel.okoye", { landing: "/hub" });
  await d.keyboard.press("?");
  const help = d.getByRole("dialog", { name: "Keyboard shortcuts" });
  check("“?” lists the keyboard shortcuts", await help.isVisible().catch(() => false));
  await d.keyboard.press("Escape");
  await d.keyboard.press("n");
  const drawer = d.getByRole("dialog");
  await drawer.waitFor();
  check("“n” opens Log a task", /Log a task/.test(await text(drawer)));
  await drawer.getByLabel("From (name)").fill("Priya Test");
  await drawer.getByLabel("Title").fill(`E2E request ${stamp}`);
  await drawer.getByLabel("What it is about").fill("Please arrange an extra officer for Friday.");
  await drawer.getByLabel("I’ll take it on now").uncheck();
  await drawer.getByRole("button", { name: "Log it" }).click();
  await drawer.waitFor({ state: "detached", timeout: 10_000 }).catch(() => {});
  await d.keyboard.press("3");
  await d.waitForURL((u) => u.search.includes("tab=unassigned"));
  await d.waitForLoadState("networkidle");
  // Down to our task, then accept it with "a".
  const rows = d.locator("tbody tr[data-row]");
  const n = await rows.count();
  let at = -1;
  for (let i = 0; i < n; i++) if ((await rows.nth(i).innerText()).includes(`E2E request ${stamp}`)) at = i;
  check("the new task waits unassigned", at >= 0);
  for (let i = 0; i <= at; i++) await d.keyboard.press("j");
  check("“j” moves down the list", (await rows.nth(at).getAttribute("aria-selected")) === "true");
  await d.keyboard.press("a");
  await d.waitForTimeout(2000);
  const id = sql(`select id from "HubTask" where subject = 'E2E request ${stamp}'`);
  check("“a” accepts it", sql(`select status from "HubTask" where id = '${id}'`) === "accepted");
  await go(d, `/hub/${id}`);
  await d.keyboard.press("r");
  const rec = d.getByRole("dialog");
  await rec.waitFor();
  check("“r” opens Record action", /Record what has been done/.test(await text(rec)));
  const picker = rec.getByLabel("Start from a reply template (optional)");
  const option = picker.locator("option", { hasText: title });
  check("…with this category's templates first, starred", (await option.innerText()).startsWith("★"));
  await picker.selectOption({ label: await option.innerText() });
  const filled = await rec.getByLabel("What was done").inputValue();
  check("…and the template filled in with the sender, reference and my name", filled.includes("Priya Test") && /TK-\d+/.test(filled) && filled.includes("Daniel Okoye"), filled);
  await d.keyboard.press("Escape");
  check("Escape closes the drawer", !(await rec.isVisible().catch(() => false)));
  await d.keyboard.press("b");
  await d.waitForURL((u) => u.pathname === "/hub");
  check("“b” goes back to the hub", true);
  check("hub: no errors in the page", d.errors.length === 0, d.errors.join(" | "));
  await d.context().close();

  // Tidy: the template goes; the test task stays in the demonstration data, accepted.
  sql(`delete from "ReplyTemplate" where title = '${title}'`);
}
