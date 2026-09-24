/**
 * Runs once when the server starts.
 *
 * The duty checks cannot wait for somebody to open a page: at 03:00 a missed
 * check call has to raise the alarm and buzz the officer's phone whether or
 * not anyone is signed in (Control, 25 September 2026). So the server runs the
 * sweep itself, every thirty seconds, from the moment it starts.
 *
 * Only in the Node.js runtime — the sweep needs the database. Where the portal
 * is hosted on a platform that does not keep a server running, set
 * DUTY_WORKER=off and have its scheduler run `npm run sweep:duty` instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DUTY_WORKER === "off") return;
  const { startDutyWorker } = await import("./lib/worker");
  startDutyWorker();
}
