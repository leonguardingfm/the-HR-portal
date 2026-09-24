/**
 * The duty-check sweep, for an outside scheduler to run every minute where the
 * server's own worker is switched off (DUTY_WORKER=off).
 *
 *   npm run sweep:duty
 *
 * Raises the alerts — an unconfirmed chase-up, a no-show, a missed check call,
 * a shift nobody is on, a licence running out — pushes them to phones and
 * desks, and closes them once put right. Safe to run as often as you like.
 */

import { sweepDutyChecks } from "../lib/db/duty-sweep";

sweepDutyChecks()
  .then((r) => {
    console.log(`Checked ${r.checked} shift(s): ${r.raised} alert(s) raised, ${r.closed} closed, ${r.pushed} push(es) delivered.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
