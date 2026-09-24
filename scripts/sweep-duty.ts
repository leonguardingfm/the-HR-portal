/**
 * The duty-check sweep, for a scheduler to run every minute.
 *
 *   npm run sweep:duty
 *
 * Raises the alerts for an unconfirmed chase-up, a no-show and a missed check
 * call as tasks for Control, and closes them once put right. Safe to run as
 * often as you like.
 */

import { sweepDutyChecks } from "../lib/db/duty-sweep";

sweepDutyChecks()
  .then((r) => {
    console.log(`Checked ${r.checked} shift(s): ${r.raised} alert(s) raised, ${r.closed} closed.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
