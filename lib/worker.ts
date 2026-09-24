/**
 * The server's own clock for the duty checks: the sweep every thirty seconds,
 * started by instrumentation.ts. One per process, however many times the
 * module is loaded — development reloads it on every edit.
 */

import { sweepDutyChecks } from "@/lib/db/duty-sweep";
import { sweepHr } from "@/lib/db/hr-sweep";

export const WORKER_EVERY_MS = 30_000;

const state = globalThis as unknown as { __dutyWorker?: ReturnType<typeof setInterval>; __dutyWorkerLastError?: string };

export function startDutyWorker() {
  if (state.__dutyWorker) return;
  const tick = () => {
    Promise.all([sweepDutyChecks(), sweepHr()])
      .then(() => {
        state.__dutyWorkerLastError = undefined;
      })
      .catch((err) => {
        // Said once per kind of failure, not every thirty seconds.
        const message = String(err?.message ?? err);
        if (state.__dutyWorkerLastError !== message) console.error("[duty worker]", message);
        state.__dutyWorkerLastError = message;
      });
  };
  // A first run shortly after start, once the server is taking requests.
  setTimeout(tick, 5_000);
  state.__dutyWorker = setInterval(tick, WORKER_EVERY_MS);
  // Never the thing keeping a finished process alive.
  state.__dutyWorker.unref?.();
  console.log(`[duty worker] Duty checks run every ${WORKER_EVERY_MS / 1000}s.`);
}
