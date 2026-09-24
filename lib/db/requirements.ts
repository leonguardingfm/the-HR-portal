/**
 * Client requirement reads — Track A.
 *
 * Headcount is always worked out from the live allocations, never stored, so
 * "two of three filled" cannot drift from who is actually allocated.
 */

import { headcount } from "@/lib/core/requirements";
import type { RecruitmentStage, RequirementStatus } from "@/lib/types";
import { db } from "./client";

const LIVE = { releasedAt: null };

export async function getRequirements() {
  const rows = await db.requirement.findMany({
    orderBy: { startDate: "asc" },
    include: {
      client: true,
      site: true,
      allocations: { where: LIVE, select: { source: true } },
      candidacies: { select: { stage: true } },
    },
  });
  return rows.map((r) => ({
    ...r,
    status: r.status as RequirementStatus,
    hc: headcount(r.headcountRequired, r.allocations),
    inRecruitment: r.candidacies.filter((c) => !["withdrawn", "deployed", "confirmed_employment"].includes(c.stage)).length,
  }));
}

export async function getRequirement(id: string) {
  const r = await db.requirement.findUnique({
    where: { id },
    include: {
      client: true,
      site: { include: { posts: { where: { active: true }, orderBy: { name: "asc" } } } },
      allocations: {
        orderBy: { allocatedAt: "asc" },
        include: { person: { include: { employment: true, licences: { orderBy: { expiresAt: "desc" }, take: 1 } } } },
      },
      candidacies: {
        orderBy: { stageSince: "desc" },
        include: { person: { include: { employment: true } } },
      },
    },
  });
  if (!r) return null;

  const userIds = [r.ownerUserId, ...r.allocations.map((a) => a.allocatedById)].filter(Boolean) as string[];
  const [users, events] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } }),
    db.event.findMany({
      where: { requirementId: r.id },
      orderBy: { at: "desc" },
      take: 30,
      include: { actor: { select: { displayName: true } } },
    }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  const live = r.allocations.filter((a) => !a.releasedAt);

  return {
    ...r,
    status: r.status as RequirementStatus,
    hc: headcount(r.headcountRequired, live),
    live,
    names,
    events,
    candidacies: r.candidacies.map((c) => ({ ...c, stage: c.stage as RecruitmentStage })),
  };
}

/** Clients and their sites, for raising a requirement. */
export async function getClientsWithSites() {
  return db.client.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
      sites: {
        where: { active: true },
        orderBy: { name: "asc" },
        include: { posts: { where: { active: true }, orderBy: { name: "asc" }, select: { name: true } } },
      },
    },
  });
}
