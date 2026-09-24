/**
 * The duty-check sweep: the alerts that must not wait for someone to look.
 *
 * Officers do their own book-ons and check calls, and Control monitors
 * (Control, 24 September 2026). When one is missed, BOTH ends are told:
 *
 *   - Control, as a task on its list and an event in the log;
 *   - the officer, as an alert in their portal, addressed to their account.
 *
 * Three things raise one:
 *
 *   - a chase-up not confirmed with under an hour to go (the officer is asked
 *     to confirm; Control to chase);
 *   - no book-on once the shift is late — fifteen minutes in, not waiting for
 *     the no-show at thirty;
 *   - a check call missed (or, with no signal at the post, the client saying
 *     they cannot reach the officer).
 *
 * The pages work every state out live, so the alert is on screen the moment it
 * is true; this makes it durable, and closes it on both ends once put right.
 * Idempotent: one open alert per shift, per kind, per end. This is also where a
 * text or a push to the officer's phone hangs, once messaging is connected
 * (E16).
 *
 * Run by `npm run sweep:duty` from a scheduler every minute, and after any duty
 * page, the dashboard or an officer's portal is served.
 */

import { dutyStatus } from "@/lib/core/duty";
import { dayLabel, ukDate, ukTime } from "@/lib/core/rota";
import { db } from "./client";
import { getLiveRows } from "./queries";

/** Each alert's title starts with its kind, which is how an open one is found again. */
export const ALERT_KINDS = {
  chase: { control: "Chase-up not confirmed", officer: "Please confirm your shift" },
  bookOn: { control: "Not booked on", officer: "You have not booked on" },
  missed: { control: "Check call missed", officer: "Check call overdue" },
} as const;
type Kind = keyof typeof ALERT_KINDS;

export async function sweepDutyChecks(now = new Date()) {
  const rows = await getLiveRows(2, now);
  const open = await db.workItem.findMany({
    where: { assignmentId: { in: rows.map((r) => r.assignment.id) }, state: "open" },
    select: { id: true, title: true, assignmentId: true, ownerUserId: true, ownerRole: true },
  });
  const find = (id: string, kind: Kind, end: "control" | "officer", userId: string | null) =>
    open.find(
      (w) =>
        w.assignmentId === id &&
        w.title.startsWith(ALERT_KINDS[kind][end]) &&
        (end === "control" ? w.ownerRole === "control" : w.ownerUserId === userId),
    );

  let raised = 0;
  let closed = 0;
  for (const r of rows) {
    const s = dutyStatus(r, now);
    const start = new Date(r.assignment.startsAt);
    const shift = `${r.post.name} at ${r.siteName}, ${dayLabel(ukDate(start))} ${ukTime(start)}`;
    const who = `${r.personName}, ${shift}`;
    const due = s.schedule?.slots.find((x) => x.kind === "missed")?.dueAt;
    const wanted: Record<Kind, { control: string; officer: string } | null> = {
      chase:
        s.chase.state === "urgent"
          ? { control: `${ALERT_KINDS.chase.control}: ${who} — starts in ${s.chase.minutesToStart} min`, officer: `${ALERT_KINDS.chase.officer}: ${shift} starts in ${s.chase.minutesToStart} min` }
          : null,
      bookOn:
        s.stage === "late" || s.stage === "no_show"
          ? {
              control: `${ALERT_KINDS.bookOn.control}: ${who} — ${s.attendance.minutesLate} min${s.stage === "no_show" ? ", no-show: find cover" : ""}`,
              officer: `${ALERT_KINDS.bookOn.officer}: your shift at ${r.siteName} started at ${ukTime(start)}. Book on now, or ring Control`,
            }
          : null,
      missed:
        s.stage === "alert"
          ? {
              control: `${ALERT_KINDS.missed.control}: ${who} — ${s.call.label}`,
              officer: `${ALERT_KINDS.missed.officer}${due ? ` — it was due at ${ukTime(due)}` : ""}. Make your check call now, or ring Control`,
            }
          : null,
    };

    for (const kind of Object.keys(wanted) as Kind[]) {
      const w = wanted[kind];
      for (const end of ["control", "officer"] as const) {
        // An officer with no portal account is told by phone, by Control.
        if (end === "officer" && !r.officerUserId) continue;
        const existing = find(r.assignment.id, kind, end, r.officerUserId);
        if (w && !existing) {
          await db.$transaction([
            db.workItem.create({
              data:
                end === "control"
                  ? { title: w.control, assignmentId: r.assignment.id, ownerRole: "control", dueAt: now, slaDays: 0 }
                  : { title: w.officer, assignmentId: r.assignment.id, ownerUserId: r.officerUserId, dueAt: now, slaDays: 0 },
            }),
            db.event.create({
              data: {
                type: `duty.alert.${kind}.${end}`,
                actorSystem: "duty-sweep",
                department: "control",
                assignmentId: r.assignment.id,
                personId: r.assignment.personId,
                detail: end === "control" ? w.control : `Told ${r.personName} in their portal: ${w.officer}`,
              },
            }),
          ]);
          raised++;
        } else if (!w && existing) {
          await db.workItem.update({ where: { id: existing.id }, data: { state: "done", doneAt: now } });
          closed++;
        }
      }
    }
  }
  return { checked: rows.length, raised, closed };
}
