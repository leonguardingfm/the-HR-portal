import { PageHeader } from "@/components/ui/PageHeader";
import { TaskList, type TaskRow } from "@/components/tasks/TaskList";
import { requireSession } from "@/lib/auth/server";
import { canDo } from "@/lib/auth/permissions";
import { alertKind, alertSeverity, closesItself, isAlarm, openHref } from "@/lib/core/alerts";
import { mondayOf, ukDate } from "@/lib/core/rota";
import { QUEUE_DEPARTMENTS, departmentOfRole } from "@/lib/core/work";
import { db } from "@/lib/db/client";
import { personTaskLinks } from "@/lib/db/employees";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * One work queue, filtered.
 *
 * "Control Room tasks", "HR tasks" and "Admin tasks" all arrive here with a
 * `?department=`. They are not three screens: a second task list is a second
 * thing to forget to open, and two lists that both claim to hold everything
 * will disagree within a week.
 *
 * Every task opens where its work is done, can be taken so the other desk can
 * see it is handled, and is closed from here — or closes itself, when it is an
 * alert about something that has to be put right (25 September 2026).
 *
 * Each department sees its own work and nobody else's: the Control Room never
 * sees HR's list, nor HR the Control Room's (25 September 2026). Only higher
 * management and the auditor, who oversee every department, see across them.
 * Decided here on the server, so a changed address shows nothing more.
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string }>;
}) {
  const session = await requireSession();
  const { department } = await searchParams;
  const mine = departmentOfRole(session.activeRole);
  const oversees = session.activeRole === "top_management" || session.activeRole === "auditor";
  const visible = oversees ? QUEUE_DEPARTMENTS.filter((d) => d.id !== "management") : QUEUE_DEPARTMENTS.filter((d) => d.id === mine.id && d.id !== "management");
  const dept = visible.find((d) => d.id === department);
  const view: "mine" | "everything" | "department" = department === "all" && oversees ? "everything" : dept ? "department" : "mine";

  // Officers' own alerts live in their portal, never in a staff list.
  const notOfficers: Prisma.WorkItemWhereInput = { OR: [{ ownerRole: { not: null } }, { owner: { department: { not: "officer" } } }] };
  const where: Prisma.WorkItemWhereInput =
    view === "department"
      ? { OR: [{ ownerRole: { in: dept!.roles } }, ...(dept!.id === "administration" ? [{ adminItemId: { not: null } }] : [])] }
      : view === "mine"
        ? { OR: [{ ownerUserId: session.userId }, { ownerUserId: null, ownerRole: { in: mine.roles } }] }
        : {};

  const items = await db.workItem.findMany({
    where: { state: { in: ["open", "blocked"] }, AND: [where, notOfficers] },
    include: {
      owner: { select: { displayName: true } },
      adminItem: { select: { reference: true } },
      coverNeed: { select: { startsAt: true, postId: true } },
      openShift: { select: { startsAt: true, postId: true } },
    },
    orderBy: { dueAt: "asc" },
    take: 300,
  });

  // Whether a self-closing alert's shift is still on, so Done is offered only when it can work.
  const shiftIds = [...new Set(items.map((i) => i.assignmentId).filter(Boolean))] as string[];
  const shifts = await db.assignment.findMany({ where: { id: { in: shiftIds } }, select: { id: true, state: true, endsAt: true } });
  const shiftOf = new Map(shifts.map((a) => [a.id, a]));
  const now = new Date();

  const personHref = await personTaskLinks(items);
  const rows: TaskRow[] = items.map((i) => {
    const alarm = isAlarm(i);
    const shift = i.coverNeed ?? i.openShift;
    const a = i.assignmentId ? shiftOf.get(i.assignmentId) : undefined;
    const selfClosing = closesItself(i);
    const liveShift = !!a && a.state !== "cancelled" && a.endsAt > now;
    const itsDept = i.ownerRole ? departmentOfRole(i.ownerRole) : null;
    const worksIt = !!itsDept && itsDept.roles.includes(session.activeRole);
    const mineNow = i.ownerUserId === session.userId;
    return {
      id: i.id,
      title: i.title,
      alarm,
      severity: alarm ? alertSeverity(i) : i.state === "blocked" ? "neutral" : i.dueAt < now ? "serious" : "good",
      status: alarm ? "alert" : i.state === "blocked" ? "blocked" : i.dueAt < now ? "overdue" : "on track",
      href: openHref(i, { rotaHref: shift ? `/scheduling?week=${mondayOf(ukDate(shift.startsAt))}&post=${shift.postId}&day=${ukDate(shift.startsAt)}` : null, personHref: personHref(i) }),
      department: itsDept?.label ?? (i.adminItemId ? "Admin" : "Named person"),
      createdAt: i.createdAt.toISOString(),
      dueAt: i.dueAt.toISOString(),
      reference: i.adminItem?.reference ?? null,
      blockedReason: i.blockedReason,
      owner: i.owner?.displayName ?? null,
      ownerIsMe: mineNow,
      takenAt: i.takenAt?.toISOString() ?? null,
      pooled: !!i.ownerRole,
      canTake: canDo(session.activeRole, "work_item.take") && worksIt && !mineNow,
      canRelease: mineNow && !!i.ownerRole,
      canFinish: canDo(session.activeRole, "work_item.complete") && (mineNow || (!i.ownerUserId && worksIt)) && !(selfClosing && (liveShift || !!shift || alertKind(i.title) === "licence")),
      closesItself: selfClosing && (liveShift || !!shift || alertKind(i.title) === "licence"),
      needsNote: alertKind(i.title) === "missed",
    };
  });

  const tabs = [
    { id: "", label: "Mine", title: `Yours, and ${mine.label}'s that nobody has taken` },
    ...visible.map((d) => ({ id: d.id, label: d.label, title: `Everything for ${d.label}` })),
    ...(oversees ? [{ id: "all", label: "Everything", title: "Every open task in the platform" }] : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={view === "department" ? `${dept!.label} tasks` : view === "everything" ? "All tasks" : "My tasks"}
        description="Alerts first, then what is overdue. Take a task so the other desks can see it is handled; open it to go straight to where it is done. Alerts close themselves once the thing is put right."
      />
      <TaskList rows={rows} tabs={tabs} active={view === "everything" ? "all" : view === "department" ? dept!.id : ""} myDepartment={mine.label} />
    </div>
  );
}
