/**
 * Lending a role, for a fixed period.
 *
 * The case this exists for: the Finance Officer goes on leave, and somebody has
 * to be able to approve spend while they are away. The two obvious answers are
 * both wrong.
 *
 *   - Letting approvals fall back to "anyone in higher management" widens who
 *     can spend money every time somebody takes leave. An absence should not
 *     change the shape of the control.
 *   - Granting the role permanently is not a delegation. It is a second
 *     Finance Officer that nobody decided to appoint, and it will still be
 *     there in two years.
 *
 * So a delegation is a named person, for a named period, with an end date that
 * cannot be omitted, recorded as data. `endsAt` is NOT nullable in the schema
 * for exactly that reason: an open-ended delegation is indistinguishable from a
 * permanent grant.
 *
 * What a delegation does NOT do is relax any of the separation rules. The
 * deputy is a different person, so the "one person, one rung" rule keeps
 * working — somebody holding top management substantively and finance by
 * delegation still cannot sign both rungs of a large payment, because the
 * database indexes the approver, not the role.
 */

import { canGrantRole, isScreeningRole } from "@/lib/roles";
import type { Role } from "@/lib/types";

/**
 * The longest a delegation may run without being renewed.
 *
 * Ninety days is a judgement, not a rule from anywhere: long enough to cover
 * leave, illness or a sabbatical, short enough that a forgotten delegation
 * expires by itself rather than becoming permanent by neglect. Renewing is one
 * action and leaves a second record, which is the behaviour we want.
 */
export const MAX_DELEGATION_DAYS = 90;

export interface DelegationCheck {
  permitted: boolean;
  reason: string | null;
}

export interface DelegationSubject {
  userId: string;
  personId: string;
  /** Substantive roles only — what they hold in their own right. */
  roles: Role[];
  /** Clause 6.1 and 6.2 evidence, needed before a screening role is lent. */
  ownScreeningComplete: boolean;
  confidentialityAgreementOnFile: boolean;
  trainingReviewedAt: string | null;
  active: boolean;
}

/**
 * Whether a proposed delegation is allowed.
 *
 * Every refusal here is a case that would otherwise produce a delegation that
 * looks fine and is not.
 */
export function validateDelegation(args: {
  role: Role;
  /** The substantive holder, whose role is being lent. */
  from: DelegationSubject;
  /** The deputy. */
  to: DelegationSubject;
  /** Who is granting it. */
  grantedBy: DelegationSubject;
  startsAt: Date;
  endsAt: Date;
  /** Delegations of the same role to the same person already in force. */
  existingActive: { role: Role; toUserId: string; endsAt: Date }[];
  now?: Date;
}): DelegationCheck {
  const { role, from, to, grantedBy, startsAt, endsAt } = args;
  const now = args.now ?? new Date();

  if (!to.active) {
    return { permitted: false, reason: "That person is not an active user of the portal." };
  }
  if (to.userId === from.userId) {
    return { permitted: false, reason: "A role cannot be delegated to the person who already holds it." };
  }
  if (!from.roles.includes(role)) {
    return {
      permitted: false,
      reason: `${role.replace(/_/g, " ")} cannot be lent by someone who does not hold it.`,
    };
  }
  if (to.roles.includes(role)) {
    return {
      permitted: false,
      reason: "That person already holds this role in their own right, so a delegation would do nothing.",
    };
  }
  // The deputy arranging their own cover is the loophole that makes the rest of
  // this pointless.
  if (grantedBy.userId === to.userId) {
    return {
      permitted: false,
      reason: "You cannot arrange your own cover. Somebody else has to grant it to you.",
    };
  }

  if (endsAt <= startsAt) {
    return { permitted: false, reason: "A delegation has to end after it starts." };
  }
  const days = (endsAt.getTime() - startsAt.getTime()) / 86_400_000;
  if (days > MAX_DELEGATION_DAYS) {
    return {
      permitted: false,
      reason: `A delegation may run for at most ${MAX_DELEGATION_DAYS} days. Longer than that is an appointment, not cover — renew it instead, so there is a second record.`,
    };
  }
  if (endsAt <= now) {
    return { permitted: false, reason: "That delegation would already have expired." };
  }

  if (args.existingActive.some((d) => d.role === role && d.toUserId === to.userId)) {
    return {
      permitted: false,
      reason: "That person already holds this role by a delegation that has not ended. Revoke or let it expire first.",
    };
  }

  // A lent screening role carries the same 6.1 and 6.2 obligations as a granted
  // one. Screening cover is exactly where this would be forgotten.
  if (isScreeningRole(role)) {
    const grant = canGrantRole({
      role,
      ownScreeningComplete: to.ownScreeningComplete,
      confidentialityAgreementOnFile: to.confidentialityAgreementOnFile,
      trainingReviewedAt: to.trainingReviewedAt,
      now,
    });
    if (!grant.permitted) {
      return { permitted: false, reason: `${grant.reason} — the same applies to a delegation.` };
    }
  }

  return { permitted: true, reason: null };
}

export interface ActiveDelegation {
  role: Role;
  fromUserId: string;
  fromName: string;
  endsAt: string;
}

/**
 * The roles a person may act as right now: their own, plus anything lent to
 * them and currently in force.
 *
 * Resolved at the moment of acting rather than read from the session, because a
 * delegation can start, expire or be revoked in the middle of somebody's
 * working day and the session cookie would not know.
 */
export function effectiveRoles(
  substantive: Role[],
  delegated: ActiveDelegation[],
): Role[] {
  const all = new Set<Role>(substantive);
  delegated.forEach((d) => all.add(d.role));
  return [...all];
}

/**
 * How an action taken on a lent role should read in the audit trail.
 *
 * "Approved as Finance Officer" is not the whole truth when the role was
 * borrowed. The log says whose role it was and until when, because that is the
 * question an auditor asks.
 */
export function actingNote(
  role: Role,
  delegated: ActiveDelegation[],
): string | null {
  const d = delegated.find((x) => x.role === role);
  if (!d) return null;
  return `acting on ${d.fromName}'s ${role.replace(/_/g, " ")} by delegation until ${d.endsAt.slice(0, 10)}`;
}
