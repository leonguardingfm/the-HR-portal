/**
 * Shifts nobody is on: the open shifts never filled, and the shifts an officer
 * came off that still need cover (Control, 25 September 2026: "make uncovered
 * shifts easy to see"). One list, soonest first, for the dashboard, the Live
 * board and the alarm bar alike.
 */

import { mondayOf, ukDate } from "@/lib/core/rota";
import { db } from "./client";

export interface UncoveredShift {
  kind: "cover" | "open";
  id: string;
  postId: string;
  postName: string;
  siteName: string;
  clientName: string;
  startsAt: string;
  endsAt: string;
  /** For a shift somebody came off: who, and why. */
  from: { name: string; reason: string; note: string | null } | null;
  /** Straight to the post and day on the rota, with the fill panel open. */
  href: string;
  /** Who in Control has taken the job of filling it. */
  takenBy: string | null;
  /** Officers who have offered for it in their portal, still waiting. */
  offers: number;
}

export async function getUncovered(hoursAhead = 48, now = new Date()): Promise<UncoveredShift[]> {
  const horizon = new Date(now.getTime() + hoursAhead * 3_600_000);
  const place = { include: { site: { include: { client: true } } } } as const;
  const [needs, gaps] = await Promise.all([
    db.coverNeed.findMany({
      where: { coverAssignmentId: null, closedAt: null, endsAt: { gt: now }, startsAt: { lt: horizon } },
      include: {
        post: place,
        from: { select: { person: { select: { fullName: true } } } },
        workItems: { where: { state: "open" }, select: { ownerRole: true, owner: { select: { displayName: true } } } },
      },
    }),
    db.openShift.findMany({
      where: { assignmentId: null, cancelledAt: null, endsAt: { gt: now }, startsAt: { lt: horizon }, post: { active: true, site: { active: true } } },
      include: {
        post: place,
        workItems: { where: { state: "open" }, select: { ownerRole: true, owner: { select: { displayName: true } } } },
        volunteers: { where: { state: "waiting" }, select: { id: true } },
      },
    }),
  ]);
  const href = (postId: string, startsAt: Date, cover?: string) =>
    `/scheduling?week=${mondayOf(ukDate(startsAt))}${cover ? `&cover=${cover}` : `&post=${postId}&day=${ukDate(startsAt)}`}`;
  const taken = (items: { ownerRole: string | null; owner: { displayName: string } | null }[]) =>
    items.find((w) => w.owner && w.ownerRole)?.owner?.displayName ?? null;

  const rows: UncoveredShift[] = [
    ...needs.map((n) => ({
      kind: "cover" as const,
      id: n.id,
      postId: n.postId,
      postName: n.post.name,
      siteName: n.post.site.name,
      clientName: n.post.site.client.name,
      startsAt: n.startsAt.toISOString(),
      endsAt: n.endsAt.toISOString(),
      from: { name: n.from.person.fullName, reason: n.reason, note: n.note },
      href: href(n.postId, n.startsAt, n.id),
      takenBy: taken(n.workItems),
      offers: 0,
    })),
    ...gaps.map((g) => ({
      kind: "open" as const,
      id: g.id,
      postId: g.postId,
      postName: g.post.name,
      siteName: g.post.site.name,
      clientName: g.post.site.client.name,
      startsAt: g.startsAt.toISOString(),
      endsAt: g.endsAt.toISOString(),
      from: null,
      href: href(g.postId, g.startsAt),
      takenBy: taken(g.workItems),
      offers: g.volunteers.length,
    })),
  ];
  return rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
