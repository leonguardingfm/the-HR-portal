"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { departmentSpec } from "@/lib/accounts";
import { canGrantRole, isScreeningRole } from "@/lib/roles";
import { refused, ok, type ActionResult } from "./types";

/**
 * Deciding registrations, and suspending or reactivating accounts.
 *
 * Same shape as every other write: guard, re-read, then write with the event
 * in the same transaction. Approval is the only way a pending account gets a
 * role, and the role it gets is the department's, never one typed in.
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

const refresh = () => {
  revalidatePath("/admin/users");
  revalidatePath("/system");
};

export async function approveAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("account.review");
  if (error || !session) return error!;

  const userId = String(formData.get("userId") ?? "");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return refused("That account no longer exists.");
  if (user.status !== "pending") return refused("Only a pending registration can be approved.");
  const dept = user.department ? departmentSpec(user.department) : undefined;
  if (!dept) return refused("This registration has no department, so there is no role to grant.");

  // A screening role needs the 6.1/6.2 evidence confirmed by the approver, and
  // the same rule every other grant goes through decides whether it is enough.
  const screening = isScreeningRole(dept.role);
  const evidence = {
    ownScreeningComplete: formData.get("screened") === "on",
    confidentialityAgreementOnFile: formData.get("nda") === "on",
    trainingReviewedAt: formData.get("trained") === "on" ? new Date() : null,
  };
  if (screening) {
    const check = canGrantRole({
      role: dept.role,
      ...evidence,
      trainingReviewedAt: evidence.trainingReviewedAt?.toISOString() ?? null,
    });
    if (!check.permitted) return refused(`${check.reason}. Confirm all three before approving.`);
  }

  const now = new Date();
  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: {
        status: "active",
        reviewedAt: now,
        reviewedById: session.userId,
        ...(screening ? evidence : {}),
      },
    }),
    db.userRole.upsert({
      where: { userId_role: { userId: user.id, role: dept.role } },
      create: {
        userId: user.id,
        role: dept.role,
        grantedById: session.userId,
        grantBasis: screening
          ? `Registration approved for ${dept.label}; own screening, NDA and training confirmed (6.1, 6.2)`
          : `Registration approved for ${dept.label}`,
      },
      update: { revokedAt: null, grantedById: session.userId, grantedAt: now },
    }),
    db.event.create({
      data: {
        type: "account.approved",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "administration",
        personId: user.personId,
        detail: `Approved ${user.displayName} for ${dept.label}.`,
      },
    }),
  ]);

  refresh();
  return ok(`${user.displayName} can now sign in as ${dept.label}.`);
}

export async function rejectAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("account.review");
  if (error || !session) return error!;

  const userId = String(formData.get("userId") ?? "");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return refused("That account no longer exists.");
  if (user.status !== "pending") return refused("Only a pending registration can be rejected.");

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { status: "rejected", reviewedAt: new Date(), reviewedById: session.userId },
    }),
    db.event.create({
      data: {
        type: "account.rejected",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "administration",
        personId: user.personId,
        detail: `Rejected the registration from ${user.displayName}.`,
      },
    }),
  ]);

  refresh();
  return ok(`Registration from ${user.displayName} rejected.`);
}

export async function suspendAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("account.review");
  if (error || !session) return error!;

  const userId = String(formData.get("userId") ?? "");
  if (userId === session.userId) return refused("You cannot suspend your own account.");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return refused("That account no longer exists.");
  if (user.status !== "active") return refused("Only an active account can be suspended.");

  const now = new Date();
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { status: "suspended" } }),
    // Signed out everywhere at once: presence stops showing them as working.
    db.workSession.updateMany({
      where: { userId: user.id, signedOutAt: null },
      data: { signedOutAt: now },
    }),
    db.event.create({
      data: {
        type: "account.suspended",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "administration",
        personId: user.personId,
        detail: `Suspended ${user.displayName}.`,
      },
    }),
  ]);

  refresh();
  return ok(`${user.displayName} is suspended and has been signed out.`);
}

export async function reactivateAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("account.review");
  if (error || !session) return error!;

  const userId = String(formData.get("userId") ?? "");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return refused("That account no longer exists.");
  if (user.status !== "suspended") return refused("Only a suspended account can be reactivated.");

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { status: "active" } }),
    db.event.create({
      data: {
        type: "account.reactivated",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "administration",
        personId: user.personId,
        detail: `Reactivated ${user.displayName}.`,
      },
    }),
  ]);

  refresh();
  return ok(`${user.displayName} can sign in again.`);
}
