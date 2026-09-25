/**
 * Runs once when the server starts.
 *
 * First, in production, the sign-in secret is checked: a weak or missing one
 * stops the server with the reason, rather than signing people in with a key
 * that could be guessed.
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
  // A live portal does not start on a weak or missing sign-in secret (26 September 2026).
  if (process.env.NODE_ENV === "production") {
    const { authSecret } = await import("./lib/auth/secret");
    authSecret();
  }
  if (process.env.DUTY_WORKER === "off") return;
  const { startDutyWorker } = await import("./lib/worker");
  startDutyWorker();
}
