"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import {
  ADMIN_DEPARTMENT,
  PRIORITIES,
  approvalChain,
  canApproveStep,
  canTransition,
  formatPence,
  isFullyApproved,
  nextStep,
  thresholdsFrom,
  type AdminCategoryId,
  type AdminPriority,
  type AdminRequestKind,
} from "@/lib/core/admin";
import { actingNote } from "@/lib/auth/delegation";
import { getEffectiveRoles } from "@/lib/db/roles";
import { refused, ok, type ActionResult } from "./types";
import type { Role } from "@/lib/types";

/**
 * Every Admin write goes through here, and every one has the same shape:
 *
 *   1. Who is this? No session, no write.
 *   2. May this role do this at all? Checked on the server, because a button
 *      hidden in a browser is a suggestion, not a permission.
 *   3. Is the thing still true? Re-read the item rather than trusting what the
 *      page was showing when it rendered — an approval is exactly the case
 *      where two people are looking at the same screen at once.
 *   4. Write, and write the event in the same transaction.
 *
 * On top of that, approvals are checked three times over, deliberately: the
 * role matrix here, the chain rules in lib/core/admin.ts, and the triggers in
 * the database. The third is the one that survives a bug in the first two.
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) {
    return { session: null, error: refused("Your session has ended. Sign in again.") };
  }
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

const refreshAdmin = () => {
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/admin");
  revalidatePath("/admin/requests");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/premises");
  revalidatePath("/admin/people");
  revalidatePath("/admin/decisions");
  revalidatePath("/admin/uniform");
  revalidatePath("/admin/accreditations");
  revalidatePath("/reports");
};

/** The thresholds as they stand right now. Read, never assumed. */
async function currentThresholds() {
  const rows = await db.setting.findMany({
    where: { key: { startsWith: "admin.approval." } },
  });
  return thresholdsFrom(Object.fromEntries(rows.map((r) => [r.key, r.value])));
}

/**
 * References are allocated, not typed. A sequence would be neater but would
 * also hand out numbers for transactions that roll back; counting what exists
 * inside the transaction keeps them contiguous, which is what makes a
 * reference worth quoting on a supplier's invoice.
 */
async function nextReference(tx: { adminItem: { count: () => Promise<number> } }) {
  const n = await tx.adminItem.count();
  return `ADM-${String(n + 1).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Raising
// ---------------------------------------------------------------------------

export async function raiseAdminItem(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("admin_item.raise");
  if (error || !session) return error!;

  const track = String(formData.get("track") ?? "task") === "request" ? "request" : "task";
  const category = String(formData.get("category") ?? "") as AdminCategoryId;
  const title = String(formData.get("title") ?? "").trim();
  const detail = String(formData.get("detail") ?? "").trim() || null;
  const priority = (String(formData.get("priority") ?? "P3") || "P3") as AdminPriority;
  const kindRaw = String(formData.get("kind") ?? "").trim();
  const amountRaw = String(formData.get("amountPounds") ?? "").trim();
  const aboutPersonId = String(formData.get("aboutPersonId") ?? "").trim() || null;

  if (!title) return refused("Give the item a title — something the person picking it up can act on.");
  if (!PRIORITIES[priority]) return refused("That priority does not exist.");

  const kind = track === "request" ? (kindRaw as AdminRequestKind) : null;
  if (track === "request" && !kind) {
    return refused("A request has to say what it is asking for.");
  }

  // Money in pence, from pounds typed by a person. Rounded once, here, so two
  // screens cannot disagree about a half-penny.
  let amountPence: number | null = null;
  if (amountRaw) {
    const pounds = Number(amountRaw.replace(/[£,\s]/g, ""));
    if (!Number.isFinite(pounds) || pounds < 0) return refused("That amount is not a number.");
    amountPence = Math.round(pounds * 100);
  }

  const target = PRIORITIES[priority].targetHours;
  const raisedAt = new Date();
  const dueAt = new Date(raisedAt.getTime() + target * 3_600_000);

  const thresholds = await currentThresholds();
  const chain =
    track === "request"
      ? approvalChain({ kind: kind!, amountPence, aboutPersonId }, thresholds)
      : [];

  const created = await db.$transaction(async (tx) => {
    const reference = await nextReference(tx as never);

    const item = await tx.adminItem.create({
      data: {
        reference,
        track,
        category,
        kind,
        title,
        detail,
        priority,
        amountPence,
        aboutPersonId,
        requestedByUserId: session.userId,
        raisedAt,
        dueAt,
        // The chain is written out now, so the approvals a request needed are a
        // record rather than a recalculation. Change the thresholds next year
        // and this request still shows the ladder it actually climbed.
        approvals: {
          create: chain.map((step) => ({
            step: step.step,
            requiredRoles: step.anyOf as Role[],
            reason: step.reason,
          })),
        },
      },
    });

    // It goes into the one queue, not an Admin list of its own.
    await tx.workItem.create({
      data: {
        title: `${reference} — ${title}`,
        adminItemId: item.id,
        ownerRole: "admin_manager",
        dueAt,
        slaDays: Math.max(1, Math.round(target / 24)),
      },
    });

    await tx.event.create({
      data: {
        type: track === "request" ? "admin_request.raised" : "admin_task.raised",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: ADMIN_DEPARTMENT,
        adminItemId: item.id,
        personId: aboutPersonId,
        detail:
          `${reference}: ${title}. ${PRIORITIES[priority].label}.` +
          (amountPence ? ` ${formatPence(amountPence)}.` : "") +
          (chain.length ? ` ${chain.length} approval(s) needed.` : ""),
      },
    });

    return item;
  });

  refreshAdmin();
  return ok(
    chain.length > 0
      ? `${created.reference} raised. Waiting on ${chain.length} approval${chain.length > 1 ? "s" : ""}: ${chain[0].reason}`
      : `${created.reference} raised, due ${PRIORITIES[priority].label.toLowerCase()}.`,
  );
}

// ---------------------------------------------------------------------------
// Moving it along
// ---------------------------------------------------------------------------

/** Shared by the state-changing actions: read the item, check the move. */
async function loadForTransition(itemId: string, to: string) {
  const item = await db.adminItem.findUnique({
    where: { id: itemId },
    include: { approvals: { orderBy: { step: "asc" } } },
  });
  if (!item) return { item: null, error: refused("That item no longer exists.") };
  if (!canTransition(item.track, item.state, to)) {
    return {
      item,
      error: refused(
        `${item.reference} is ${item.state.replace(/_/g, " ")}, so it cannot move to ${to.replace(/_/g, " ")}.`,
      ),
    };
  }
  return { item, error: null };
}

export async function assignAdminItem(
  itemId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("admin_item.assign");
  if (error || !session) return error!;

  const toUserId = String(formData.get("assignedToUserId") ?? "").trim();
  if (!toUserId) return refused("Say who it is going to.");

  const { item, error: moveError } = await loadForTransition(itemId, "assigned");
  if (moveError || !item) return moveError!;

  const assignee = await db.user.findUnique({
    where: { id: toUserId },
    include: { roles: { where: { revokedAt: null } } },
  });
  if (!assignee || !assignee.active) {
    return refused("That person is not an active user of the portal.");
  }

  await db.$transaction([
    db.adminItem.update({
      where: { id: item.id },
      data: { state: "assigned", assignedToUserId: toUserId },
    }),
    db.workItem.updateMany({
      where: { adminItemId: item.id, state: "open" },
      data: { ownerUserId: toUserId },
    }),
    db.event.create({
      data: {
        type: "admin_item.assigned",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: ADMIN_DEPARTMENT,
        adminItemId: item.id,
        detail: `${item.reference} assigned to ${assignee.displayName}.`,
      },
    }),
  ]);

  refreshAdmin();
  return ok(`${item.reference} is now ${assignee.displayName}'s.`);
}

export async function startAdminItem(
  itemId: string,
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("admin_item.start");
  if (error || !session) return error!;

  const { item, error: moveError } = await loadForTransition(itemId, "in_progress");
  if (moveError || !item) return moveError!;

  await db.$transaction([
    db.adminItem.update({
      where: { id: item.id },
      data: { state: "in_progress", startedAt: new Date() },
    }),
    db.event.create({
      data: {
        type: "admin_item.started",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: ADMIN_DEPARTMENT,
        adminItemId: item.id,
        detail: `${item.reference} started.`,
      },
    }),
  ]);

  refreshAdmin();
  return ok(`${item.reference} is in progress.`);
}

/**
 * Review is where a request is checked and costed, and it is the point at which
 * the amount can still change. Once the chain starts signing, the figure is
 * what was approved.
 */
export async function reviewAdminRequest(
  itemId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("admin_item.review");
  if (error || !session) return error!;

  const { item, error: moveError } = await loadForTransition(itemId, "reviewed");
  if (moveError || !item) return moveError!;
  if (item.track !== "request") return refused("Only a request goes through review.");

  const amountRaw = String(formData.get("amountPounds") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;

  let amountPence = item.amountPence;
  if (amountRaw) {
    const pounds = Number(amountRaw.replace(/[£,\s]/g, ""));
    if (!Number.isFinite(pounds) || pounds < 0) return refused("That amount is not a number.");
    amountPence = Math.round(pounds * 100);
  }

  const thresholds = await currentThresholds();
  const chain = approvalChain(
    { kind: item.kind as AdminRequestKind, amountPence, aboutPersonId: item.aboutPersonId },
    thresholds,
  );

  const alreadySigned = item.approvals.some((a) => a.decision !== null);
  if (alreadySigned && amountPence !== item.amountPence) {
    return refused(
      "Someone has already approved a step, so the amount cannot change. Cancel this request and raise a new one.",
    );
  }

  await db.$transaction(async (tx) => {
    // Re-costing can move the request onto a different rung of the ladder, so
    // the chain is rewritten to match. Only ever while nothing is signed.
    if (!alreadySigned) {
      await tx.adminApproval.deleteMany({ where: { itemId: item.id } });
      await tx.adminApproval.createMany({
        data: chain.map((step) => ({
          itemId: item.id,
          step: step.step,
          requiredRoles: step.anyOf as Role[],
          reason: step.reason,
        })),
      });
    }

    await tx.adminItem.update({
      where: { id: item.id },
      data: { state: "reviewed", amountPence, reviewedAt: new Date(), detail: note ?? item.detail },
    });

    await tx.event.create({
      data: {
        type: "admin_request.reviewed",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: ADMIN_DEPARTMENT,
        adminItemId: item.id,
        detail:
          `${item.reference} reviewed.` +
          (amountPence ? ` Costed at ${formatPence(amountPence)}.` : "") +
          ` Needs: ${chain.map((c) => c.anyOf.join("/")).join(", ")}.`,
      },
    });
  });

  refreshAdmin();
  return ok(
    `${item.reference} reviewed. Next: ${chain[0]?.reason ?? "nothing outstanding."}`,
  );
}

// ---------------------------------------------------------------------------
// Deciding
// ---------------------------------------------------------------------------

/**
 * Approve the next outstanding rung.
 *
 * The rung is chosen here rather than passed in from the page. A page that
 * names the step it is approving is a page that can be replayed to approve a
 * rung twice; the server reads which rung is actually outstanding.
 */
export async function approveAdminRequest(
  itemId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("admin_item.approve");
  if (error || !session) return error!;

  const grounds = String(formData.get("grounds") ?? "").trim() || null;

  const item = await db.adminItem.findUnique({
    where: { id: itemId },
    include: { approvals: { orderBy: { step: "asc" } } },
  });
  if (!item) return refused("That request no longer exists.");
  if (item.track !== "request") return refused("A task does not need approving — it needs doing.");
  if (item.state === "rejected") return refused(`${item.reference} was rejected. Raise a new request.`);
  if (!["reviewed", "assigned", "raised"].includes(item.state) && item.state !== "approved") {
    return refused(`${item.reference} is ${item.state.replace(/_/g, " ")} and is not waiting on an approval.`);
  }

  const chain = item.approvals.map((a) => ({
    step: a.step,
    anyOf: a.requiredRoles as Role[],
    reason: a.reason,
  }));
  const satisfied = item.approvals.filter((a) => a.decision === "approved").map((a) => a.step);
  const step = nextStep(chain, satisfied);
  if (!step) return refused(`${item.reference} is already fully approved.`);

  // Resolved now, not read from the cookie: a role lent to cover somebody's
  // leave counts, and one that expired this morning does not.
  const me = await getEffectiveRoles(session.userId);
  if (!me) return refused("Your user record could not be read.");

  // The rung rules: the right role, not the requester, not the subject, and
  // not somebody who has already signed a different rung of this chain. A
  // delegation changes none of them — the deputy is a different person, which
  // is exactly why "one person, one rung" keeps working.
  const check = canApproveStep({
    requirement: step,
    approver: { userId: me.userId, personId: me.personId, roles: me.all },
    requestedByUserId: item.requestedByUserId,
    aboutPersonId: item.aboutPersonId,
    alreadyApprovedByUserIds: item.approvals
      .map((a) => a.decidedByUserId)
      .filter((id): id is string => id !== null),
  });
  if (!check.permitted) return refused(check.reason!);

  // Approving on the active role, not on every role the person holds: someone
  // who holds two roles should have to be working as the one that signs.
  if (!step.anyOf.includes(session.activeRole)) {
    return refused(
      `This step needs ${step.anyOf.join(" or ").replace(/_/g, " ")}. You hold it, but you are working as ${session.activeRole.replace(/_/g, " ")} — switch role and approve it as the role that signs.`,
    );
  }

  const thresholds = await currentThresholds();
  const overHigh = (item.amountPence ?? 0) > thresholds.highPence;
  if (overHigh && !grounds) {
    return refused(
      `Over ${formatPence(thresholds.highPence)}, an approval has to say why. Add your grounds.`,
    );
  }

  const nowFullyApproved = isFullyApproved(chain, [...satisfied, step.step]);
  const borrowed = actingNote(session.activeRole, me.delegated);

  await db.$transaction(async (tx) => {
    await tx.adminApproval.update({
      where: { itemId_step: { itemId: item.id, step: step.step } },
      data: {
        decision: "approved",
        decidedByUserId: session.userId,
        decidedByRole: session.activeRole,
        decidedAt: new Date(),
        grounds,
        amountApprovedPence: item.amountPence,
      },
    });

    if (nowFullyApproved) {
      // The database refuses this update while any rung is outstanding, which
      // is what makes "nothing auto-approves" true rather than intended.
      await tx.adminItem.update({
        where: { id: item.id },
        data: { state: "approved", decidedAt: new Date() },
      });
    }

    await tx.event.create({
      data: {
        type: nowFullyApproved ? "admin_request.approved" : "admin_request.step_approved",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: ADMIN_DEPARTMENT,
        adminItemId: item.id,
        personId: item.aboutPersonId,
        detail:
          `${item.reference} step ${step.step} of ${chain.length} approved as ${session.activeRole}` +
          // "Approved as Finance Officer" is not the whole truth when the role
          // was borrowed. The log says whose it was and until when.
          (borrowed ? ` (${borrowed})` : "") +
          "." +
          (item.amountPence ? ` ${formatPence(item.amountPence)}.` : "") +
          (grounds ? ` Grounds: ${grounds}` : ""),
      },
    });
  });

  refreshAdmin();
  return ok(
    nowFullyApproved
      ? `${item.reference} is fully approved and can be actioned.`
      : `Step ${step.step} approved. ${chain.length - satisfied.length - 1} still to go: ${nextStep(chain, [...satisfied, step.step])?.reason}`,
  );
}

export async function rejectAdminRequest(
  itemId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("admin_item.reject");
  if (error || !session) return error!;

  const grounds = String(formData.get("grounds") ?? "").trim();
  if (!grounds) return refused("A rejection has to say why. The person who asked needs to know.");

  const item = await db.adminItem.findUnique({
    where: { id: itemId },
    include: { approvals: { orderBy: { step: "asc" } } },
  });
  if (!item) return refused("That request no longer exists.");
  if (item.track !== "request") return refused("A task cannot be rejected. Cancel it instead.");
  if (item.state === "rejected") return refused(`${item.reference} is already rejected.`);
  if (item.state === "completed") return refused(`${item.reference} is already done.`);

  const chain = item.approvals.map((a) => ({
    step: a.step,
    anyOf: a.requiredRoles as Role[],
    reason: a.reason,
  }));
  const satisfied = item.approvals.filter((a) => a.decision === "approved").map((a) => a.step);
  const step = nextStep(chain, satisfied);
  if (!step) return refused(`${item.reference} is fully approved; there is nothing left to reject.`);

  const me = await getEffectiveRoles(session.userId);
  if (!me) return refused("Your user record could not be read.");

  const check = canApproveStep({
    requirement: step,
    approver: { userId: me.userId, personId: me.personId, roles: me.all },
    requestedByUserId: item.requestedByUserId,
    aboutPersonId: item.aboutPersonId,
    alreadyApprovedByUserIds: item.approvals
      .map((a) => a.decidedByUserId)
      .filter((id): id is string => id !== null),
  });
  if (!check.permitted) return refused(check.reason!);
  if (!step.anyOf.includes(session.activeRole)) {
    return refused(
      `This step needs ${step.anyOf.join(" or ").replace(/_/g, " ")}. Switch role to decide it.`,
    );
  }

  await db.$transaction([
    db.adminApproval.update({
      where: { itemId_step: { itemId: item.id, step: step.step } },
      data: {
        decision: "rejected",
        decidedByUserId: session.userId,
        decidedByRole: session.activeRole,
        decidedAt: new Date(),
        grounds,
      },
    }),
    db.adminItem.update({
      where: { id: item.id },
      data: { state: "rejected", decidedAt: new Date() },
    }),
    // The queue entry closes, because nothing is waiting on anyone any more.
    db.workItem.updateMany({
      where: { adminItemId: item.id, state: "open" },
      data: { state: "cancelled", doneAt: new Date() },
    }),
    db.event.create({
      data: {
        type: "admin_request.rejected",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: ADMIN_DEPARTMENT,
        adminItemId: item.id,
        personId: item.aboutPersonId,
        detail:
          `${item.reference} rejected at step ${step.step}` +
          (actingNote(session.activeRole, me.delegated)
            ? ` (${actingNote(session.activeRole, me.delegated)})`
            : "") +
          `. Grounds: ${grounds}`,
      },
    }),
  ]);

  refreshAdmin();
  return ok(`${item.reference} rejected. Raising it again is a new request, on purpose.`);
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

export async function completeAdminItem(
  itemId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("admin_item.complete");
  if (error || !session) return error!;

  const note = String(formData.get("note") ?? "").trim() || null;

  const { item, error: moveError } = await loadForTransition(itemId, "completed");
  if (moveError || !item) return moveError!;

  if (item.track === "request") {
    const outstanding = item.approvals.filter((a) => a.decision !== "approved").length;
    if (outstanding > 0) {
      return refused(
        `${item.reference} still needs ${outstanding} approval${outstanding > 1 ? "s" : ""}. It cannot be actioned yet.`,
      );
    }
  }

  const completedAt = new Date();
  const onTime = completedAt <= item.dueAt;

  await db.$transaction([
    db.adminItem.update({
      where: { id: item.id },
      data: { state: "completed", completedAt },
    }),
    db.workItem.updateMany({
      where: { adminItemId: item.id, state: { in: ["open", "blocked"] } },
      data: { state: "done", doneAt: completedAt },
    }),
    db.event.create({
      data: {
        type: "admin_item.completed",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: ADMIN_DEPARTMENT,
        adminItemId: item.id,
        personId: item.aboutPersonId,
        // Whether it was on time is stated in the event rather than worked out
        // later from two timestamps, because the KPI is a count of these.
        detail:
          `${item.reference} completed ${onTime ? "on time" : "late"} against its ${item.priority} target.` +
          (note ? ` ${note}` : ""),
      },
    }),
  ]);

  refreshAdmin();
  return ok(`${item.reference} completed${onTime ? " on time." : ", late against its target."}`);
}

export async function cancelAdminItem(
  itemId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("admin_item.cancel");
  if (error || !session) return error!;

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return refused("Say why it is being cancelled — an unexplained cancellation looks like a loss.");

  const { item, error: moveError } = await loadForTransition(itemId, "cancelled");
  if (moveError || !item) return moveError!;

  await db.$transaction([
    db.adminItem.update({
      where: { id: item.id },
      data: { state: "cancelled", cancelledAt: new Date() },
    }),
    db.workItem.updateMany({
      where: { adminItemId: item.id, state: { in: ["open", "blocked"] } },
      data: { state: "cancelled", doneAt: new Date() },
    }),
    db.event.create({
      data: {
        type: "admin_item.cancelled",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: ADMIN_DEPARTMENT,
        adminItemId: item.id,
        detail: `${item.reference} cancelled. Reason: ${reason}`,
      },
    }),
  ]);

  refreshAdmin();
  return ok(`${item.reference} cancelled.`);
}

// ---------------------------------------------------------------------------
// The categories' own writes
// ---------------------------------------------------------------------------

/**
 * Record a payment against a scheduled instance.
 *
 * The variance check is the whole reason this is not just a date field: a rent
 * payment that differs from the agreed figure raises a request rather than
 * being recorded quietly, which is the control the approved workflow asked for.
 */
export async function recordPayment(
  instanceId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("payment.record");
  if (error || !session) return error!;

  const paidRaw = String(formData.get("amountPounds") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim() || null;

  const instance = await db.paymentInstance.findUnique({
    where: { id: instanceId },
    include: { recurringPayment: { include: { supplier: true } } },
  });
  if (!instance) return refused("That payment is not on the schedule.");
  if (instance.paidOn) return refused("That payment is already recorded as paid.");

  const agreed = instance.recurringPayment.agreedAmountPence;
  let amountPaidPence = instance.amountDuePence;
  if (paidRaw) {
    const pounds = Number(paidRaw.replace(/[£,\s]/g, ""));
    if (!Number.isFinite(pounds) || pounds < 0) return refused("That amount is not a number.");
    amountPaidPence = Math.round(pounds * 100);
  }

  const variance = amountPaidPence - agreed;
  const paidOn = new Date();

  await db.$transaction(async (tx) => {
    await tx.paymentInstance.update({
      where: { id: instance.id },
      data: { paidOn, amountPaidPence, reference },
    });

    await tx.event.create({
      data: {
        type: variance === 0 ? "admin_payment.recorded" : "admin_payment.variance",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: ADMIN_DEPARTMENT,
        detail:
          `${instance.recurringPayment.label} (${instance.recurringPayment.supplier.name}): ` +
          `${formatPence(amountPaidPence)} paid against an agreed ${formatPence(agreed)}` +
          (variance === 0
            ? "."
            : `, a variance of ${variance > 0 ? "+" : ""}${formatPence(Math.abs(variance))}.`),
      },
    });

    // A difference from the agreed figure is not a note in a field — it is a
    // request that somebody has to decide.
    if (variance !== 0) {
      const thresholds = thresholdsFrom(
        Object.fromEntries(
          (await tx.setting.findMany({ where: { key: { startsWith: "admin.approval." } } })).map(
            (r) => [r.key, r.value],
          ),
        ),
      );
      const chain = approvalChain(
        { kind: "payment", amountPence: Math.abs(variance), aboutPersonId: null },
        thresholds,
      );
      const count = await tx.adminItem.count();
      const ref = `ADM-${String(count + 1).padStart(4, "0")}`;
      const dueAt = new Date(paidOn.getTime() + PRIORITIES.P2.targetHours * 3_600_000);

      const item = await tx.adminItem.create({
        data: {
          reference: ref,
          track: "request",
          category: "payments",
          kind: "payment",
          title: `Variance on ${instance.recurringPayment.label}`,
          detail:
            `Paid ${formatPence(amountPaidPence)} against an agreed ${formatPence(agreed)}.`,
          priority: "P2",
          amountPence: Math.abs(variance),
          recurringPaymentId: instance.recurringPaymentId,
          requestedByUserId: session.userId,
          raisedAt: paidOn,
          dueAt,
          approvals: {
            create: chain.map((s) => ({
              step: s.step,
              requiredRoles: s.anyOf as Role[],
              reason: s.reason,
            })),
          },
        },
      });

      await tx.workItem.create({
        data: {
          title: `${ref} — variance on ${instance.recurringPayment.label}`,
          adminItemId: item.id,
          // The queue entry follows the chain rather than always going to
          // Finance: the amount being approved is the VARIANCE, not the whole
          // payment, so a £13 difference on the rent is the Admin Manager's to
          // sign and sending it to Finance would be noise.
          ownerRole: chain[0].anyOf[0] as Role,
          dueAt,
          slaDays: 1,
        },
      });
    }
  });

  refreshAdmin();
  return ok(
    variance === 0
      ? `${formatPence(amountPaidPence)} recorded. It matches the agreed figure, so nothing needs approving.`
      : `${formatPence(amountPaidPence)} recorded, ${formatPence(Math.abs(variance))} ${variance > 0 ? "over" : "under"} the agreed figure. A variance request has been raised.`,
  );
}

/**
 * Decide a holiday request.
 *
 * The cover count is read from the rota at the moment of the decision and
 * stored on the request. It is the evidence that cover was considered, which is
 * the thing an argument three months later actually turns on.
 */
export async function decideHoliday(
  requestId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("holiday.decide");
  if (error || !session) return error!;

  const verdict = String(formData.get("verdict") ?? "");
  if (verdict !== "approved" && verdict !== "rejected") {
    return refused("A holiday request is approved or rejected, nothing else.");
  }
  const note = String(formData.get("note") ?? "").trim() || null;
  if (verdict === "rejected" && !note) {
    return refused("A refused holiday request has to say why.");
  }

  const request = await db.holidayRequest.findUnique({
    where: { id: requestId },
    include: { person: true, entitlement: true },
  });
  if (!request) return refused("That holiday request no longer exists.");
  if (request.decision !== "pending") {
    return refused(`That request was already ${request.decision}.`);
  }

  const me = await getEffectiveRoles(session.userId);
  if (me?.personId === request.personId) {
    return refused("You cannot decide your own holiday request.");
  }

  // The rota already knows. The question is a query, not a phone call.
  const shiftsAffected = await db.assignment.count({
    where: {
      personId: request.personId,
      state: { not: "cancelled" },
      startsAt: { lte: request.endsOn },
      endsAt: { gte: request.startsOn },
    },
  });

  await db.$transaction([
    db.holidayRequest.update({
      where: { id: request.id },
      data: {
        decision: verdict,
        decidedAt: new Date(),
        decidedByUserId: session.userId,
        note,
        shiftsAffected,
      },
    }),
    db.event.create({
      data: {
        type: `admin_holiday.${verdict}`,
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: ADMIN_DEPARTMENT,
        personId: request.personId,
        detail:
          `${request.hoursRequested} hours, ${request.startsOn.toISOString().slice(0, 10)} to ${request.endsOn.toISOString().slice(0, 10)}, ${verdict}. ` +
          `${shiftsAffected} rostered shift${shiftsAffected === 1 ? "" : "s"} in that window.` +
          (note ? ` ${note}` : ""),
      },
    }),
  ]);

  refreshAdmin();
  return ok(
    verdict === "approved"
      ? `Approved. ${shiftsAffected > 0 ? `${shiftsAffected} rostered shift${shiftsAffected === 1 ? "" : "s"} in that window need cover — Control has been told.` : "No rostered shifts in that window."}`
      : "Rejected, with your reason on the record.",
  );
}

/** A stock movement. Signed, so the running total is a sum. */
export async function moveStock(
  stockItemId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("stock.move");
  if (error || !session) return error!;

  const kind = String(formData.get("kind") ?? "");
  const qtyRaw = Number(String(formData.get("quantity") ?? "0"));
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!["received", "issued", "returned", "written_off", "adjustment"].includes(kind)) {
    return refused("That is not a kind of stock movement.");
  }
  if (!Number.isInteger(qtyRaw) || qtyRaw === 0) {
    return refused("Give a whole number of items, and not zero.");
  }

  const stockItem = await db.stockItem.findUnique({
    where: { id: stockItemId },
    include: { equipmentItem: true, movements: true },
  });
  if (!stockItem) return refused("That stock line no longer exists.");

  // The sign is derived from the kind, never typed. The database checks it
  // again, because a return that reduced stock would be silently wrong.
  const magnitude = Math.abs(qtyRaw);
  const quantity =
    kind === "received" || kind === "returned"
      ? magnitude
      : kind === "adjustment"
        ? qtyRaw
        : -magnitude;

  const onHand = stockItem.movements.reduce((sum, m) => sum + m.quantity, 0);
  if (onHand + quantity < 0) {
    return refused(
      `There are only ${onHand} in stock. Recording this would take it to ${onHand + quantity}, which means the count is already wrong — do a stock adjustment first.`,
    );
  }

  const label = `${stockItem.equipmentItem.label}${stockItem.size ? ` (${stockItem.size})` : ""}`;

  await db.$transaction([
    db.stockMovement.create({
      data: { stockItemId, kind: kind as never, quantity, byUserId: session.userId, note },
    }),
    db.event.create({
      data: {
        type: "admin_stock.moved",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: ADMIN_DEPARTMENT,
        detail: `${label}: ${kind.replace(/_/g, " ")} ${quantity > 0 ? "+" : ""}${quantity}. Now ${onHand + quantity} on hand.`,
      },
    }),
  ]);

  refreshAdmin();
  const now = onHand + quantity;
  return ok(
    now <= stockItem.reorderLevel
      ? `${label}: ${now} on hand, at or under the reorder level of ${stockItem.reorderLevel}. Time to order.`
      : `${label}: ${now} on hand.`,
  );
}

/** Record maintenance against an asset, and move its next service date on. */
export async function recordMaintenance(
  assetId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("asset.maintain");
  if (error || !session) return error!;

  const kind = String(formData.get("kind") ?? "service");
  const description = String(formData.get("description") ?? "").trim();
  const costRaw = String(formData.get("costPounds") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim() || null;

  if (!["service", "repair", "inspection", "replacement"].includes(kind)) {
    return refused("That is not a kind of maintenance job.");
  }
  if (!description) return refused("Say what was done.");

  const asset = await db.asset.findUnique({ where: { id: assetId } });
  if (!asset) return refused("That asset is not on the register.");

  let costPence: number | null = null;
  if (costRaw) {
    const pounds = Number(costRaw.replace(/[£,\s]/g, ""));
    if (!Number.isFinite(pounds) || pounds < 0) return refused("That cost is not a number.");
    costPence = Math.round(pounds * 100);
  }

  const completedAt = new Date();
  // The next service date is moved on from the interval, so the reminder
  // ladder cancels itself rather than needing a second edit.
  const nextServiceOn =
    asset.serviceIntervalMonths && kind !== "replacement"
      ? new Date(
          new Date(completedAt).setMonth(completedAt.getMonth() + asset.serviceIntervalMonths),
        )
      : asset.nextServiceOn;

  await db.$transaction([
    db.maintenanceJob.create({
      data: {
        assetId,
        kind: kind as never,
        description,
        reportedByUserId: session.userId,
        costPence,
        completedAt,
        outcome,
      },
    }),
    db.asset.update({
      where: { id: assetId },
      data: { lastServicedOn: completedAt, nextServiceOn, condition: "in_service" },
    }),
    db.event.create({
      data: {
        type: "admin_asset.maintained",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: ADMIN_DEPARTMENT,
        detail:
          `${asset.tag} ${asset.label}: ${kind} — ${description}.` +
          (costPence ? ` ${formatPence(costPence)}.` : "") +
          (nextServiceOn ? ` Next due ${nextServiceOn.toISOString().slice(0, 10)}.` : ""),
      },
    }),
  ]);

  refreshAdmin();
  return ok(
    nextServiceOn
      ? `Recorded against ${asset.tag}. Next service due ${nextServiceOn.toISOString().slice(0, 10)}.`
      : `Recorded against ${asset.tag}.`,
  );
}

/**
 * Mark an accreditation evidence requirement satisfied.
 *
 * A derived requirement is not marked off by hand — it is satisfied by the
 * records the platform already holds, and this refuses to let someone tick it
 * as though it were a box.
 */
export async function satisfyEvidence(
  requirementId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("accreditation.evidence");
  if (error || !session) return error!;

  const note = String(formData.get("note") ?? "").trim() || null;

  const requirement = await db.accreditationRequirement.findUnique({
    where: { id: requirementId },
    include: { accreditation: true },
  });
  if (!requirement) return refused("That requirement no longer exists.");
  if (requirement.satisfiedAt) return refused("That requirement is already marked satisfied.");
  if (requirement.source.startsWith("derived_")) {
    return refused(
      `This one is answered by the platform's own records (${requirement.derivedFrom}). Ticking it by hand would replace evidence with an assertion.`,
    );
  }

  await db.$transaction([
    db.accreditationRequirement.update({
      where: { id: requirementId },
      data: { satisfiedAt: new Date(), satisfiedByUserId: session.userId, note },
    }),
    db.event.create({
      data: {
        type: "admin_accreditation.evidence_satisfied",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: ADMIN_DEPARTMENT,
        detail:
          `${requirement.accreditation.name}: ${requirement.clause ? `${requirement.clause} — ` : ""}${requirement.label} satisfied.` +
          (note ? ` ${note}` : ""),
      },
    }),
  ]);

  refreshAdmin();
  return ok(`${requirement.label} marked satisfied.`);
}

/**
 * Change an approval threshold.
 *
 * A setting, not a release — but not a quiet one either: it changes who may
 * approve what, so it writes an event naming the old figure and the new one.
 */
export async function changeThreshold(
  key: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("threshold.change");
  if (error || !session) return error!;

  if (!key.startsWith("admin.approval.")) {
    return refused("That is not an approval threshold.");
  }
  const poundsRaw = String(formData.get("pounds") ?? "").trim();
  const pounds = Number(poundsRaw.replace(/[£,\s]/g, ""));
  if (!Number.isFinite(pounds) || pounds < 0) return refused("That is not an amount.");
  const pence = Math.round(pounds * 100);

  const before = await db.setting.findUnique({ where: { key } });

  await db.$transaction([
    db.setting.upsert({
      where: { key },
      create: {
        key,
        value: String(pence),
        valueType: "number",
        label:
          key.endsWith("low_threshold_pence")
            ? "Admin approval — Admin Manager decides at or under this"
            : "Admin approval — a second, different approver above this",
        usedBy: "lib/core/admin.ts approvalChain",
        updatedById: session.userId,
      },
      update: { value: String(pence), updatedById: session.userId },
    }),
    db.event.create({
      data: {
        type: "admin_threshold.changed",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: ADMIN_DEPARTMENT,
        detail:
          `${key}: ${before ? formatPence(Number(before.value)) : "unset"} → ${formatPence(pence)}. ` +
          "Requests already raised keep the chain they were raised with.",
      },
    }),
  ]);

  refreshAdmin();
  return ok(`Threshold set to ${formatPence(pence)}. Requests already in flight keep their original chain.`);
}
