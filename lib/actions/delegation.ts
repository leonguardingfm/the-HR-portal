"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { validateDelegation, type DelegationSubject } from "@/lib/auth/delegation";
import { ROLE_LABELS } from "@/lib/labels";
import { refused, ok, type ActionResult } from "./types";
import type { Role } from "@/lib/types";

/**
 * Lending a role, and taking it back.
 *
 * Same shape as every other write: guard, re-read, then write with the event in
 * the same transaction. The one thing worth noticing is how much of the
 * checking happens in `validateDelegation` rather than here — the rules are
 * about the *shape* of a delegation, and belong somewhere a test can reach them
 * without a database.
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
  revalidatePath("/system");
  revalidatePath("/system/permissions");
  revalidatePath("/admin/requests");
};

async function subject(userId: string): Promise<DelegationSubject | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    include: { roles: { where: { revokedAt: null } } },
  });
  if (!u) return null;
  return {
    userId: u.id,
    personId: u.personId,
    roles: u.roles.map((r) => r.role as Role),
    ownScreeningComplete: u.ownScreeningComplete,
    confidentialityAgreementOnFile: u.confidentialityAgreementOnFile,
    trainingReviewedAt: u.trainingReviewedAt ? u.trainingReviewedAt.toISOString() : null,
    active: u.active,
  };
}

export async function delegateRole(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("role.delegate");
  if (error || !session) return error!;

  const role = String(formData.get("role") ?? "") as Role;
  const fromUserId = String(formData.get("fromUserId") ?? "");
  const toUserId = String(formData.get("toUserId") ?? "");
  const days = Number(String(formData.get("days") ?? "0"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (!role || !fromUserId || !toUserId) return refused("Say which role, from whom, and to whom.");
  if (!reason) return refused("Say why the cover is needed — a delegation with no reason reads as a permanent grant.");
  if (!Number.isInteger(days) || days < 1) return refused("Give a whole number of days, at least one.");

  const [from, to, grantedBy] = await Promise.all([
    subject(fromUserId),
    subject(toUserId),
    subject(session.userId),
  ]);
  if (!from || !to || !grantedBy) return refused("One of those people is not a user of the portal.");

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + days * 86_400_000);

  const existingActive = (
    await db.roleDelegation.findMany({
      where: { revokedAt: null, endsAt: { gt: startsAt } },
      select: { role: true, toUserId: true, endsAt: true },
    })
  ).map((d) => ({ role: d.role as Role, toUserId: d.toUserId, endsAt: d.endsAt }));

  const check = validateDelegation({
    role,
    from,
    to,
    grantedBy,
    startsAt,
    endsAt,
    existingActive,
  });
  if (!check.permitted) return refused(check.reason!);

  const toUser = await db.user.findUnique({ where: { id: toUserId } });
  const fromUser = await db.user.findUnique({ where: { id: fromUserId } });

  await db.$transaction([
    db.roleDelegation.create({
      data: { role, fromUserId, toUserId, startsAt, endsAt, reason, grantedByUserId: session.userId },
    }),
    db.event.create({
      data: {
        type: "role.delegated",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "administration",
        personId: to.personId,
        detail:
          `${ROLE_LABELS[role]} lent from ${fromUser?.displayName} to ${toUser?.displayName} ` +
          `for ${days} day${days === 1 ? "" : "s"}, ending ${endsAt.toISOString().slice(0, 10)}. ` +
          `Reason: ${reason}`,
      },
    }),
  ]);

  refresh();
  return ok(
    `${ROLE_LABELS[role]} lent to ${toUser?.displayName} until ${endsAt.toISOString().slice(0, 10)}. ` +
      `It expires by itself — nobody has to remember to take it back.`,
  );
}

export async function revokeDelegation(
  delegationId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("role.revoke_delegation");
  if (error || !session) return error!;

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return refused("Say why it is being ended early.");

  const delegation = await db.roleDelegation.findUnique({
    where: { id: delegationId },
    include: { from: true, to: true },
  });
  if (!delegation) return refused("That delegation no longer exists.");
  if (delegation.revokedAt) return refused("That delegation has already been ended.");

  await db.$transaction([
    // Revoked, never deleted: the period it covered has to stay answerable
    // after the fact, because approvals were signed under it.
    db.roleDelegation.update({
      where: { id: delegationId },
      data: { revokedAt: new Date(), revokedByUserId: session.userId, revokedReason: reason },
    }),
    db.event.create({
      data: {
        type: "role.delegation_revoked",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "administration",
        personId: delegation.to.personId,
        detail:
          `${ROLE_LABELS[delegation.role as Role]} taken back from ${delegation.to.displayName} ` +
          `(was due to end ${delegation.endsAt.toISOString().slice(0, 10)}). Reason: ${reason}`,
      },
    }),
  ]);

  refresh();
  return ok(
    `${ROLE_LABELS[delegation.role as Role]} taken back from ${delegation.to.displayName}. ` +
      `Anything they approved while it was in force stays on the record, with the delegation named.`,
  );
}
