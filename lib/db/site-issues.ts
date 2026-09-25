/**
 * Site issues, read (26 September 2026): Control's list, the checks waiting
 * for an officer on site, and — fenced like everything else in the portal —
 * what a client sees of issues at their own sites.
 */

import type { Prisma } from "@prisma/client";
import type { PortalScope } from "./client-portal";
import { officerLabel } from "./client-portal";
import { db } from "./client";

export const siteIssueRef = (n: number) => `SI-${n}`;

const staffInclude = {
  site: { select: { name: true, client: { select: { name: true } } } },
  post: { select: { name: true } },
  reportedBy: { select: { fullName: true } },
  photos: { select: { id: true, shared: true }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.SiteIssueInclude;

/** Control's view: everything to review, everything with clients, and the last month closed. */
export async function staffSiteIssues(now = new Date()) {
  const month = new Date(now.getTime() - 30 * 86_400_000);
  const rows = await db.siteIssue.findMany({
    where: { OR: [{ status: { in: ["reported", "open", "client_fixed"] } }, { reportedAt: { gte: month } }, { resolvedAt: { gte: month } }] },
    include: staffInclude,
    orderBy: [{ reportedAt: "desc" }],
    take: 500,
  });
  const names = new Map((await db.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.reviewedById, r.clientFixedById, r.checkedByUserId]).filter((x): x is string => !!x))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return rows.map((r) => ({
    id: r.id,
    ref: siteIssueRef(r.number),
    status: r.status,
    kind: r.kind,
    urgency: r.urgency,
    client: r.site.client.name,
    site: r.site.name,
    post: r.post?.name ?? null,
    location: r.location,
    description: r.description,
    reportedBy: r.reportedBy.fullName,
    reportedAt: r.reportedAt.toISOString(),
    clientText: r.clientText,
    internalReason: r.internalReason,
    reviewedBy: r.reviewedById ? (names.get(r.reviewedById) ?? "—") : null,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    clientFixedAt: r.clientFixedAt?.toISOString() ?? null,
    clientFixedBy: r.clientFixedById ? (names.get(r.clientFixedById) ?? "the client") : null,
    clientFixedNote: r.clientFixedNote,
    checkedAt: r.checkedAt?.toISOString() ?? null,
    checkNote: r.checkNote,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    reopenCount: r.reopenCount,
    photos: r.photos,
  }));
}
export type StaffSiteIssue = Awaited<ReturnType<typeof staffSiteIssues>>[number];

/** Issues the client says are fixed, at the site of a shift the officer is on now — for them to check. */
export async function checksForOfficer(personId: string, now = new Date()) {
  const shifts = await db.assignment.findMany({
    where: { personId, state: { in: ["published", "amended", "completed"] }, startsAt: { lte: now }, endsAt: { gt: now }, leftCover: null },
    select: { post: { select: { siteId: true } } },
  });
  const siteIds = [...new Set(shifts.map((s) => s.post.siteId))];
  if (!siteIds.length) return [];
  const rows = await db.siteIssue.findMany({
    where: { siteId: { in: siteIds }, status: "client_fixed" },
    include: { site: { select: { name: true } }, photos: { select: { id: true }, orderBy: { createdAt: "asc" } } },
    orderBy: { clientFixedAt: "asc" },
  });
  return rows.map((r) => ({ id: r.id, ref: siteIssueRef(r.number), kind: r.kind, site: r.site.name, location: r.location, text: r.clientText ?? r.description, clientSaidAt: r.clientFixedAt!.toISOString(), clientNote: r.clientFixedNote, photos: r.photos.map((p) => p.id) }));
}

/** What a client sees: approved issues at their own sites — open, waiting for a check, and those fixed in the last ninety days. */
export async function clientSiteIssues(scope: PortalScope, now = new Date()) {
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const rows = await db.siteIssue.findMany({
    where: { siteId: { in: scope.siteIds }, OR: [{ status: { in: ["open", "client_fixed"] } }, { status: "resolved", resolvedAt: { gte: since } }] },
    include: { site: { select: { name: true } }, reportedBy: { select: { fullName: true, licences: { where: { kind: { not: "other" } }, orderBy: { expiresAt: "desc" }, take: 1, select: { number: true } } } }, photos: { where: { shared: true }, select: { id: true }, orderBy: { createdAt: "asc" } } },
    orderBy: [{ status: "asc" }, { reportedAt: "desc" }],
  });
  const fixers = new Map((await db.user.findMany({ where: { id: { in: rows.map((r) => r.clientFixedById).filter((x): x is string => !!x) }, clientId: scope.clientId }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return rows.map((r) => ({
    id: r.id,
    ref: siteIssueRef(r.number),
    status: r.status as "open" | "client_fixed" | "resolved",
    kind: r.kind,
    urgency: r.urgency,
    site: r.site.name,
    location: r.location,
    text: r.clientText!,
    reportedAt: r.reportedAt.toISOString(),
    sharedAt: r.reviewedAt!.toISOString(),
    foundBy: scope.identity === "none" ? "our officer" : officerLabel(scope.identity, r.reportedBy),
    clientFixedAt: r.clientFixedAt?.toISOString() ?? null,
    clientFixedBy: r.clientFixedById ? (fixers.get(r.clientFixedById) ?? null) : null,
    checkedAt: r.checkedAt?.toISOString() ?? null,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    reopened: r.reopenCount > 0 && r.status === "open",
    photos: r.photos.map((p) => p.id),
  }));
}
