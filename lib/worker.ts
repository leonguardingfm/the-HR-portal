/**
 * The server's own clock for the duty checks: the sweep every thirty seconds,
 * started by instrumentation.ts. One per process, however many times the
 * module is loaded — development reloads it on every edit.
 */

import { sweepDutyChecks } from "@/lib/db/duty-sweep";
import { sweepHr } from "@/lib/db/hr-sweep";
import { sweepHub } from "@/lib/db/hub-sweep";
import { sendWeeklySummaryIfDue } from "@/lib/db/weekly-summary";

export const WORKER_EVERY_MS = 30_000;
/** The hub's clocks are counted in minutes, so they are looked at more often. */
export const HUB_EVERY_MS = 10_000;

const state = globalThis as unknown as {
  __dutyWorker?: ReturnType<typeof setInterval>;
  __hubWorker?: ReturnType<typeof setInterval>;
  __dutyWorkerLastError?: string;
  __hubWorkerLastError?: string;
  __hubBusy?: boolean;
  /** When each sweep last finished well — what the health address reports. */
  __workerLastOk?: { duty?: number; hub?: number };
};

/** For the health address: when the background checks last ran without error. */
export function workerHealth() {
  return { running: !!state.__dutyWorker, dutyLastOk: state.__workerLastOk?.duty ?? null, hubLastOk: state.__workerLastOk?.hub ?? null, dutyError: state.__dutyWorkerLastError ?? null, hubError: state.__hubWorkerLastError ?? null };
}

export function startDutyWorker() {
  if (state.__dutyWorker) return;
  const tick = () => {
    Promise.all([sweepDutyChecks(), sweepHr(), sendWeeklySummaryIfDue()])
      .then(() => {
        state.__dutyWorkerLastError = undefined;
        state.__workerLastOk = { ...state.__workerLastOk, duty: Date.now() };
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
  const hubTick = () => {
    if (state.__hubBusy) return;
    state.__hubBusy = true;
    sweepHub()
      .then(() => {
        state.__hubWorkerLastError = undefined;
        state.__workerLastOk = { ...state.__workerLastOk, hub: Date.now() };
      })
      .catch((err) => {
        const message = String(err?.message ?? err);
        if (state.__hubWorkerLastError !== message) console.error("[hub worker]", message);
        state.__hubWorkerLastError = message;
      })
      .finally(() => {
        state.__hubBusy = false;
      });
  };
  state.__hubWorker = setInterval(hubTick, HUB_EVERY_MS);
  state.__hubWorker.unref?.();
  console.log(`[duty worker] Duty checks run every ${WORKER_EVERY_MS / 1000}s; the hub's clocks every ${HUB_EVERY_MS / 1000}s.`);
}
