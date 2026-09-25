/**
 * The Performance hub's clocks, run by the server's worker every ten seconds
 * (Control, 25 September 2026) — whether anyone has the hub open or not:
 *
 *   - two thirds of the way to a deadline, a warning: "still no owner",
 *     "record the action";
 *   - at the deadline, a breach, recorded once, and the supervisor told;
 *   - every update period while a task is open, a request for an update —
 *     missing one is a breach too; a task on hold waits for its follow-up;
 *   - two breaches on one task, and the Managing Director is told;
 *   - an owner whose shift has ended with work still open: the supervisor is
 *     told it needs handing over.
 *
 * Nothing here closes or reassigns a task on its own. Shadow mailboxes are
 * read and sorted but never nag anyone.
 */

import { CLOSED, IN_HAND, MANAGER_ROLE, SUPERVISOR_ROLES, WAITING, departmentLabel, nextUpdateDue, spanWords, taskRef, warnAt, type Clock, type HubDepartment, type HubPriority, type HubStatus } from "@/lib/core/hub";
import type { Role } from "@/lib/types";
import { db } from "./client";
import { notify, officeHoursFor, slaPolicy } from "./hub";

/** An owner not seen for this long, with no open session, has gone off shift. */
const OFF_SHIFT_MINUTES = 20;

type Notice = { level: "info" | "warning" | "critical"; text: string; toUserId?: string | null; toRole?: Role; department?: HubDepartment };

export async function sweepHub(now = new Date()) {
  const policy = await slaPolicy();
  const open = await db.hubTask.findMany({
    where: { status: { notIn: CLOSED } },
    include: { mailbox: { select: { mode: true, officeHoursOnly: true } }, owner: { select: { displayName: true } } },
  });
  const live = open.filter((t) => t.mailbox?.mode !== "shadow");
  if (!live.length) return { warnings: 0, breaches: 0, handovers: 0 };
  const seen = new Set(
    (await db.hubSlaEvent.findMany({ where: { taskId: { in: live.map((t) => t.id) } }, select: { taskId: true, clock: true, kind: true, dueAt: true } })).map((e) => `${e.taskId}|${e.clock}|${e.kind}|${e.dueAt.getTime()}`),
  );
  let warnings = 0;
  let breaches = 0;
  let handovers = 0;

  for (const t of live) {
    const dept = t.department as HubDepartment;
    const office = officeHoursFor(t);
    const p = policy[t.priority as HubPriority];
    const ref = taskRef(t);
    const supervisors = (text: string, level: Notice["level"] = "critical"): Notice[] => SUPERVISOR_ROLES[dept].map((r) => ({ level, text, toRole: r as Role }));

    const record = async (clock: Clock, kind: "warning" | "breach", dueAt: Date, notices: Notice[], extra: Record<string, unknown> = {}) => {
      const key = `${t.id}|${clock}|${kind}|${dueAt.getTime()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return db.$transaction(async (tx) => {
        const r = await tx.hubSlaEvent.createMany({ data: [{ taskId: t.id, clock, kind, dueAt, at: now, ownerUserId: t.ownerUserId }], skipDuplicates: true });
        if (!r.count) return false;
        if (kind === "breach") {
          await tx.hubTask.update({ where: { id: t.id }, data: { breaches: { increment: 1 }, ...extra } });
          t.breaches += 1;
        } else if (Object.keys(extra).length) await tx.hubTask.update({ where: { id: t.id }, data: extra });
        for (const n of notices) await notify(tx, { taskId: t.id, ...n });
        await tx.event.create({
          data: {
            type: `hub.sla_${kind}`,
            actorSystem: "hub-sweep",
            department: dept,
            hubTaskId: t.id,
            detail: `${ref}: ${clock === "accept" ? "no owner" : clock === "action" ? "no action recorded" : "no progress update"} ${kind === "breach" ? `by ${dueAt.toISOString()} — SLA breach` : "yet — warning"}.`,
          },
        });
        return true;
      });
    };

    if (t.status === "unassigned") {
      const warn = warnAt(t.receivedAt, p.accept, office);
      if (now >= t.ackDueAt) {
        if (await record("accept", "breach", t.ackDueAt, [{ level: "critical", text: `${ref} has waited ${spanWords(now.getTime() - t.receivedAt.getTime())} for an owner: ${t.subject}`, department: dept }, ...supervisors(`${ref} is over its time with no owner — ${t.subject}`)])) breaches++;
      } else if (now >= warn) {
        if (await record("accept", "warning", t.ackDueAt, [{ level: "warning", text: `${ref} still has no owner — ${spanWords(t.ackDueAt.getTime() - now.getTime())} left: ${t.subject}`, department: dept }])) warnings++;
      }
    } else if (!t.firstActionAt && IN_HAND.includes(t.status as HubStatus)) {
      const warn = warnAt(t.receivedAt, p.action, office);
      if (now >= t.actionDueAt) {
        if (await record("action", "breach", t.actionDueAt, [{ level: "critical", text: `${ref}: no action recorded in time — record what has been done`, toUserId: t.ownerUserId }, ...supervisors(`${ref} (${t.owner?.displayName ?? "no owner"}): no action recorded in time`)])) breaches++;
      } else if (now >= warn) {
        if (await record("action", "warning", t.actionDueAt, [{ level: "warning", text: `${ref}: record the action taken — ${spanWords(t.actionDueAt.getTime() - now.getTime())} left`, toUserId: t.ownerUserId }])) warnings++;
      }
    } else if (t.firstActionAt) {
      // On hold: nothing is due until the follow-up; then the update clock runs again.
      if (WAITING.includes(t.status as HubStatus) && t.followUpAt && !t.updateDueAt && now >= t.followUpAt) {
        if (await record("update", "warning", t.followUpAt, [{ level: "warning", text: `${ref}: follow-up due now — ${t.waitingFor ?? "chase"} (${t.waitingReason ?? "on hold"})`, toUserId: t.ownerUserId }], { updateDueAt: nextUpdateDue(t.followUpAt, t.priority as HubPriority, office, policy) })) warnings++;
      } else if (t.updateDueAt && now >= t.updateDueAt) {
        // One breach for the update missed; the next is due one period on, however long the server was away.
        let next = nextUpdateDue(t.updateDueAt, t.priority as HubPriority, office, policy);
        for (let i = 0; i < 500 && next <= now; i++) next = nextUpdateDue(next, t.priority as HubPriority, office, policy);
        if (await record("update", "breach", t.updateDueAt, [{ level: "warning", text: `${ref}: progress update needed — add what has happened since ${t.lastUpdateAt ? spanWords(now.getTime() - t.lastUpdateAt.getTime()) + " ago" : "the last one"}`, toUserId: t.ownerUserId }], { updateDueAt: next })) breaches++;
      }
    }

    // Two breaches on one task: the Managing Director hears of it, once.
    if (t.breaches >= 2 && !t.managementAlertedAt) {
      await db.$transaction(async (tx) => {
        const r = await tx.hubTask.updateMany({ where: { id: t.id, managementAlertedAt: null }, data: { managementAlertedAt: now } });
        if (!r.count) return;
        await notify(tx, { taskId: t.id, level: "warning", text: `Repeated SLA breaches on ${ref} (${departmentLabel(dept)}, ${t.owner?.displayName ?? "unassigned"}): ${t.subject}`, toRole: "top_management" });
        await notify(tx, { taskId: t.id, level: "warning", text: `Repeated SLA breaches on ${ref} — management has been told`, toRole: MANAGER_ROLE[dept] as Role });
        await tx.event.create({ data: { type: "hub.escalated_to_management", actorSystem: "hub-sweep", department: dept, hubTaskId: t.id, detail: `${ref}: ${t.breaches} SLA breaches — escalated to management.` } });
      });
    }
  }

  // Owners whose shift has ended with work still open.
  const owned = live.filter((t) => t.ownerUserId && IN_HAND.includes(t.status as HubStatus));
  const owners = [...new Set(owned.map((t) => t.ownerUserId!))];
  if (owners.length) {
    const onShift = new Set(
      (await db.workSession.findMany({ where: { userId: { in: owners }, signedOutAt: null, lastSeenAt: { gt: new Date(now.getTime() - OFF_SHIFT_MINUTES * 60_000) } }, select: { userId: true } })).map((s) => s.userId),
    );
    for (const t of owned) {
      const away = !onShift.has(t.ownerUserId!);
      if (away && !t.handoverNeededAt) {
        await db.$transaction(async (tx) => {
          await tx.hubTask.update({ where: { id: t.id }, data: { handoverNeededAt: now } });
          for (const role of SUPERVISOR_ROLES[t.department as HubDepartment]) {
            await notify(tx, { taskId: t.id, level: "warning", text: `${t.owner?.displayName ?? "Its owner"} has gone off shift with ${taskRef(t)} still open — hand it over`, toRole: role as Role });
          }
          await tx.event.create({ data: { type: "hub.handover_needed", actorSystem: "hub-sweep", department: t.department, hubTaskId: t.id, detail: `${taskRef(t)}: ${t.owner?.displayName ?? "the owner"} has gone off shift with it open and not handed over.` } });
        });
        handovers++;
      } else if (!away && t.handoverNeededAt) {
        await db.hubTask.update({ where: { id: t.id }, data: { handoverNeededAt: null } });
      }
    }
  }

  // A critical alarm stops once somebody has it.
  await db.workItem.updateMany({ where: { state: "open", hubTaskId: { in: live.filter((t) => t.status !== "unassigned").map((t) => t.id) } }, data: { state: "done", doneAt: now } });
  return { warnings, breaches, handovers };
}
