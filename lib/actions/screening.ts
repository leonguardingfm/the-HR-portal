"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { canSignOff } from "@/lib/bs7858";
import { toCoreScreeningFile } from "@/lib/db/queries";
import { settleFileStatus } from "@/lib/db/screening-status";
import {
  SETTABLE_STATUSES,
  STANDARD_CHECKS,
  fullScreeningBlockers,
  isSignoff,
  limitedScreeningBlockers,
} from "@/lib/core/screening";
import { CHECK_STATUS_LABELS } from "@/lib/labels";
import { reviewIndependence } from "@/lib/policy";
import { validateFileAssignment, type Assignee } from "@/lib/roles";
import { VETTING_SLA_DAYS } from "@/lib/sla";
import type { CheckStatus, Role } from "@/lib/types";
import { refused, ok, type ActionResult } from "./types";

/**
 * Screening file writes: opening a file, assigning its controller, recording
 * progress on a check, and the two controller reviews.
 *
 * Same shape as every other write: guard, re-read, then write with the event
 * in the same transaction. Holding the role is never enough on its own — each
 * action also checks that this person holds the seat on THIS file, and the
 * screening_separation trigger in the database refuses anything that slips
 * past both [6.1, 7.5.2b].
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { session: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) {
    const spec = ACTIONS[action];
    return {
      session,
      error: refused(
        `${spec.what} belongs to ${spec.owner}. You are working as ${session.activeRole.replace(/_/g, " ")}, so the platform refuses it.`,
      ),
    };
  }
  return { session, error: null };
}

const refresh = (fileId: string, candidacyId?: string | null) => {
  revalidatePath("/vetting");
  revalidatePath(`/vetting/${fileId}`);
  if (candidacyId) revalidatePath(`/candidates/${candidacyId}`);
  revalidatePath("/");
};

/** The separation trigger speaks in sentences already; pass them through. */
function separationRefusal(err: unknown): ActionResult | null {
  const msg = err instanceof Error ? err.message : "";
  const m = msg.match(/(An individual may not[^\n"]*|The controller reviewing[^\n"]*)/);
  return m ? refused(m[1]!.trim()) : null;
}

async function assignee(userId: string): Promise<Assignee | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    include: { roles: { where: { revokedAt: null } } },
  });
  return u ? { userId: u.id, personId: u.personId, roles: u.roles.map((r) => r.role as Role) } : null;
}

async function subjectAssignee(personId: string): Promise<Assignee> {
  const u = await db.user.findFirst({ where: { personId }, include: { roles: { where: { revokedAt: null } } } });
  return { userId: u?.id ?? `person:${personId}`, personId, roles: (u?.roles ?? []).map((r) => r.role as Role) };
}

const loadFile = (id: string) =>
  db.screeningFile.findUnique({
    where: { id },
    include: {
      checks: true,
      person: { include: { candidacies: { orderBy: { stageSince: "desc" }, take: 1, select: { id: true } } } },
    },
  });

function fileEvent(
  tx: Prisma.TransactionClient | typeof db,
  session: { userId: string; activeRole: Role },
  file: { id: string; personId: string },
  type: string,
  detail: string,
) {
  return tx.event.create({
    data: {
      type,
      actorUserId: session.userId,
      actorRole: session.activeRole,
      department: "vetting",
      personId: file.personId,
      screeningFileId: file.id,
      detail,
    },
  });
}

/** Re-settle the file's status inside the write, cases and all. */
const settleStatus = (tx: Prisma.TransactionClient, fileId: string) => settleFileStatus(tx, fileId);

// ---------------------------------------------------------------------------
// Opening a file, and who sits in which seat
// ---------------------------------------------------------------------------

export async function openScreeningFile(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("screening.open");
  if (error || !session) return error!;

  const candidacyId = String(formData.get("candidacyId") ?? "");
  const controllerUserId = String(formData.get("controllerUserId") ?? "") || null;

  const c = await db.candidacy.findUnique({
    where: { id: candidacyId },
    include: { person: { include: { screeningFile: { where: { disposedAt: null }, select: { id: true } } } } },
  });
  if (!c) return refused("That candidate no longer exists.");
  if (c.person.screeningFile.length > 0) return refused(`${c.person.fullName} already has a screening file. One file per individual.`);

  const [subject, admin, controller] = await Promise.all([
    subjectAssignee(c.personId),
    assignee(session.userId),
    controllerUserId ? assignee(controllerUserId) : Promise.resolve(null),
  ]);
  if (controllerUserId && !controller?.roles.includes("vetting_controller")) {
    return refused("The controller has to hold the Screening Controller role.");
  }
  const check = validateFileAssignment({ subject, administrator: admin, controller });
  if (!check.permitted) return refused(check.reason!);

  try {
    const file = await db.$transaction(async (tx) => {
      const f = await tx.screeningFile.create({
        data: {
          personId: c.personId,
          administratorUserId: session.userId,
          controllerUserId,
          checks: { create: STANDARD_CHECKS.map((k) => ({ ...k })) },
        },
      });
      await fileEvent(tx, session, f, "screening.file_opened", `Screening file opened for ${c.person.fullName}.`);
      await settleStatus(tx, f.id);
      return f;
    });
    refresh(file.id, c.id);
    return ok(`Screening file opened for ${c.person.fullName}, with you as administrator.`);
  } catch (err) {
    const r = separationRefusal(err);
    if (r) return r;
    throw err;
  }
}

export async function assignController(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("screening.assign");
  if (error || !session) return error!;

  const fileId = String(formData.get("fileId") ?? "");
  const controllerUserId = String(formData.get("controllerUserId") ?? "");
  const f = await loadFile(fileId);
  if (!f) return refused("That file no longer exists.");
  if (f.controllerReview1At) return refused("The controller has already reviewed this file, so the seat stays with them.");
  if (["complete", "withdrawn", "unsuccessful"].includes(f.status)) return refused("This file has ended. It is kept as a record.");
  // The administrator or higher management assigns; a controller may also
  // take an unassigned file themselves.
  const takingItOn =
    session.activeRole === "vetting_controller" && controllerUserId === session.userId && !f.controllerUserId;
  if (f.administratorUserId !== session.userId && session.activeRole !== "top_management" && !takingItOn) {
    return refused("A file's controller is assigned by its administrator or higher management. A controller may take an unassigned file themselves.");
  }

  const [subject, admin, controller] = await Promise.all([
    subjectAssignee(f.personId),
    f.administratorUserId ? assignee(f.administratorUserId) : Promise.resolve(null),
    assignee(controllerUserId),
  ]);
  if (!controller?.roles.includes("vetting_controller")) return refused("The controller has to hold the Screening Controller role.");
  const check = validateFileAssignment({ subject, administrator: admin, controller });
  if (!check.permitted) return refused(check.reason!);

  try {
    const name = (await db.user.findUnique({ where: { id: controllerUserId }, select: { displayName: true } }))?.displayName;
    await db.$transaction([
      db.screeningFile.update({ where: { id: f.id }, data: { controllerUserId } }),
      fileEvent(db, session, f, "screening.controller_assigned", `${name} assigned as controller.`),
    ]);
  } catch (err) {
    const r = separationRefusal(err);
    if (r) return r;
    throw err;
  }
  refresh(f.id, f.person.candidacies[0]?.id);
  return ok("Controller assigned.");
}

// ---------------------------------------------------------------------------
// The administrator's work
// ---------------------------------------------------------------------------

/** Holding the role is not enough: the checks belong to this file's administrator. */
function administratorRefusal(f: { administratorUserId: string | null; status: string; controllerReview2At: Date | null }, userId: string) {
  if (f.administratorUserId !== userId) return refused("Checks on a file are recorded by its administrator.");
  if (f.controllerReview2At) return refused("This file is complete and signed off. It is a record now, not a worksheet.");
  if (f.status === "withdrawn" || f.status === "unsuccessful") {
    return refused("This file has ended. It is kept as a record, not worked on.");
  }
  if (f.status === "controller_review_1" || f.status === "controller_review_2") {
    return refused("The file is with its controller for review. It comes back to you if anything needs changing.");
  }
  return null;
}

export async function updateCheck(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("screening.check");
  if (error || !session) return error!;

  const checkId = String(formData.get("checkId") ?? "");
  const status = String(formData.get("status") ?? "") as CheckStatus;
  const note = String(formData.get("note") ?? "").trim();

  const check = await db.screeningCheck.findUnique({ where: { id: checkId } });
  if (!check) return refused("That check no longer exists.");
  const f = await loadFile(check.fileId);
  if (!f) return refused("That file no longer exists.");
  const blocked = administratorRefusal(f, session.userId);
  if (blocked) return blocked;
  if (isSignoff(check)) return refused("Sign-off checks are recorded by the controller's review, not set by hand.");
  if (check.group === "history" && (check.clause === "7.5.2a" || check.clause === "7.7")) {
    const rows = await db.historyPeriod.count({ where: { fileId: f.id } });
    if (rows > 0) return refused("This check is calculated from the career history below. Work the periods there instead.");
  }
  if (!SETTABLE_STATUSES.includes(status)) return refused("Choose a status.");
  if ((status === "failed" || status === "not_applicable") && !note) {
    return refused(status === "failed" ? "Say what the check found." : "Say why this check does not apply.");
  }
  if (status === check.status && !note) return refused("Nothing has changed.");
  const openFinding = await db.screeningException.findFirst({
    where: { checkId: check.id, kind: "adverse_finding", state: { not: "decided" } },
    select: { id: true },
  });
  if (openFinding) {
    return refused("This check is part of an adverse finding waiting for a decision. It changes when Higher Management decides, not before.");
  }

  const now = new Date();
  const stamp =
    status === "requested"
      ? { firstRequestSentAt: check.firstRequestSentAt ?? now }
      : status === "chased"
        ? { firstRequestSentAt: check.firstRequestSentAt ?? now, secondRequestSentAt: now }
        : status === "verified"
          ? { confirmedAt: now }
          : {};
  const notes = note
    ? `${check.notes ? `${check.notes}\n` : ""}${now.toISOString().slice(0, 10)}: ${note}`
    : check.notes;

  await db.$transaction(async (tx) => {
    await tx.screeningCheck.update({
      where: { id: check.id },
      data: {
        status,
        ...stamp,
        ...(status !== "verified" ? { confirmedAt: null } : {}),
        ownerUserId: session.userId,
        notes,
      },
    });
    await fileEvent(
      tx,
      session,
      f,
      "screening.check_updated",
      `${check.label}: ${CHECK_STATUS_LABELS[status].toLowerCase()}${note ? ` — ${note}` : ""}.`,
    );
    // A failed check is an adverse finding. It pauses the file, and the
    // individual is invited to make representation before anyone decides
    // [7.4f]. Nothing clears it but Higher Management's decision.
    if (status === "failed") {
      await tx.screeningException.create({
        data: {
          fileId: f.id,
          kind: "adverse_finding",
          state: "awaiting_representation",
          checkId: check.id,
          detail: `${check.label}: ${note}`,
          raisedById: session.userId,
          representationInvitedAt: now,
        },
      });
      await fileEvent(
        tx,
        session,
        f,
        "screening.exception_raised",
        `Adverse finding raised from "${check.label}". Representation invited (7.4f).`,
      );
    }
    await settleStatus(tx, f.id);
  });
  refresh(f.id, f.person.candidacies[0]?.id);
  return ok(
    status === "failed"
      ? "Recorded as failed. An adverse finding has been opened and the file is paused until it is decided."
      : `${CHECK_STATUS_LABELS[status]}.`,
  );
}

/**
 * The unverified days and gaps over 31 days across the screening period
 * [7.7]. Entered by the administrator until the per-employer history rows
 * exist to derive them.
 */
export async function updateHistoryFigures(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("screening.check");
  if (error || !session) return error!;

  const fileId = String(formData.get("fileId") ?? "");
  const unverifiedDays = Number(formData.get("unverifiedDays"));
  const gapsOver31Days = Number(formData.get("gapsOver31Days"));
  const f = await loadFile(fileId);
  if (!f) return refused("That file no longer exists.");
  const blocked = administratorRefusal(f, session.userId);
  if (blocked) return blocked;
  if (await db.historyPeriod.count({ where: { fileId: f.id } })) {
    return refused("This file has a career history, so these figures are calculated from it, not typed.");
  }
  if (![unverifiedDays, gapsOver31Days].every((n) => Number.isInteger(n) && n >= 0 && n < 5000)) {
    return refused("Give whole numbers of days and gaps, zero or more.");
  }

  await db.$transaction(async (tx) => {
    await tx.screeningFile.update({ where: { id: f.id }, data: { unverifiedDays, gapsOver31Days } });
    await fileEvent(
      tx,
      session,
      f,
      "screening.history_updated",
      `History: ${unverifiedDays} unverified days, ${gapsOver31Days} gap(s) over 31 days.`,
    );
    await settleStatus(tx, f.id);
  });
  refresh(f.id, f.person.candidacies[0]?.id);
  return ok("History figures saved.");
}

export async function submitForReview(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("screening.check");
  if (error || !session) return error!;

  const fileId = String(formData.get("fileId") ?? "");
  const f = await loadFile(fileId);
  if (!f) return refused("That file no longer exists.");
  const blocked = administratorRefusal(f, session.userId);
  if (blocked) return blocked;
  if (!f.controllerUserId) return refused("Assign a controller first. A file cannot be reviewed by the person who built it.");
  if (f.status === "adverse_finding" || f.status === "risk_acceptance_required") {
    return refused("A finding on this file is waiting for Higher Management's decision. The file goes to review once it is decided.");
  }
  if (f.status === "time_expired") return refused("The screening period has run out (7.6). The file cannot be put forward for review.");

  const core = toCoreScreeningFile(f, f.personId);
  const which = f.controllerReview1At ? "full" : "limited";
  const blockers = which === "limited" ? limitedScreeningBlockers(core) : fullScreeningBlockers(core);
  if (blockers.length) return refused(`Not ready for review: ${blockers[0]}`);

  const status = which === "limited" ? "controller_review_1" : "controller_review_2";
  const sla = VETTING_SLA_DAYS[status] ?? 2;
  await db.$transaction([
    db.screeningFile.update({ where: { id: f.id }, data: { status } }),
    // The review lands in the controller's own queue, so it is somebody's
    // work rather than a status someone has to notice.
    db.workItem.create({
      data: {
        title: `Review ${which === "limited" ? "limited screening" : "the completed file"}: ${f.person.fullName}`,
        screeningFileId: f.id,
        ownerUserId: f.controllerUserId,
        ownerRole: "vetting_controller",
        dueAt: new Date(Date.now() + sla * 86_400_000),
        slaDays: sla,
      },
    }),
    fileEvent(
      db,
      session,
      f,
      "screening.submitted",
      which === "limited" ? "Submitted for review of limited screening." : "Submitted for review of the completed file.",
    ),
  ]);
  refresh(f.id, f.person.candidacies[0]?.id);
  return ok("Sent to the controller for review.");
}

// ---------------------------------------------------------------------------
// The controller's review
// ---------------------------------------------------------------------------

export async function reviewFile(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("screening.review");
  if (error || !session) return error!;

  const fileId = String(formData.get("fileId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  const f = await db.screeningFile.findUnique({
    where: { id: fileId },
    include: {
      checks: true,
      person: {
        include: {
          candidacies: { orderBy: { stageSince: "desc" }, take: 1, include: { interviews: true } },
        },
      },
    },
  });
  if (!f) return refused("That file no longer exists.");
  if (f.controllerUserId !== session.userId) return refused("A file is reviewed by the controller assigned to it.");
  if (f.status !== "controller_review_1" && f.status !== "controller_review_2") {
    return refused("This file has not been submitted for review.");
  }
  const reviewer = await db.user.findUniqueOrThrow({ where: { id: session.userId }, select: { personId: true } });
  const sep = canSignOff({
    reviewerUserId: session.userId,
    reviewerPersonId: reviewer.personId,
    subjectPersonId: f.personId,
    administratorUserId: f.administratorUserId,
  });
  if (!sep.permitted) return refused(sep.reason!);
  if (decision !== "confirm" && decision !== "return") return refused("Confirm the file or return it.");
  if (decision === "return" && note.length < 5) return refused("Say what needs doing before it comes back.");

  const limited = f.status === "controller_review_1";
  const now = new Date();
  // Division of functions [6.1]: permitted, but recorded, where the controller
  // also interviewed the candidate.
  const independence = reviewIndependence({
    controllerUserId: session.userId,
    interviewerUserIds: (f.person.candidacies[0]?.interviews ?? []).map((i) => i.interviewerUserId).filter(Boolean) as string[],
  });

  await db.$transaction(async (tx) => {
    if (decision === "confirm") {
      const signoff = f.checks.find((c) => isSignoff(c) && c.clause === (limited ? "7.5.2b" : "7.7"));
      if (signoff) {
        await tx.screeningCheck.update({
          where: { id: signoff.id },
          data: { status: "verified", confirmedAt: now, ownerUserId: session.userId, notes: note || signoff.notes },
        });
      }
      await tx.screeningFile.update({
        where: { id: f.id },
        data: limited
          ? { controllerReview1At: now, status: "full_screening_in_progress" }
          : { controllerReview2At: now, completedAt: now, status: "complete" },
      });
    } else {
      // Back to the administrator: the status falls to wherever the checks say.
      await tx.screeningFile.update({ where: { id: f.id }, data: { status: "not_started" } });
    }
    await tx.workItem.updateMany({
      where: { screeningFileId: f.id, state: { in: ["open", "blocked"] }, ownerRole: "vetting_controller" },
      data: { state: "done", doneAt: now },
    });
    await fileEvent(
      tx,
      session,
      f,
      decision === "confirm" ? "screening.reviewed" : "screening.returned",
      decision === "confirm"
        ? `${limited ? "Limited screening" : "Completed file"} reviewed and confirmed${note ? ` — ${note}` : ""}.${independence.warning ? ` ${independence.warning}.` : ""}`
        : `Returned to the administrator: ${note}`,
    );
    await settleStatus(tx, f.id);
  });

  refresh(f.id, f.person.candidacies[0]?.id);
  return ok(
    decision === "return"
      ? "Returned to the administrator."
      : limited
        ? "Limited screening confirmed. The conditional offer is no longer blocked on the file."
        : "Full screening confirmed. Confirmed employment is permitted.",
  );
}
