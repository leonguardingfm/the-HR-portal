/**
 * Performance, for the Managing Director (26 September 2026): the company as a
 * whole, each department, and each person — across all the work the portal
 * records, not only emails. Every figure is counted from the records: the hub's
 * tasks and their clocks, the portal's own tasks, and the audit log.
 *
 * Test-inbox tasks are left out unless asked for, so demonstration data never
 * counts against anyone. Times for HR and Accounts are measured in office time,
 * as their clocks are.
 */

import type { Prisma } from "@prisma/client";
import { CLOSED, DEPARTMENT_ROLES, clockMinutesBetween, departmentLabel, outcomeOf, taskRef, type HubDepartment } from "@/lib/core/hub";
import type { Role } from "@/lib/types";
import { db } from "./client";
import { officeHoursFor, slaPolicy } from "./hub";

export interface PerfFilter {
  from: Date;
  to: Date;
  department: HubDepartment | null;
  includeTest: boolean;
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
const inRange = (d: Date | null, f: PerfFilter) => !!d && d >= f.from && d < f.to;
const ACTION_ROLES = [...new Set(Object.values(DEPARTMENT_ROLES).flat())] as Role[];

export interface Kpis {
  received: number;
  closed: number;
  withinSlaPct: number | null;
  avgAccept: number | null;
  avgFirstAction: number | null;
  avgFirstResponse: number | null;
  avgResolution: number | null;
  breaches: number;
  openNow: number;
  overdueNow: number;
  unassignedNow: number;
  portalDone: number;
  portalOverdueNow: number;
}

export async function getPerformance(f: PerfFilter, now = new Date()) {
  await slaPolicy(); // loads the closed days the clocks skip
  const test: Prisma.HubTaskWhereInput = f.includeTest ? {} : { test: false };
  const dept: Prisma.HubTaskWhereInput = f.department ? { department: f.department } : {};
  const deptRoles: Role[] | null = f.department ? (DEPARTMENT_ROLES[f.department] as Role[]) : null;

  const [tasks, openTasks, slaEvents, ownership, portalDone, portalOpen, holders, actions, sessions] = await Promise.all([
    db.hubTask.findMany({
      where: { ...test, ...dept, OR: [{ receivedAt: { gte: f.from, lt: f.to } }, { completedAt: { gte: f.from, lt: f.to } }] },
      include: { mailbox: { select: { officeHoursOnly: true } }, client: { select: { name: true } }, owner: { select: { displayName: true } } },
    }),
    db.hubTask.findMany({ where: { ...test, ...dept, status: { notIn: CLOSED } }, select: { department: true, status: true, ackDueAt: true, actionDueAt: true, updateDueAt: true, firstActionAt: true, followUpAt: true } }),
    db.hubSlaEvent.findMany({ where: { kind: "breach", at: { gte: f.from, lt: f.to }, task: { ...test, ...dept } }, select: { taskId: true, clock: true, ownerUserId: true } }),
    db.hubOwnership.findMany({ where: { at: { gte: f.from, lt: f.to }, task: { ...test, ...dept } }, select: { kind: true, fromUserId: true, toUserId: true, byUserId: true, reason: true, at: true, task: { select: { id: true, number: true, source: true, subject: true } } }, orderBy: { at: "desc" } }),
    db.workItem.findMany({ where: { state: "done", doneAt: { gte: f.from, lt: f.to }, ownerUserId: { not: null }, ...(deptRoles ? { ownerRole: { in: deptRoles } } : { ownerRole: { not: null } }) }, select: { ownerUserId: true, ownerRole: true, createdAt: true, doneAt: true, dueAt: true } }),
    db.workItem.findMany({ where: { state: { in: ["open", "blocked"] }, ...(deptRoles ? { ownerRole: { in: deptRoles } } : { ownerRole: { not: null } }) }, select: { dueAt: true, state: true, ownerRole: true } }),
    db.userRole.findMany({ where: { role: { in: deptRoles ?? ACTION_ROLES }, revokedAt: null, user: { active: true, status: "active" } }, select: { role: true, user: { select: { id: true, displayName: true } } } }),
    db.event.groupBy({ by: ["actorUserId"], where: { at: { gte: f.from, lt: f.to }, actorUserId: { not: null }, NOT: { type: { startsWith: "session." } } }, _count: true }),
    db.workSession.groupBy({ by: ["userId"], _max: { lastSeenAt: true } }),
  ]);

  const office = (t: (typeof tasks)[number]) => officeHoursFor(t);
  const mins = (t: (typeof tasks)[number], a: Date | null, b: Date | null) => (a && b ? clockMinutesBetween(a, b, office(t)) : null);
  const received = tasks.filter((t) => inRange(t.receivedAt, f));
  const closed = tasks.filter((t) => inRange(t.completedAt, f));
  const measured = closed.filter((t) => t.status === "completed" && t.outcome !== "duplicate_or_mistake");

  const overdue = (t: (typeof openTasks)[number]) => {
    if (t.status === "unassigned") return now > t.ackDueAt;
    if (!t.firstActionAt) return now > t.actionDueAt;
    if (["awaiting_information", "awaiting_client", "awaiting_officer"].includes(t.status) && t.followUpAt && now < t.followUpAt) return false;
    return !!t.updateDueAt && now > t.updateDueAt;
  };

  const kpis = (rec: typeof tasks, clo: typeof tasks, breaches: number, open: typeof openTasks, done: typeof portalDone, pOpen: typeof portalOpen): Kpis => {
    const meas = clo.filter((t) => t.status === "completed" && t.outcome !== "duplicate_or_mistake");
    return {
      received: rec.length,
      closed: clo.length,
      withinSlaPct: pct(meas.filter((t) => t.withinSla).length, meas.length),
      avgAccept: avg(rec.map((t) => mins(t, t.receivedAt, t.acceptedAt)).filter((x): x is number => x !== null)),
      avgFirstAction: avg(rec.map((t) => mins(t, t.receivedAt, t.firstActionAt)).filter((x): x is number => x !== null)),
      avgFirstResponse: avg(rec.map((t) => mins(t, t.receivedAt, t.firstResponseAt)).filter((x): x is number => x !== null)),
      avgResolution: avg(clo.map((t) => mins(t, t.receivedAt, t.completedAt)).filter((x): x is number => x !== null)),
      breaches,
      openNow: open.length,
      overdueNow: open.filter(overdue).length,
      unassignedNow: open.filter((t) => t.status === "unassigned").length,
      portalDone: done.length,
      portalOverdueNow: pOpen.filter((w) => w.state !== "blocked" && w.dueAt < now).length,
    };
  };

  // Departments — the whole company, or the one asked for.
  const depts = (f.department ? [f.department] : (Object.keys(DEPARTMENT_ROLES) as HubDepartment[])).map((d) => {
    const roles = DEPARTMENT_ROLES[d];
    return {
      id: d,
      label: departmentLabel(d),
      kpis: kpis(
        received.filter((t) => t.department === d),
        closed.filter((t) => t.department === d),
        slaEvents.filter((e) => tasks.find((t) => t.id === e.taskId)?.department === d).length,
        openTasks.filter((t) => t.department === d),
        portalDone.filter((w) => w.ownerRole && roles.includes(w.ownerRole)),
        portalOpen.filter((w) => w.ownerRole && roles.includes(w.ownerRole)),
      ),
      staff: new Set(holders.filter((h) => roles.includes(h.role)).map((h) => h.user.id)).size,
    };
  });

  // People: everyone who works a mailbox or a department's queue.
  const people = new Map<string, { id: string; name: string; roles: Role[] }>();
  for (const h of holders) {
    const p = people.get(h.user.id) ?? { id: h.user.id, name: h.user.displayName, roles: [] };
    p.roles.push(h.role as Role);
    people.set(h.user.id, p);
  }
  const actionsBy = new Map(actions.map((a) => [a.actorUserId, a._count]));
  const lastSeen = new Map(sessions.map((s) => [s.userId, s._max.lastSeenAt]));
  const acceptedIds = (uid: string) => new Set(ownership.filter((o) => o.kind === "accept" && o.toUserId === uid).map((o) => o.task.id));
  const perPerson = [...people.values()].map((p) => {
    const acc = acceptedIds(p.id);
    const accTasks = tasks.filter((t) => acc.has(t.id));
    const closedBy = closed.filter((t) => t.completedById === p.id);
    const measBy = closedBy.filter((t) => t.status === "completed" && t.outcome !== "duplicate_or_mistake");
    const d = (Object.keys(DEPARTMENT_ROLES) as HubDepartment[]).find((x) => p.roles.some((r) => DEPARTMENT_ROLES[x].includes(r)));
    return {
      id: p.id,
      name: p.name,
      department: d ? departmentLabel(d) : "—",
      accepted: acc.size,
      closed: closedBy.length,
      withinSlaPct: pct(measBy.filter((t) => t.withinSla).length, measBy.length),
      avgAccept: avg(accTasks.map((t) => mins(t, t.receivedAt, t.acceptedAt)).filter((x): x is number => x !== null)),
      avgFirstAction: avg(accTasks.map((t) => mins(t, t.receivedAt, t.firstActionAt)).filter((x): x is number => x !== null)),
      avgResolution: avg(closedBy.map((t) => mins(t, t.receivedAt, t.completedAt)).filter((x): x is number => x !== null)),
      breaches: slaEvents.filter((e) => e.ownerUserId === p.id).length,
      handedOut: ownership.filter((o) => o.kind === "handover" && o.fromUserId === p.id).length,
      handedIn: ownership.filter((o) => o.kind === "handover" && o.toUserId === p.id).length,
      reassignedAway: ownership.filter((o) => o.kind === "reassign" && o.fromUserId === p.id).length,
      portalDone: portalDone.filter((w) => w.ownerUserId === p.id).length,
      portalOnTimePct: pct(portalDone.filter((w) => w.ownerUserId === p.id && w.doneAt! <= w.dueAt).length, portalDone.filter((w) => w.ownerUserId === p.id).length),
      actions: actionsBy.get(p.id) ?? 0,
      lastSeen: lastSeen.get(p.id)?.toISOString() ?? null,
    };
  });

  const outcomes = new Map<string, number>();
  for (const t of closed) if (t.outcome) outcomes.set(t.outcome, (outcomes.get(t.outcome) ?? 0) + 1);
  const reasons = closed
    .filter((t) => t.outcomeReason && (t.breaches > 0 || outcomeOf(t.outcome ?? "")?.explain))
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())
    .slice(0, 25)
    .map((t) => ({ id: t.id, ref: taskRef(t), subject: t.subject, owner: t.owner?.displayName ?? null, outcome: outcomeOf(t.outcome ?? "")?.label ?? "—", reason: t.outcomeReason!, corrective: t.correctiveAction, breaches: t.breaches, at: t.completedAt!.toISOString() }));
  const byKey = (key: (t: (typeof tasks)[number]) => string, label: (k: string) => string) => {
    const m = new Map<string, typeof tasks>();
    for (const t of received) m.set(key(t), [...(m.get(key(t)) ?? []), t]);
    return [...m.entries()]
      .map(([k, list]) => {
        const c = list.filter((t) => t.status === "completed" && t.outcome !== "duplicate_or_mistake");
        return { key: k, label: label(k), received: list.length, withinSlaPct: pct(c.filter((t) => t.withinSla).length, c.length), avgResolution: avg(list.map((t) => mins(t, t.receivedAt, t.completedAt)).filter((x): x is number => x !== null)) };
      })
      .sort((a, b) => b.received - a.received);
  };
  const names = new Map([...people.values()].map((p) => [p.id, p.name]));
  const extraIds = [...new Set(ownership.flatMap((o) => [o.fromUserId, o.toUserId, o.byUserId]).filter((x): x is string => !!x && !names.has(x)))];
  for (const u of await db.user.findMany({ where: { id: { in: extraIds } }, select: { id: true, displayName: true } })) names.set(u.id, u.displayName);

  return {
    collective: kpis(received, closed, slaEvents.length, openTasks, portalDone, portalOpen),
    departments: depts,
    people: perPerson,
    outcomes: [...outcomes.entries()].map(([k, n]) => ({ outcome: outcomeOf(k)?.label ?? k, count: n })).sort((a, b) => b.count - a.count),
    reasons,
    movements: {
      handovers: ownership.filter((o) => o.kind === "handover").length,
      reassignments: ownership.filter((o) => o.kind === "reassign").length,
      latest: ownership
        .filter((o) => o.kind !== "accept")
        .slice(0, 15)
        .map((o) => ({ kind: o.kind, from: o.fromUserId ? names.get(o.fromUserId) ?? "—" : "the pool", to: names.get(o.toUserId) ?? "—", by: names.get(o.byUserId) ?? "—", reason: o.reason, at: o.at.toISOString(), taskId: o.task.id, ref: taskRef(o.task), subject: o.task.subject })),
    },
    categories: byKey((t) => t.category, (k) => k.replace(/_/g, " ")),
    priorities: byKey((t) => t.priority, (k) => k.replace(/_/g, " ")),
    clients: byKey((t) => t.client?.name ?? "No client", (k) => k),
    measured: measured.length,
  };
}
export type Performance = Awaited<ReturnType<typeof getPerformance>>;

/** One person, in detail: every task they held in the period, their breaches and moves. */
export async function getPersonPerformance(userId: string, f: PerfFilter) {
  const test: Prisma.HubTaskWhereInput = f.includeTest ? {} : { test: false };
  const [user, ownership, breaches, closedBy, portalDone, actions] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true, roles: { where: { revokedAt: null }, select: { role: true } } } }),
    db.hubOwnership.findMany({ where: { at: { gte: f.from, lt: f.to }, OR: [{ toUserId: userId }, { fromUserId: userId }], task: test }, include: { task: { include: { mailbox: { select: { officeHoursOnly: true } } } } }, orderBy: { at: "desc" } }),
    db.hubSlaEvent.findMany({ where: { ownerUserId: userId, kind: "breach", at: { gte: f.from, lt: f.to }, task: test }, include: { task: { select: { id: true, number: true, source: true, subject: true, outcomeReason: true } } }, orderBy: { at: "desc" } }),
    db.hubTask.findMany({ where: { ...test, completedById: userId, completedAt: { gte: f.from, lt: f.to } }, include: { mailbox: { select: { officeHoursOnly: true } } }, orderBy: { completedAt: "desc" } }),
    db.workItem.findMany({ where: { ownerUserId: userId, state: "done", doneAt: { gte: f.from, lt: f.to } }, select: { title: true, doneAt: true, dueAt: true } }),
    db.event.findMany({ where: { actorUserId: userId, at: { gte: f.from, lt: f.to } }, select: { type: true, at: true } }),
  ]);
  if (!user) return null;
  // Day by day: taken on, closed, breaches.
  const days = new Map<string, { accepted: number; closed: number; breaches: number }>();
  const key = (d: Date) => d.toISOString().slice(0, 10);
  for (let t = new Date(f.from); t < f.to; t = new Date(t.getTime() + 86_400_000)) days.set(key(t), { accepted: 0, closed: 0, breaches: 0 });
  for (const o of ownership) if (o.toUserId === userId && o.kind === "accept") days.get(key(o.at)) && (days.get(key(o.at))!.accepted += 1);
  for (const t of closedBy) days.get(key(t.completedAt!)) && (days.get(key(t.completedAt!))!.closed += 1);
  for (const b of breaches) days.get(key(b.at)) && (days.get(key(b.at))!.breaches += 1);
  const groups = new Map<string, number>();
  for (const e of actions) groups.set(e.type.split(".")[0], (groups.get(e.type.split(".")[0]) ?? 0) + 1);
  return {
    user: { id: user.id, name: user.displayName, roles: user.roles.map((r) => r.role as Role) },
    daily: [...days.entries()].map(([day, v]) => ({ day, ...v })),
    closed: closedBy.map((t) => ({ id: t.id, ref: taskRef(t), subject: t.subject, outcome: outcomeOf(t.outcome ?? "")?.label ?? "—", withinSla: t.withinSla, minutes: Math.round(clockMinutesBetween(t.receivedAt, t.completedAt!, officeHoursFor(t))), at: t.completedAt!.toISOString() })),
    breaches: breaches.map((b) => ({ id: b.task.id, ref: taskRef(b.task), subject: b.task.subject, clock: b.clock, at: b.at.toISOString(), reason: b.task.outcomeReason })),
    moves: ownership.filter((o) => o.kind !== "accept").map((o) => ({ kind: o.kind, out: o.fromUserId === userId, reason: o.reason, at: o.at.toISOString(), ref: taskRef(o.task), id: o.task.id })),
    portal: { done: portalDone.length, onTime: portalDone.filter((w) => w.doneAt! <= w.dueAt).length },
    actionGroups: [...groups.entries()].sort((a, b) => b[1] - a[1]),
  };
}
