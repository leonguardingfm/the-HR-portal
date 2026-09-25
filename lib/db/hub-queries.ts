/**
 * What the Performance hub shows (Control, 25 September 2026): the board —
 * the tiles, the attention line and the list — one task in full, and the
 * notifications for the top-right corner. Every read is limited to the
 * departments the person works; nobody's performance figures are here.
 */

import { CLOSED, DEPARTMENT_ROLES, IN_HAND, WAITING, currentClock, departmentsOf, needsAttention, taskRef, type HubDepartment, type HubPriority, type HubStatus } from "@/lib/core/hub";
import { ukDate, ukInstant } from "@/lib/core/rota";
import type { Role } from "@/lib/types";
import { db } from "./client";
import { officeHoursFor, slaPolicy } from "./hub";

export type HubTab = "all" | "mine" | "unassigned" | "attention" | "waiting" | "closed";

/** The most open and closed-today tasks read at once; beyond that the board says so rather than hiding them. */
const OPEN_CAP = 1000;
const CLOSED_CAP = 500;

const rowInclude = {
  mailbox: { select: { address: true, displayName: true, mode: true, officeHoursOnly: true } },
  owner: { select: { id: true, displayName: true } },
  client: { select: { name: true } },
  site: { select: { name: true } },
} as const;

type RowTask = Awaited<ReturnType<typeof db.hubTask.findMany<{ include: typeof rowInclude }>>>[number];

function toRow(t: RowTask, me: string, names: Map<string, string>) {
  return {
    id: t.id,
    ref: taskRef(t),
    source: t.source,
    subject: t.subject,
    summary: t.summary,
    sender: t.senderName ?? t.senderAddress ?? null,
    mailbox: t.mailbox?.displayName ?? null,
    test: t.test,
    department: t.department as HubDepartment,
    category: t.category,
    categoryNote: t.categoryNote,
    priority: t.priority as HubPriority,
    status: t.status as HubStatus,
    owner: t.owner ? { id: t.owner.id, name: t.owner.displayName } : null,
    ownerIsMe: t.ownerUserId === me,
    suggestedOwner: t.suggestedOwnerId ? (names.get(t.suggestedOwnerId) ?? null) : null,
    client: t.client?.name ?? null,
    site: t.site?.name ?? null,
    receivedAt: t.receivedAt.toISOString(),
    ackDueAt: t.ackDueAt.toISOString(),
    actionDueAt: t.actionDueAt.toISOString(),
    updateDueAt: t.updateDueAt?.toISOString() ?? null,
    followUpAt: t.followUpAt?.toISOString() ?? null,
    firstActionAt: t.firstActionAt?.toISOString() ?? null,
    nextAction: t.nextAction,
    nextActionAt: t.nextActionAt?.toISOString() ?? null,
    waitingFor: t.waitingFor,
    completedAt: t.completedAt?.toISOString() ?? null,
    outcome: t.outcome,
    withinSla: t.withinSla,
    breaches: t.breaches,
    needsReview: t.needsReview,
    handoverNeededAt: t.handoverNeededAt?.toISOString() ?? null,
    officeHours: officeHoursFor(t),
  };
}
export type HubRow = ReturnType<typeof toRow>;

const clockInput = (t: RowTask) => ({
  status: t.status,
  priority: t.priority as HubPriority,
  receivedAt: t.receivedAt,
  ackDueAt: t.ackDueAt,
  actionDueAt: t.actionDueAt,
  updateDueAt: t.updateDueAt,
  followUpAt: t.followUpAt,
  firstActionAt: t.firstActionAt,
  withinSla: t.withinSla,
  breaches: t.breaches,
  needsReview: t.needsReview,
  handoverNeededAt: t.handoverNeededAt,
});

/** The people who can take a department's work, and whether they are on shift now. */
export async function hubStaff(departments: HubDepartment[], now = new Date()) {
  const roles = [...new Set(departments.flatMap((d) => DEPARTMENT_ROLES[d]))] as Role[];
  const holders = await db.userRole.findMany({
    where: { role: { in: roles }, revokedAt: null, user: { active: true, status: "active" } },
    select: { role: true, user: { select: { id: true, displayName: true, sessions: { where: { signedOutAt: null, lastSeenAt: { gt: new Date(now.getTime() - 20 * 60_000) } }, select: { id: true }, take: 1 } } } },
  });
  const byId = new Map<string, { id: string; name: string; onShift: boolean; departments: HubDepartment[] }>();
  for (const h of holders) {
    const d = (Object.keys(DEPARTMENT_ROLES) as HubDepartment[]).filter((x) => DEPARTMENT_ROLES[x].includes(h.role));
    const cur = byId.get(h.user.id) ?? { id: h.user.id, name: h.user.displayName, onShift: h.user.sessions.length > 0, departments: [] };
    cur.departments = [...new Set([...cur.departments, ...d])];
    byId.set(h.user.id, cur);
  }
  return [...byId.values()].sort((a, b) => Number(b.onShift) - Number(a.onShift) || a.name.localeCompare(b.name));
}

export async function getHubBoard(session: { userId: string; activeRole: Role }, opts: { tab: HubTab; department: string | null; q: string; priority: string | null }, now = new Date()) {
  const mine = departmentsOf(session.activeRole);
  const depts = opts.department && mine.includes(opts.department as HubDepartment) ? [opts.department as HubDepartment] : mine;
  const todayStart = ukInstant(ukDate(now), "00:00");
  const openWhere = { department: { in: depts }, status: { notIn: CLOSED } };
  const closedWhere = { department: { in: depts }, status: { in: CLOSED }, completedAt: { gte: todayStart } };
  const [open, closedToday, breachesToday, mailboxes, portalTasks, policy, openTotal, closedTotal] = await Promise.all([
    db.hubTask.findMany({ where: openWhere, include: rowInclude, orderBy: { receivedAt: "desc" }, take: OPEN_CAP }),
    db.hubTask.findMany({ where: closedWhere, include: rowInclude, orderBy: { completedAt: "desc" }, take: CLOSED_CAP }),
    db.hubSlaEvent.findMany({ where: { kind: "breach", at: { gte: todayStart }, task: { department: { in: depts } } }, select: { taskId: true } }),
    db.mailbox.findMany({ where: { active: true, department: { in: depts } }, orderBy: { displayName: "asc" } }),
    db.workItem.count({ where: { state: "open", slaDays: { gt: 0 }, ownerRole: { in: [...new Set(depts.flatMap((d) => DEPARTMENT_ROLES[d]))] as Role[] } } }),
    slaPolicy(),
    db.hubTask.count({ where: openWhere }),
    db.hubTask.count({ where: closedWhere }),
  ]);
  const suggestedIds = [...new Set(open.map((t) => t.suggestedOwnerId).filter((x): x is string => !!x))];
  const names = new Map((await db.user.findMany({ where: { id: { in: suggestedIds } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));

  const attention = open.filter((t) => needsAttention(clockInput(t), now, officeHoursFor(t)));
  const state = (t: RowTask) => currentClock(clockInput(t), now, officeHoursFor(t), policy).state;
  const unassigned = open.filter((t) => t.status === "unassigned");
  const myOpen = open.filter((t) => t.ownerUserId === session.userId);
  const q = opts.q.trim().toLowerCase();
  const pick = (list: RowTask[]) =>
    list
      .filter((t) => !opts.priority || t.priority === opts.priority)
      .filter((t) => !q || [t.subject, t.senderName, t.senderAddress, taskRef(t), t.client?.name, t.site?.name, t.owner?.displayName].some((v) => (v ?? "").toLowerCase().includes(q)));
  const list =
    opts.tab === "mine" ? myOpen : opts.tab === "unassigned" ? unassigned : opts.tab === "attention" ? attention : opts.tab === "waiting" ? open.filter((t) => WAITING.includes(t.status as HubStatus)) : opts.tab === "closed" ? closedToday : open;
  // Most urgent first: over time, then critical and unowned, then by priority and age.
  const rank = (t: RowTask) => {
    const s = state(t);
    const p = ["critical", "very_high", "high", "medium", "low"].indexOf(t.priority);
    return (s === "breached" ? 0 : 20) + (t.status === "unassigned" ? 0 : 10) + p;
  };
  const rows = pick(list)
    .sort((a, b) => (opts.tab === "closed" ? 0 : rank(a) - rank(b) || a.receivedAt.getTime() - b.receivedAt.getTime()))
    .map((t) => toRow(t, session.userId, names));
  // Completed means done: duplicates, cancellations and test resets are not "completed".
  const completed = closedToday.filter((t) => t.status === "completed");
  const within = completed.filter((t) => t.withinSla).length;
  const oldestUnassigned = unassigned.reduce<Date | null>((o, t) => (!o || t.receivedAt < o ? t.receivedAt : o), null);

  return {
    departments: mine,
    department: opts.department && mine.includes(opts.department as HubDepartment) ? opts.department : null,
    policy,
    rows,
    counts: {
      all: open.length,
      mine: myOpen.length,
      unassigned: unassigned.length,
      attention: attention.length,
      waiting: open.filter((t) => WAITING.includes(t.status as HubStatus)).length,
      closed: closedToday.length,
    },
    tiles: {
      unassigned: unassigned.length,
      oldestUnassignedAt: oldestUnassigned?.toISOString() ?? null,
      myOpen: myOpen.length,
      myDueSoon: myOpen.filter((t) => ["warning", "breached"].includes(state(t))).length,
      breachedToday: new Set(breachesToday.map((b) => b.taskId)).size,
      escalated: open.filter((t) => t.status === "escalated").length,
      completedToday: completed.length,
      withinSlaPct: completed.length ? Math.round((within / completed.length) * 100) : null,
    },
    attentionWhy: {
      criticalUnassigned: unassigned.filter((t) => t.priority === "critical" || t.priority === "very_high").length,
      overdue: open.filter((t) => state(t) === "breached").length,
      review: open.filter((t) => t.needsReview).length,
      handover: open.filter((t) => t.handoverNeededAt).length,
      escalated: open.filter((t) => t.status === "escalated").length,
    },
    mailboxes: mailboxes.map((m) => ({ id: m.id, address: m.address, name: m.displayName, mode: m.mode, department: m.department, lastSyncAt: m.lastSyncAt?.toISOString() ?? null, lastSyncError: m.lastSyncError })),
    portalTasks,
    capped: { open: openTotal > open.length ? { shown: open.length, total: openTotal } : null, closed: closedTotal > closedToday.length ? { shown: closedToday.length, total: closedTotal } : null },
  };
}
export type HubBoard = Awaited<ReturnType<typeof getHubBoard>>;

/** One task, in full: the email as it came, what was done, and every change. */
export async function getHubTask(id: string, session: { userId: string; activeRole: Role }) {
  const t = await db.hubTask.findUnique({
    where: { id },
    include: {
      ...rowInclude,
      person: { select: { id: true, fullName: true } },
      emails: { orderBy: { receivedAt: "asc" }, include: { attachments: true, mailbox: { select: { address: true } } } },
      notes: { orderBy: { at: "asc" }, include: { files: { where: { removedAt: null }, select: { id: true, fileName: true } } } },
      files: { orderBy: { at: "asc" } },
      ownership: { orderBy: { at: "asc" } },
      changes: { orderBy: { at: "asc" } },
      slaEvents: { orderBy: { at: "asc" } },
    },
  });
  if (!t || !departmentsOf(session.activeRole).includes(t.department as HubDepartment)) return null;
  const events = await db.event.findMany({ where: { hubTaskId: t.id }, orderBy: { at: "asc" }, select: { id: true, at: true, type: true, detail: true, actorUserId: true, actorSystem: true } });
  const userIds = new Set<string>([
    ...t.notes.map((n) => n.byUserId),
    ...t.files.map((f) => f.uploadedById),
    ...t.ownership.flatMap((o) => [o.toUserId, o.byUserId, o.fromUserId ?? ""]),
    ...t.changes.map((c) => c.byUserId),
    ...events.map((e) => e.actorUserId ?? ""),
    t.suggestedOwnerId ?? "",
    t.completedById ?? "",
    t.reviewedById ?? "",
    t.createdById ?? "",
    session.userId,
  ]);
  const names = new Map((await db.user.findMany({ where: { id: { in: [...userIds].filter(Boolean) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  const name = (id: string | null | undefined) => (id ? (names.get(id) ?? "someone") : null);
  const superseded = new Set(t.notes.map((n) => n.replacesId).filter(Boolean));
  const [staff, policy, clients, templates] = await Promise.all([
    hubStaff([t.department as HubDepartment]),
    slaPolicy(),
    db.client.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sites: { where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } } } }),
    db.replyTemplate.findMany({ where: { active: true }, orderBy: { title: "asc" }, select: { id: true, category: true, title: true, body: true } }),
  ]);
  return {
    ...toRow(t, session.userId, names),
    meName: name(session.userId) ?? "",
    clientUpdate: t.clientUpdate,
    clientUpdateAt: t.clientUpdateAt?.toISOString() ?? null,
    requiredAction: t.requiredAction,
    senderName: t.senderName,
    senderAddress: t.senderAddress,
    person: t.person ? { id: t.person.id, name: t.person.fullName } : null,
    ai: { category: t.aiCategory, priority: t.aiPriority, confidence: t.aiConfidence, reasons: t.aiReasons, model: t.aiModel, reviewedBy: name(t.reviewedById), reviewedAt: t.reviewedAt?.toISOString() ?? null },
    acceptedAt: t.acceptedAt?.toISOString() ?? null,
    firstResponseAt: t.firstResponseAt?.toISOString() ?? null,
    lastUpdateAt: t.lastUpdateAt?.toISOString() ?? null,
    waitingReason: t.waitingReason,
    followUpEvidence: t.followUpEvidence,
    escalationNote: t.escalationNote,
    outcomeReason: t.outcomeReason,
    correctiveAction: t.correctiveAction,
    completedBy: name(t.completedById),
    createdBy: name(t.createdById),
    updatedBy: name(t.updatedById),
    conversationId: t.conversationId,
    emails: t.emails.map((e) => ({
      id: e.id,
      at: e.receivedAt.toISOString(),
      from: e.fromName ? `${e.fromName} <${e.fromAddress}>` : e.fromAddress,
      to: e.toAddresses.join(", "),
      cc: e.ccAddresses.join(", "),
      mailbox: e.mailbox.address,
      subject: e.subject,
      body: e.bodyText,
      webLink: e.webLink,
      attachments: e.attachments.map((a) => ({ id: a.id, name: a.name, size: a.sizeBytes })),
    })),
    notes: t.notes.map((n) => ({ id: n.id, kind: n.kind, text: n.text, by: name(n.byUserId), byMe: n.byUserId === session.userId, at: n.at.toISOString(), superseded: superseded.has(n.id), edited: !!n.replacesId, files: n.files })),
    files: t.files.map((f) => ({ id: f.id, name: f.fileName, size: f.sizeBytes, by: name(f.uploadedById), byMe: f.uploadedById === session.userId, at: f.at.toISOString(), removed: f.removedAt ? { at: f.removedAt.toISOString(), by: name(f.removedById), reason: f.removedReason } : null })),
    ownership: t.ownership.map((o) => ({ kind: o.kind, from: name(o.fromUserId), to: name(o.toUserId), by: name(o.byUserId), reason: o.reason, at: o.at.toISOString() })),
    changes: t.changes.map((c) => ({ field: c.field, from: c.fromValue, to: c.toValue, reason: c.reason, by: name(c.byUserId), at: c.at.toISOString() })),
    sla: t.slaEvents.map((s) => ({ clock: s.clock, kind: s.kind, dueAt: s.dueAt.toISOString(), at: s.at.toISOString() })),
    history: events.map((e) => ({ id: e.id, at: e.at.toISOString(), type: e.type, detail: e.detail, by: e.actorUserId ? name(e.actorUserId) : "Portal" })),
    staff: staff.filter((s) => s.id !== t.ownerUserId),
    policy,
    clients: clients.map((c) => ({ id: c.id, name: c.name, sites: c.sites })),
    // This task's category first, then the rest, so the likeliest wording is at the top.
    templates: [...templates.filter((x) => x.category === t.category), ...templates.filter((x) => x.category !== t.category)],
  };
}
export type HubTaskFull = NonNullable<Awaited<ReturnType<typeof getHubTask>>>;

/** The notifications for the top-right corner: this person's, their role's, and their departments'. */
export async function getHubNotices(session: { userId: string; activeRole: Role }, now = new Date()) {
  const depts = session.activeRole === "top_management" || session.activeRole === "auditor" ? [] : departmentsOf(session.activeRole);
  const rows = await db.hubNotice.findMany({
    where: { at: { gt: new Date(now.getTime() - 3 * 3_600_000) }, OR: [{ toUserId: session.userId }, { toRole: session.activeRole }, ...(depts.length ? [{ department: { in: depts }, toUserId: null, toRole: null }] : [])] },
    orderBy: { seq: "desc" },
    take: 30,
    select: { seq: true, level: true, text: true, taskId: true, at: true },
  });
  return rows.map((n) => ({ seq: n.seq, level: n.level, text: n.text, href: n.taskId ? `/hub/${n.taskId}` : "/hub", at: n.at.toISOString() }));
}
export type HubNoticeView = Awaited<ReturnType<typeof getHubNotices>>[number];

export { IN_HAND };
