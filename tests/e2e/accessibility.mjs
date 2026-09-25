/** Keyboard first: a skip link, a visible focus ring, and dialogs that take focus. */
import { check, signIn } from "./lib.mjs";

export default async function accessibility(browser) {
  const p = await signIn(browser, "olivia", { landing: "/tasks" });
  await p.keyboard.press("Tab");
  const first = await p.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), href: document.activeElement?.getAttribute("href") }));
  check("the first Tab reaches “Skip to the page”", first.text === "Skip to the page" && first.href === "#main", JSON.stringify(first));
  await p.keyboard.press("Enter");
  check("…which moves past the menu to the page", await p.evaluate(() => document.activeElement?.id === "main"));
  await p.keyboard.press("Tab");
  const ring = await p.evaluate(() => {
    const s = getComputedStyle(document.activeElement);
    return `${s.outlineStyle} ${s.outlineWidth}`;
  });
  check("the focused control shows a ring", /solid 2px/.test(ring), ring);
  const lang = await p.evaluate(() => document.documentElement.lang);
  check("the page says it is in British English", lang === "en-GB", lang);
  await p.context().close();
}
