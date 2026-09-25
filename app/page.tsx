import { DashboardView } from "@/components/dashboard/DashboardView";
import type { TaskSummaryRow } from "@/components/dashboard/TaskSummary";
import { requireSession } from "@/lib/auth/server";
import { alertSeverity, isAlarm, openHref } from "@/lib/core/alerts";
import { mondayOf, ukDate } from "@/lib/core/rota";
import { departmentOfRole, oversightScope } from "@/lib/core/work";
import { db } from "@/lib/db/client";
import { personTaskLinks } from "@/lib/db/employees";
import { getLiveRows, getPresence, getRecentEvents } from "@/lib/db/queries";
import { getClockRows } from "@/lib/db/screening";
import { getUncovered } from "@/lib/db/uncovered";

export const dynamic = "force-dynamic";

const RANK = { critical: 0, serious: 1, warning: 2, good: 3, neutral: 4 } as const;

export default async function DashboardPage() {
  const session = await requireSession();
  const dept = departmentOfRole(session.activeRole);
  const now = new Date();
  const taskWhere = {
    state: { in: ["open" as const, "blocked" as const] },
    OR: [{ ownerUserId: session.userId }, { ownerUserId: null, ownerRole: { in: dept.roles } }],
  };
  const [liveRows, uncovered, events, presence, clockFiles, items, taskTotal] = await Promise.all([
    getLiveRows(12),
    getUncovered(48, now),
    getRecentEvents(10),
    // A department manager sees their own department working; the Managing Director everyone.
    getPresence(now, oversightScope(session.activeRole).all ? null : oversightScope(session.activeRole).roles),
    getClockRows(),
    db.workItem.findMany({
      where: taskWhere,
      include: {
        owner: { select: { displayName: true } },
        coverNeed: { select: { startsAt: true, postId: true } },
        openShift: { select: { startsAt: true, postId: true } },
      },
      orderBy: { dueAt: "asc" },
      take: 200,
    }),
    // The real number, not the length of the first page of it.
    db.workItem.count({ where: taskWhere }),
  ]);

  const personHref = await personTaskLinks(items);
  const rows: TaskSummaryRow[] = items
    .map((i) => {
      const alarm = isAlarm(i);
      const shift = i.coverNeed ?? i.openShift;
      const overdue = i.dueAt < now;
      return {
        id: i.id,
        title: i.title,
        severity: alarm ? alertSeverity(i) : i.state === "blocked" ? ("neutral" as const) : overdue ? ("serious" as const) : ("good" as const),
        label: alarm ? "Alert" : i.state === "blocked" ? "blocked" : overdue ? "overdue" : "on track",
        href: openHref(i, { rotaHref: shift ? `/scheduling?week=${mondayOf(ukDate(shift.startsAt))}&post=${shift.postId}&day=${ukDate(shift.startsAt)}` : null, personHref: personHref(i) }),
        owner: i.owner?.displayName ?? null,
        alarm,
      };
    })
    .sort((a, b) => Number(b.alarm) - Number(a.alarm) || RANK[a.severity] - RANK[b.severity]);

  return (
    <DashboardView
      liveRows={liveRows}
      uncovered={uncovered}
      events={events}
      presence={presence}
      clockFiles={clockFiles}
      tasks={{ rows: rows.slice(0, 7), total: taskTotal, department: dept.label }}
      role={session.activeRole}
      name={session.name}
      userId={session.userId}
    />
  );
}
