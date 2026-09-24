/**
 * Leave, one way for everyone (HR, 25 September 2026). An officer asks from
 * their portal, or HR asks on their behalf; either way the request goes to
 * Administration to decide. While it waits the rota warns anyone putting them
 * on in those dates; once approved the rota refuses it, the shifts they were
 * already on come off onto the cover list, and they are told in their portal.
 * One request, one place — Control never has to be told separately.
 *
 * Not a server action: callers check who is asking first.
 */

import { ALERT_KIND_SPECS } from "@/lib/core/alerts";
import { leaveHours, leaveProblemFor } from "@/lib/core/employees";
import { addDays, dayLabel, hoursOf, ukDate, ukInstant } from "@/lib/core/rota";
import type { Role } from "@/lib/types";
import { db } from "./client";
import { loadLive, officerOffWrites } from "./cover";

/** Leave from the start of the first UK day to the start of the day after the last. */
export function leaveWindow(from: string, to: string) {
  return { startsOn: ukInstant(from, "00:00"), endsOn: ukInstant(addDays(to, 1), "00:00") };
}

const rosteredIn = (personId: string, w: { startsOn: Date; endsOn: Date }) =>
  db.assignment.findMany({
    where: { personId, state: { not: "cancelled" }, startsAt: { lt: w.endsOn }, endsAt: { gt: w.startsOn } },
    select: { id: true, startsAt: true, endsAt: true, state: true },
  });

export type LeaveOutcome = { ok: true; message: string; requestId: string } | { ok: false; message: string };

export async function raiseLeave(args: {
  personId: string;
  from: string;
  to: string;
  note: string | null;
  by: { userId: string; role: Role };
  onBehalf: boolean;
}): Promise<LeaveOutcome> {
  const problem = leaveProblemFor(args.from, args.to, ukDate(new Date()));
  if (problem) return { ok: false, message: problem };
  const person = await db.person.findUnique({ where: { id: args.personId }, include: { employment: true } });
  if (!person?.employment || person.employment.state === "ended") return { ok: false, message: "Only a current employee takes leave." };
  const w = leaveWindow(args.from, args.to);
  const [overlap, shifts, ent] = await Promise.all([
    db.holidayRequest.findFirst({ where: { personId: person.id, decision: { in: ["pending", "approved"] }, startsOn: { lt: w.endsOn }, endsOn: { gt: w.startsOn } } }),
    rosteredIn(person.id, w),
    db.holidayEntitlement.findFirst({ where: { personId: person.id, leaveYearStart: { lte: w.startsOn }, leaveYearEnd: { gt: w.startsOn } } }),
  ]);
  if (overlap) return { ok: false, message: `There is already ${overlap.decision === "approved" ? "approved leave" : "a leave request waiting"} over some of those dates.` };
  const byDate: Record<string, number> = {};
  for (const s of shifts) byDate[ukDate(s.startsAt)] = (byDate[ukDate(s.startsAt)] ?? 0) + hoursOf(s);
  const hours = leaveHours(args.from, args.to, byDate);
  const when = args.from === args.to ? dayLabel(args.from) : `${dayLabel(args.from)} to ${dayLabel(args.to)}`;
  const on = shifts.length ? ` — on ${shifts.length} shift${shifts.length === 1 ? "" : "s"} then` : "";
  const now = new Date();
  const request = await db.$transaction(async (tx) => {
    const r = await tx.holidayRequest.create({
      data: { personId: person.id, entitlementId: ent?.id ?? null, startsOn: w.startsOn, endsOn: w.endsOn, hoursRequested: hours, note: args.note, shiftsAffected: shifts.length },
    });
    await tx.workItem.create({
      data: { title: `Leave request: ${person.fullName}, ${when} (${hours}h)${on}`, personId: person.id, ownerRole: "admin_manager", dueAt: new Date(now.getTime() + 2 * 86_400_000), slaDays: 2 },
    });
    await tx.event.create({
      data: {
        type: "leave.requested",
        actorUserId: args.by.userId,
        actorRole: args.by.role,
        department: "administration",
        personId: person.id,
        detail: `${person.fullName} ${args.onBehalf ? "had leave asked for on their behalf" : "asked for leave"}: ${when}, ${hours} hours${on}.${args.note ? ` ${args.note}` : ""}`,
      },
    });
    return r;
  });
  return {
    ok: true,
    requestId: request.id,
    message: `Sent to Administration to decide.${shifts.length ? ` ${args.onBehalf ? "They are" : "You are"} on ${shifts.length} shift${shifts.length === 1 ? "" : "s"} in those dates — if it is approved, ${shifts.length === 1 ? "it comes" : "they come"} off and Control finds cover.` : ""}`,
  };
}

/**
 * The writes that follow an approval: every shift in the window comes off
 * (drafts simply go), each published one onto the cover list; availability
 * they had given for those days is replaced by the leave. Run after the
 * decision itself is saved.
 */
export async function applyApprovedLeave(requestId: string, actor: { userId: string; role: Role }, now = new Date()) {
  const r = await db.holidayRequest.findUnique({ where: { id: requestId }, include: { person: { include: { user: { select: { id: true } } } } } });
  if (!r || r.decision !== "approved") return { off: 0, cover: 0 };
  const shifts = await rosteredIn(r.personId, r);
  let cover = 0;
  for (const s of shifts) {
    if (s.state === "draft") {
      await db.$transaction([
        db.openShift.updateMany({ where: { assignmentId: s.id }, data: { assignmentId: null } }),
        db.assignment.update({ where: { id: s.id }, data: { state: "cancelled" } }),
      ]);
      continue;
    }
    const live = await loadLive(s.id);
    if (!live || live.leftCover) continue;
    const off = officerOffWrites(live, "other", `On approved leave ${ukDate(r.startsOn)} to ${ukDate(new Date(r.endsOn.getTime() - 1))}`, { userId: actor.userId, role: actor.role }, now);
    if (!off.ok) continue;
    await db.$transaction(off.writes);
    cover++;
  }
  const first = ukDate(r.startsOn);
  const last = ukDate(new Date(r.endsOn.getTime() - 1));
  await db.$transaction([
    // Their availability for those days is now "on leave" — what Control sees.
    db.availability.deleteMany({ where: { personId: r.personId, date: { gte: new Date(`${first}T00:00:00Z`), lte: new Date(`${last}T00:00:00Z`) } } }),
    db.workItem.updateMany({ where: { personId: r.personId, state: "open", title: { startsWith: `Leave request: ${r.person.fullName},` } }, data: { state: "done", doneAt: now } }),
  ]);
  return { off: shifts.length, cover };
}

/** Tell the officer in their portal — and on their phone — what was decided. */
export async function tellOfficerAboutLeave(requestId: string, now = new Date()) {
  const r = await db.holidayRequest.findUnique({ where: { id: requestId }, include: { person: { include: { user: { select: { id: true, active: true } } } } } });
  if (!r?.person.user?.active) return;
  const first = ukDate(r.startsOn);
  const last = ukDate(new Date(r.endsOn.getTime() - 1));
  const when = first === last ? dayLabel(first) : `${dayLabel(first)} to ${dayLabel(last)}`;
  const title =
    r.decision === "approved"
      ? `${ALERT_KIND_SPECS.officer_leave.prefix} ${when} is approved.${r.shiftsAffected ? " Your shifts on those days have been taken off." : ""}`
      : `${ALERT_KIND_SPECS.officer_leave.prefix} request for ${when} was not approved${r.note ? ` — ${r.note}` : ""}.`;
  await db.workItem.create({ data: { ownerUserId: r.person.user.id, personId: r.personId, title, dueAt: now, slaDays: 0 } });
}
