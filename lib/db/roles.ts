/**
 * What a person may act as, right now.
 *
 * Read at the moment of acting rather than taken from the session cookie,
 * because a delegation can start, expire or be revoked in the middle of
 * somebody's working day and a cookie signed at 8am would not know. The
 * session still carries the roles as they stood at sign-in — that is what the
 * role switcher offers — but every decision that matters resolves them again.
 */

import { effectiveRoles, type ActiveDelegation } from "@/lib/auth/delegation";
import { db } from "./client";
import type { Role } from "@/lib/types";

export interface EffectiveRoles {
  userId: string;
  personId: string;
  /** Held in their own right. */
  substantive: Role[];
  /** Lent to them, and in force now. */
  delegated: ActiveDelegation[];
  /** The union — what they may actually act as. */
  all: Role[];
}

export async function getEffectiveRoles(
  userId: string,
  now = new Date(),
): Promise<EffectiveRoles | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      roles: { where: { revokedAt: null } },
      delegationsHeld: {
        where: { revokedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
        include: { from: true },
      },
    },
  });
  if (!user) return null;

  const substantive = user.roles.map((r) => r.role as Role);
  const delegated: ActiveDelegation[] = user.delegationsHeld.map((d) => ({
    role: d.role as Role,
    fromUserId: d.fromUserId,
    fromName: d.from.displayName,
    endsAt: d.endsAt.toISOString(),
  }));

  return {
    userId: user.id,
    personId: user.personId,
    substantive,
    delegated,
    all: effectiveRoles(substantive, delegated),
  };
}

/** Every delegation in force, for the System screen. */
export async function getActiveDelegations(now = new Date()) {
  const rows = await db.roleDelegation.findMany({
    where: { revokedAt: null, endsAt: { gt: now } },
    include: { from: true, to: true, grantedBy: true },
    orderBy: { endsAt: "asc" },
  });
  return rows.map((d) => ({
    id: d.id,
    role: d.role as Role,
    fromName: d.from.displayName,
    toName: d.to.displayName,
    grantedByName: d.grantedBy.displayName,
    startsAt: d.startsAt.toISOString(),
    endsAt: d.endsAt.toISOString(),
    reason: d.reason,
    daysLeft: Math.ceil((d.endsAt.getTime() - now.getTime()) / 86_400_000),
    live: d.startsAt <= now,
  }));
}

/** Delegations that have ended, so a past period is still answerable. */
export async function getPastDelegations(limit = 10, now = new Date()) {
  const rows = await db.roleDelegation.findMany({
    where: { OR: [{ revokedAt: { not: null } }, { endsAt: { lte: now } }] },
    include: { from: true, to: true },
    orderBy: { endsAt: "desc" },
    take: limit,
  });
  return rows.map((d) => ({
    id: d.id,
    role: d.role as Role,
    fromName: d.from.displayName,
    toName: d.to.displayName,
    startsAt: d.startsAt.toISOString(),
    endsAt: d.endsAt.toISOString(),
    revokedAt: d.revokedAt ? d.revokedAt.toISOString() : null,
    revokedReason: d.revokedReason,
  }));
}
