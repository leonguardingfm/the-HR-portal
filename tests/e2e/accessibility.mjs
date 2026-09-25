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

  // Scrolling: nothing on a page ever passes over the top bar (the rota's frozen key once did).
  const d = await signIn(browser, "daniel.okoye", { landing: "/scheduling" });
  const h = await d.evaluate(() => document.querySelector("[data-shell-top]").getBoundingClientRect().height);
  const max = await d.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  let over = 0;
  for (let y = 0; y <= Math.min(max, 2400); y += 80) {
    await d.evaluate((y) => window.scrollTo(0, y), y);
    await d.waitForTimeout(30);
    over += await d.evaluate((h) => {
      let n = 0;
      for (const yy of [8, Math.round(h / 2), Math.round(h - 6)]) for (let x = 230; x < innerWidth - 10; x += 120) {
        const el = document.elementFromPoint(x, yy);
        if (!el || !el.closest("[data-shell-top]")) n++;
      }
      return n;
    }, h);
  }
  check("scrolling the rota, nothing passes over the top bar", over === 0, `${over} points`);
  await d.context().close();
}
