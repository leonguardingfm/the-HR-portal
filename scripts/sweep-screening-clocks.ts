/**
 * The daily screening clock sweep, for a scheduler to run.
 *
 *   npm run sweep:clocks
 *
 * Put it in cron, launchd or the host's scheduled jobs once a day. Safe to run
 * more often: a file it has already expired is left alone.
 */

import { sweepScreeningClocks } from "../lib/db/sweeps";

sweepScreeningClocks()
  .then((r) => {
    console.log(`Checked ${r.checked} file(s) on the clock.`);
    console.log(r.expired.length ? `Expired: ${r.expired.join(", ")}` : "None expired.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
