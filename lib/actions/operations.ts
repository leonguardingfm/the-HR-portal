"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { evaluateDeployability, canPublishAssignment } from "@/lib/core/deployability";
import { getDeployabilityInputs } from "@/lib/db/queries";
import { RETENTION } from "@/lib/bs7858";
import { refused, ok, type ActionResult } from "./types";
import type { ContactChannel } from "@/lib/core/types";

/**
 * Every write in the platform goes through here.
 *
 * The shape is the same each time, and the order matters:
 *
 *   1. Who is this? No session, no write.
 *   2. May this role do this? The check is here, on the server, because a
 *      button hidden in a browser is not a permission — it is a suggestion.
 *   3. Is the thing still true? Re-read the state rather than trusting what the
 *      page was showing when it rendered.
 *   4. Write, and write the event in the same transaction, so the audit trail
 *      cannot disagree with what happened.
 *
 * Step 4 is why these are not thin wrappers: the event is not logging, it is
 * the record the KPIs and the audit trail are queries over.
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

const refreshOps = () => {
  revalidatePath("/");
  revalidatePath("/live");
  revalidatePath("/scheduling");
  revalidatePath("/compliance");
};

// ---------------------------------------------------------------------------
// Live operations
// ---------------------------------------------------------------------------

export async function recordCheckCall(
  assignmentId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("check_call.record");
  if (error || !session) return error!;

  const channel = (String(formData.get("channel") ?? "phone") || "phone") as ContactChannel;
  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    include: { person: true, post: { include: { site: true } }, bookOn: true },
  });
  if (!assignment) return refused("That shift no longer exists.");
  if (!assignment.bookOn) {
    return refused("No check call is expected until the officer has booked on.");
  }

  await db.$transaction([
    db.checkCall.create({
      data: { assignmentId, at: new Date(), channel, allWell: true, takenByUserId: session.userId },
    }),
    db.event.create({
      data: {
        type: "check_call.recorded",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        assignmentId,
        personId: assignment.personId,
        detail: `All well. ${assignment.post.site.name} — ${assignment.post.name}.`,
      },
    }),
  ]);

  refreshOps();
  return ok(`Check call recorded for ${assignment.person.fullName}. The clock restarts.`);
}

export async function logContactAttempt(
  assignmentId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("contact_attempt.log");
  if (error || !session) return error!;

  const channel = (String(formData.get("channel") ?? "phone") || "phone") as ContactChannel;
  const note = String(formData.get("note") ?? "") || null;
  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    include: { person: true },
  });
  if (!assignment) return refused("That shift no longer exists.");

  await db.$transaction([
    db.contactAttempt.create({
      data: { assignmentId, byUserId: session.userId, channel, reached: false, note },
    }),
    db.event.create({
      data: {
        type: "contact_attempt.failed",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        assignmentId,
        personId: assignment.personId,
        detail: `${channel.replace(/_/g, " ")} tried, no answer. The escalation advances a step.`,
      },
    }),
  ]);

  refreshOps();
  return ok(
    `Attempt logged as failed. ${assignment.person.fullName}'s escalation has advanced a step — that is what moves it, not a timer.`,
  );
}

export async function recordBookOn(
  assignmentId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("book_on.record");
  if (error || !session) return error!;

  const channel = (String(formData.get("channel") ?? "site_phone") || "site_phone") as ContactChannel;
  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    include: { person: true, bookOn: true, post: { include: { site: true } } },
  });
  if (!assignment) return refused("That shift no longer exists.");
  if (assignment.bookOn) return refused("That officer is already booked on.");
  if (assignment.state === "draft") {
    return refused("That shift has not been published, so nobody can book on to it.");
  }

  await db.$transaction([
    db.bookOn.create({ data: { assignmentId, at: new Date(), channel, recordedByUserId: session.userId } }),
    db.event.create({
      data: {
        type: "book_on.recorded",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        assignmentId,
        personId: assignment.personId,
        detail: `Booked on at ${assignment.post.site.name} via ${channel.replace(/_/g, " ")}.`,
      },
    }),
  ]);

  refreshOps();
  return ok(`${assignment.person.fullName} booked on. The check-call clock starts from here.`);
}

export async function notifyClient(
  incidentId: string,
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("incident.notify_client");
  if (error || !session) return error!;

  const incident = await db.incident.findUnique({ where: { id: incidentId } });
  if (!incident) return refused("That incident no longer exists.");
  if (incident.clientNotified) return refused("The client has already been notified.");

  await db.$transaction([
    db.incident.update({
      where: { id: incidentId },
      data: { clientNotified: true, clientNotifiedAt: new Date() },
    }),
    db.event.create({
      data: {
        type: "incident.client_notified",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "operations",
        assignmentId: incident.assignmentId,
        detail: "Client notified of the incident, and the time recorded.",
      },
    }),
  ]);

  refreshOps();
  return ok("Client notified, and the time recorded. That record is what a client and an insurer both ask for.");
}

// ---------------------------------------------------------------------------
// Scheduling — the choke point
// ---------------------------------------------------------------------------

export async function publishAssignment(
  assignmentId: string,
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("assignment.publish");
  if (error || !session) return error!;

  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    include: { person: true, post: true },
  });
  if (!assignment) return refused("That shift no longer exists.");
  if (assignment.state !== "draft") return refused("That shift is already published.");

  // The deployability check runs HERE, on the server, against the state as it
  // is now — not against whatever the page was showing when it rendered.
  const inputs = await getDeployabilityInputs();
  const known = inputs.get(assignment.personId);
  const deployability = evaluateDeployability(
    known
      ? { ...known.input, postRequiresSiaLicence: assignment.post.requiresSiaLicence }
      : {
          deploymentGatePassed: false,
          screeningClockExpired: false,
          suspended: false,
          postRequiresSiaLicence: assignment.post.requiresSiaLicence,
          siaLicenceExpiry: null,
          rightToWorkExpiry: null,
        },
  );
  const check = canPublishAssignment(deployability);
  if (!check.allowed) {
    return refused(
      `Refused: ${check.reason}. This is the choke point — it is not a warning you can click past.`,
    );
  }

  await db.$transaction([
    db.assignment.update({
      where: { id: assignmentId },
      data: {
        state: "published",
        publishedAt: new Date(),
        publishedById: session.userId,
        publishCheckNote: deployability.warnings.length
          ? `Passed with warnings: ${deployability.warnings.map((w) => w.label).join("; ")}`
          : "Passed with no warnings",
      },
    }),
    db.event.create({
      data: {
        type: "assignment.published",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        assignmentId,
        personId: assignment.personId,
        detail: `${assignment.post.name} published after the deployability check passed.`,
      },
    }),
  ]);

  refreshOps();
  return ok(`Published. The check passed and the result is recorded against the shift.`);
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export async function verifyDocument(
  documentId: string,
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("document.verify");
  if (error || !session) return error!;

  const doc = await db.documentRecord.findUnique({
    where: { id: documentId },
    include: { type: true, person: true },
  });
  if (!doc) return refused("That document no longer exists.");

  await db.$transaction([
    db.documentRecord.update({
      where: { id: documentId },
      data: { verification: "verified", verifiedAt: new Date(), verifiedById: session.userId },
    }),
    db.reminder.updateMany({
      where: { documentId, state: "pending" },
      data: { state: "cancelled", cancelledAt: new Date(), cancelledReason: "The document arrived" },
    }),
    db.event.create({
      data: {
        type: "document.verified",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "vetting",
        documentId,
        personId: doc.personId,
        detail: `${doc.type.label} verified. Any chaser sequence for it cancels itself.`,
      },
    }),
  ]);

  revalidatePath("/compliance");
  revalidatePath("/");
  return ok(`${doc.type.label} verified. Its chaser sequence has cancelled itself.`);
}

export async function renewDocument(
  documentId: string,
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("document.renew");
  if (error || !session) return error!;

  const doc = await db.documentRecord.findUnique({
    where: { id: documentId },
    include: { type: true },
  });
  if (!doc) return refused("That document no longer exists.");
  if (!doc.type.expires) return refused(`A ${doc.type.label.toLowerCase()} has no expiry to renew.`);

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  await db.$transaction([
    db.documentRecord.update({
      where: { id: documentId },
      data: { verification: "verified", verifiedAt: new Date(), verifiedById: session.userId, expiresAt },
    }),
    db.reminder.updateMany({
      where: { documentId, state: "pending" },
      data: { state: "cancelled", cancelledAt: new Date(), cancelledReason: "Renewed" },
    }),
    db.event.create({
      data: {
        type: "document.renewed",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "compliance",
        documentId,
        personId: doc.personId,
        detail: `${doc.type.label} renewed to ${expiresAt.toISOString().slice(0, 10)}.`,
      },
    }),
  ]);

  revalidatePath("/compliance");
  revalidatePath("/scheduling");
  revalidatePath("/");
  return ok(`${doc.type.label} renewed. Any deployment block from it clears, and its reminders cancel.`);
}

/**
 * Run a retention disposal.
 *
 * Writes the record first and destroys second in the live system; here it
 * writes the record, which is the half that gets missed. The entry cannot
 * afterwards be edited or deleted — the database refuses it.
 */
export async function runDisposal(
  subject: { kind: "candidacy" | "employment"; id: string; description: string },
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("disposal.run");
  if (error || !session) return error!;

  const rule = subject.kind === "candidacy" ? "unsuccessful_applicant_12_months" : "after_cessation_7_years";

  await db.$transaction([
    db.disposalRecord.create({
      data: {
        rule,
        subjectDescription: subject.description,
        itemsDestroyed: 1,
        retainedInstead:
          subject.kind === "candidacy"
            ? "Outcome and date only, per the criminality document rule"
            : null,
        performedByUserId: session.userId,
      },
    }),
    db.event.create({
      data: {
        type: "disposal.recorded",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "administration",
        detail: `Records destroyed under the ${
          rule === "unsuccessful_applicant_12_months"
            ? `${RETENTION.unsuccessfulApplicantMonths}-month`
            : `${RETENTION.afterCessationYears}-year`
        } rule, and written to the disposal log.`,
      },
    }),
  ]);

  revalidatePath("/compliance");
  return ok("Disposal recorded. The entry cannot be edited or deleted — that is the point of it.");
}

// ---------------------------------------------------------------------------
// Work
// ---------------------------------------------------------------------------

export async function completeWorkItem(
  workItemId: string,
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("work_item.complete");
  if (error || !session) return error!;

  const item = await db.workItem.findUnique({ where: { id: workItemId } });
  if (!item) return refused("That task no longer exists.");
  if (item.state === "done") return refused("That task is already closed.");
  // Holding the role is not enough: a task is closed by the person it is
  // assigned to, or it is not a queue.
  if (item.ownerUserId && item.ownerUserId !== session.userId) {
    return refused("That task is assigned to someone else. A task is closed by the person it belongs to.");
  }

  await db.$transaction([
    db.workItem.update({ where: { id: workItemId }, data: { state: "done", doneAt: new Date() } }),
    db.event.create({
      data: {
        type: "work_item.completed",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "administration",
        personId: item.personId,
        detail: `${item.title} — completed.`,
      },
    }),
  ]);

  revalidatePath("/tasks");
  revalidatePath("/");
  return ok("Task closed.");
}
