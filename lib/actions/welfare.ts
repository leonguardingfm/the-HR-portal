"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { ATTENDEE_LABELS, OUTCOME_SPECS, dispatchProblem, outcomeProblem, type WelfareAttendee, type WelfareOutcome } from "@/lib/core/welfare";
import { ukTime } from "@/lib/core/rota";
import { loadLive, officerOffWrites } from "@/lib/db/cover";
import { sweepDutyChecks } from "@/lib/db/duty-sweep";
import { pushToUsers, usersHolding } from "@/lib/db/push";
import { refused, ok, type ActionResult } from "./types";

/**
 * Step 3 of the escalation ladder: sending a supervisor or the Operations
 * Manager to site, marking them arrived, and recording what they found
 * (Control, 25 September 2026). The outcome closes the missed-call alert and
 * is the welfare record for the shift.
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { session: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) {
    const spec = ACTIONS[action];
    return {
      session,
      error: refused(`${spec.what} belongs to ${spec.owner}. You are working as ${session.activeRole.replace(/_/g, " ")}, so the platform refuses it.`),
    };
  }
  return { session, error: null };
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const refresh = () => {
  for (const p of ["/duty/check-calls", "/live", "/", "/tasks"]) revalidatePath(p);
};

export async function dispatchWelfareVisit(assignmentId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("welfare.visit");
  if (error || !session) return error!;
  const a = await db.assignment.findUnique({
    where: { id: String(assignmentId) },
    include: { person: { select: { fullName: true } }, post: { include: { site: true } }, bookOn: true, welfareVisits: { where: { closedAt: null } } },
  });
  const now = new Date();
  if (!a || a.state === "cancelled" || a.state === "draft") return refused("That shift is no longer on the rota.");
  if (!a.bookOn) return refused("The officer has not booked on — this is a no-show, not a welfare visit. Take them off and find cover.");
  if (a.welfareVisits.length) return refused(`${a.welfareVisits[0].attendeeName} is already on the way.`);

  const kind = text(formData, "kind") as WelfareAttendee;
  let name = text(formData, "name");
  let phone = text(formData, "phone") || null;
  let attendeeUserId: string | null = null;
  if (kind === "operations_manager") {
    // The Operations Manager is a person with an account: named from it, not typed.
    const managers = await usersHolding(["operations_manager"]);
    attendeeUserId = text(formData, "userId");
    if (!managers.includes(attendeeUserId)) return refused("Choose which Operations Manager is going.");
    const u = await db.user.findUnique({ where: { id: attendeeUserId }, include: { person: { select: { phone: true } } } });
    name = u?.displayName ?? name;
    phone = phone ?? u?.person.phone ?? null;
  }
  const etaMinutes = Number(text(formData, "eta"));
  const problem = dispatchProblem({ kind, name, phone, etaMinutes });
  if (problem) return refused(problem);
  const expectedBy = new Date(now.getTime() + etaMinutes * 60_000);
  const where = `${a.post.name}, ${a.post.site.name}`;

  try {
    await db.$transaction([
      db.welfareVisit.create({
        data: { assignmentId: a.id, dispatchedAt: now, dispatchedById: session.userId, attendeeKind: kind, attendeeName: name, attendeePhone: phone, attendeeUserId, expectedBy },
      }),
      db.event.create({
        data: {
          type: "welfare.dispatched",
          actorUserId: session.userId,
          actorRole: session.activeRole,
          department: "control",
          assignmentId: a.id,
          personId: a.personId,
          detail: `${ATTENDEE_LABELS[kind]} ${name} sent to ${where} to check on ${a.person.fullName} — expected by ${ukTime(expectedBy)}.`,
        },
      }),
    ]);
  } catch (e) {
    if (String(e).includes("welfare_visit_one_open")) return refused("Somebody is already on the way to this officer.");
    throw e;
  }

  // The Operations Manager is told at once, whoever is going.
  const managers = await usersHolding(["operations_manager"]);
  await pushToUsers(managers, {
    title: "Welfare visit: someone is going to site",
    body: `${name} is going to ${where} for ${a.person.fullName}, expected by ${ukTime(expectedBy)}.`,
    url: "/duty/check-calls",
    tag: `welfare-${a.id}`,
    urgent: true,
  });
  refresh();
  return ok(`${name} is on the way, expected by ${ukTime(expectedBy)}. If they are not marked arrived by ${ukTime(new Date(expectedBy.getTime() + 2 * 60_000))}, Control and the Operations Manager are alarmed.`);
}

export async function markWelfareArrived(visitId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("welfare.visit");
  if (error || !session) return error!;
  const v = await db.welfareVisit.findUnique({ where: { id: String(visitId) }, include: { assignment: { include: { person: { select: { fullName: true } }, post: { include: { site: true } } } } } });
  if (!v || v.closedAt) return refused("That visit is already closed.");
  if (v.arrivedAt) return refused(`Marked arrived at ${ukTime(v.arrivedAt)} already.`);
  const now = new Date();
  await db.$transaction([
    db.welfareVisit.update({ where: { id: v.id }, data: { arrivedAt: now, arrivedRecordedById: session.userId } }),
    db.event.create({
      data: {
        type: "welfare.arrived",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        assignmentId: v.assignmentId,
        personId: v.assignment.personId,
        detail: `${v.attendeeName} arrived at ${v.assignment.post.site.name} at ${ukTime(now)} to check on ${v.assignment.person.fullName}.`,
      },
    }),
  ]);
  await sweepDutyChecks();
  refresh();
  return ok(`${v.attendeeName} is on site. Record what they found.`);
}

export async function recordWelfareOutcome(visitId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("welfare.visit");
  if (error || !session) return error!;
  const v = await db.welfareVisit.findUnique({ where: { id: String(visitId) }, include: { assignment: { include: { person: { select: { fullName: true } }, post: { include: { site: true } } } } } });
  if (!v || v.closedAt) return refused("That visit is already closed.");
  const outcome = text(formData, "outcome") as WelfareOutcome;
  const note = text(formData, "note").slice(0, 600);
  const policeCalled = formData.get("police") === "on";
  const policeReference = text(formData, "policeReference").slice(0, 60) || null;
  const clientTold = formData.get("clientTold") === "on";
  const clientContact = text(formData, "clientContact").slice(0, 120) || null;
  const problem = outcomeProblem({ outcome, note, policeCalled, arrived: !!v.arrivedAt });
  if (problem) return refused(problem);
  if (policeCalled && !policeReference) return refused("Give the police reference, so the record can be followed up.");
  if (clientTold && !clientContact) return refused("Say who at the client was told.");

  const now = new Date();
  const spec = OUTCOME_SPECS[outcome];
  const a = v.assignment;
  const where = `${a.post.name}, ${a.post.site.name}`;
  const summary = `Welfare visit to ${a.person.fullName} at ${where}: ${spec.label.toLowerCase()}. ${note}${policeCalled ? ` Police called, reference ${policeReference}.` : ""}`;

  // An officer found unwell, not on site or not found comes off the shift, and it goes on the cover list.
  let off: ReturnType<typeof officerOffWrites> | null = null;
  if (spec.officerComesOff) {
    const live = await loadLive(a.id);
    if (live && live.state !== "cancelled" && live.endsAt > now) {
      off = officerOffWrites(live, outcome === "unwell_ambulance" ? "sick" : outcome === "post_abandoned" ? "no_show" : "other", `Welfare visit: ${spec.label}`, { userId: session.userId, role: session.activeRole }, now);
      if (!off.ok) off = null;
    }
  }

  await db.$transaction(async (tx) => {
    let incidentId: string | null = null;
    if (policeCalled) {
      const i = await tx.incident.create({
        data: { assignmentId: a.id, at: now, severity: "serious", summary, reportedByUserId: session.userId, clientNotified: clientTold, clientNotifiedAt: clientTold ? now : null },
      });
      incidentId = i.id;
    }
    await tx.welfareVisit.update({
      where: { id: v.id },
      data: { outcome, outcomeNote: note, policeCalled, policeReference, clientToldAt: clientTold ? now : null, clientContact, closedAt: now, closedById: session.userId, incidentId },
    });
    // Safe and well, or back in touch: that is contact made, so the hour starts again.
    if (outcome === "safe_and_well" || outcome === "stood_down") {
      await tx.checkCall.create({
        data: { assignmentId: a.id, at: now, channel: outcome === "safe_and_well" ? "supervisor" : "phone", allWell: true, note: outcome === "safe_and_well" ? `Confirmed on site by ${v.attendeeName}` : `Visit stood down: ${note}`, takenByUserId: session.userId },
      });
    }
    // The missed-call and overdue alerts for the shift are answered by this record.
    await tx.workItem.updateMany({
      where: { assignmentId: a.id, state: "open", OR: [{ title: { startsWith: "Check call missed" } }, { title: { startsWith: "Welfare visit overdue" } }, { title: { startsWith: "Check call overdue" } }] },
      data: { state: "done", doneAt: now },
    });
    await tx.event.create({
      data: { type: "welfare.closed", actorUserId: session.userId, actorRole: session.activeRole, department: "control", assignmentId: a.id, personId: a.personId, siteId: a.post.siteId, detail: summary },
    });
  });
  // Off the shift, with its cover need and amendment, as its own batch — the
  // same writes Control's own "take them off" makes.
  if (off?.ok) await db.$transaction(off.writes);
  await sweepDutyChecks();
  refresh();
  return ok(
    spec.officerComesOff
      ? `Recorded. ${a.person.fullName} is off the shift${off?.ok ? ` — ${off.coverLabel} is on the cover list` : ""}.${!clientTold ? " Tell the client." : ""}`
      : `Recorded. ${a.person.fullName} is ${outcome === "stood_down" ? "back in contact" : "safe"}, and the next check call is due in an hour.`,
  );
}
