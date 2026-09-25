/** Runs the browser test suites in order. `npm run test:e2e -- hub security` for some. */
import { launch, results } from "./lib.mjs";

const ALL = ["smoke", "security", "oversight", "hub", "golive", "officer-offline", "client-portal", "site-issues", "rota-remove", "accessibility"];
const asked = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const suites = asked.length ? asked : ALL;
for (const s of suites) if (!ALL.includes(s)) throw new Error(`No suite "${s}". There are: ${ALL.join(", ")}`);

const browser = await launch();
try {
  for (const s of suites) {
    console.log(`\n— ${s} —`);
    const mod = await import(`./${s}.mjs`);
    try {
      await mod.default(browser);
    } catch (e) {
      const { check } = await import("./lib.mjs");
      check(`${s}: ran to the end`, false, e?.stack ?? e);
    }
  }
} finally {
  await browser.close();
}
const { fails, passes } = results();
console.log(`\n${passes} passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);
