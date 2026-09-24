"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { ALERT_KIND_SPECS, alertKind, closesItself } from "@/lib/core/alerts";
import { departmentOfRole, rolesOfDepartment } from "@/lib/core/work";
import type { Role } from "@/lib/types";
import { refused, ok, type ActionResult } from "./types";

/**
 * Working the queue: taking a task from the department's pool so the other
 * desk can see it is being handled, handing it back, and closing it
 * (Control, 25 September 2026).
 *
 * A task belongs to a role until somebody takes it. Taking it puts a name on
 * it — "Control Alpha desk has had this since 12:04" — and the other desk
 * leaves it alone. Taking over from a colleague is allowed, and says so in the
 * log, because the colleague may have gone home.
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

const refresh = () => {
  revalidatePath("/tasks");
  revalidatePath("/");
};

async function load(workItemId: string) {
  return db.workItem.findUnique({
    where: { id: String(workItemId) },
    include: {
      owner: { select: { id: true, displayName: true, department: true } },
      coverNeed: { select: { coverAssignmentId: true, closedAt: true, endsAt: true } },
      openShift: { select: { assignmentId: true, cancelledAt: true, endsAt: true } },
    },
  });
}

/** Whether this role works this item's department. */
function worksIt(role: Role, ownerRole: Role | null): boolean {
  if (!ownerRole) return false;
  return rolesOfDepartment(departmentOfRole(ownerRole)).includes(role);
}

export async function takeTask(workItemId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("work_item.take");
  if (error || !session) return error!;
  const item = await load(workItemId);
  if (!item || (item.state !== "open" && item.state !== "blocked")) return refused("That task is already closed.");
  if (!item.ownerRole) {
    return refused(item.owner?.department === "officer" ? "That is an officer's own alert, in their portal." : `That task was given to ${item.owner?.displayName ?? "someone"} by name.`);
  }
  if (!worksIt(session.activeRole, item.ownerRole)) return refused(`That task belongs to ${departmentOfRole(item.ownerRole).label}. You are working as ${session.activeRole.replace(/_/g, " ")}.`);
  if (item.ownerUserId === session.userId) return refused("You already have it.");
  const over = item.ownerUserId && item.owner ? item.owner.displayName : null;
  if (over && formData.get("over") !== "1") return refused(`${over} has it. Take it over only if they cannot carry on with it.`);

  const now = new Date();
  await db.$transaction([
    db.workItem.update({ where: { id: item.id }, data: { ownerUserId: session.userId, takenAt: now } }),
    db.event.create({
      data: {
        type: over ? "work_item.taken_over" : "work_item.taken",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: departmentOfRole(item.ownerRole).event,
        personId: item.personId,
        assignmentId: item.assignmentId,
        requirementId: item.requirementId,
        detail: over ? `${session.name} took over “${item.title}” from ${over}.` : `${session.name} took “${item.title}”.`,
      },
    }),
  ]);
  refresh();
  return ok(over ? `It is yours now. ${over} can see you took it over.` : "It is yours. The other desks can see you are on it.");
}

export async function releaseTask(workItemId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("work_item.take");
  if (error || !session) return error!;
  const item = await load(workItemId);
  if (!item || (item.state !== "open" && item.state !== "blocked")) return refused("That task is already closed.");
  if (item.ownerUserId !== session.userId) return refused("Only the person who has it can hand it back.");
  if (!item.ownerRole) return refused("That task was given to you by name, so there is no pool to hand it back to.");

  await db.$transaction([
    db.workItem.update({ where: { id: item.id }, data: { ownerUserId: null, takenAt: null } }),
    db.event.create({
      data: {
        type: "work_item.released",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: departmentOfRole(item.ownerRole).event,
        personId: item.personId,
        assignmentId: item.assignmentId,
        detail: `${session.name} handed “${item.title}” back to ${departmentOfRole(item.ownerRole).label}.`,
      },
    }),
  ]);
  refresh();
  return ok("Handed back. It is anybody's to take again.");
}

/**
 * Why a task cannot be closed by hand, or null. An alert that closes itself
 * does so when the thing is put right — a book-on, a check call, somebody on
 * the shift — so ticking it off would only hide something still true.
 */
function stillLive(item: NonNullable<Awaited<ReturnType<typeof load>>>, assignment: { state: string; endsAt: Date } | null, now: Date): string | null {
  if (!closesItself(item)) return null;
  const kind = alertKind(item.title);
  if (item.coverNeed) return item.coverNeed.coverAssignmentId || item.coverNeed.closedAt || item.coverNeed.endsAt <= now ? null : "It closes itself once somebody covers the shift — or decide on the rota to leave it uncovered, with the reason.";
  if (item.openShift) return item.openShift.assignmentId || item.openShift.cancelledAt || item.openShift.endsAt <= now ? null : "It closes itself once somebody is on the shift. Fill it on the rota, or remove the shift if it is not needed.";
  if (kind === "licence") return "It closes itself when the renewed licence is recorded.";
  if (assignment && assignment.state !== "cancelled" && assignment.endsAt > now) {
    return `It closes itself when put right — ${ALERT_KIND_SPECS[kind].page === "check-calls" ? "a check call is made" : ALERT_KIND_SPECS[kind].page === "book-ons" ? "the officer books on or comes off the shift" : "the officer confirms"}.`;
  }
  return null;
}

export async function finishTask(workItemId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("work_item.complete");
  if (error || !session) return error!;
  const item = await load(workItemId);
  if (!item || (item.state !== "open" && item.state !== "blocked")) return refused("That task is already closed.");
  if (item.ownerUserId && item.ownerUserId !== session.userId) {
    return refused(`${item.owner?.displayName ?? "Someone else"} has it. Take it over first if they cannot finish it.`);
  }
  if (!item.ownerUserId && !worksIt(session.activeRole, item.ownerRole)) {
    return refused(item.ownerRole ? `That task belongs to ${departmentOfRole(item.ownerRole).label}.` : "That task is not yours to close.");
  }
  const now = new Date();
  const assignment = item.assignmentId ? await db.assignment.findUnique({ where: { id: item.assignmentId }, select: { state: true, endsAt: true } }) : null;
  const live = stillLive(item, assignment, now);
  if (live) return refused(live);
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  // A missed check call closed by hand says what happened: it is the welfare record.
  if (alertKind(item.title) === "missed" && note.length < 3) return refused("Say how the officer was reached, or what was done — this closes a welfare alert.");

  await db.$transaction([
    db.workItem.update({ where: { id: item.id }, data: { state: "done", doneAt: now, ownerUserId: item.ownerUserId ?? session.userId } }),
    db.event.create({
      data: {
        type: "work_item.completed",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: item.ownerRole ? departmentOfRole(item.ownerRole).event : "administration",
        personId: item.personId,
        assignmentId: item.assignmentId,
        requirementId: item.requirementId,
        detail: `${item.title} — done${note ? `: ${note}` : "."}`,
      },
    }),
  ]);
  refresh();
  return ok("Done.");
}
