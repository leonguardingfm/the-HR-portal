/**
 * The Performance hub's operations (Control, 25 September 2026): an email
 * arriving, and everything a person does to the task it becomes. Not server
 * actions — lib/actions/hub.ts checks who is asking first, and the test inbox
 * and the demonstration call these directly.
 *
 * Every change writes its event in the same transaction, so the task's audit
 * trail cannot disagree with the task.
 */

import type { Prisma, HubTask } from "@prisma/client";
import { ALERT_KIND_SPECS } from "@/lib/core/alerts";
import {
  CLOSED,
  DEPARTMENT_ROLES,
  IN_HAND,
  MANAGER_ROLE,
  REVIEW_BELOW,
  SLA_DEFAULTS,
  SUPERVISOR_ROLES,
  WAITING,
  categoryLabel,
  classifyByRules,
  clocksFor,
  closeProblem,
  criticalWordsIn,
  departmentFor,
  departmentLabel,
  departmentsOf,
  nextUpdateDue,
  outcomeOf,
  parseSpan,
  priorityOf,
  requiredActionFor,
  setClosedDays,
  statusOf,
  taskRef,
  waitingProblem,
  type Clock,
  type HubCategory,
  type HubDepartment,
  type HubPriority,
  type HubStatus,
  type SlaPolicy,
} from "@/lib/core/hub";
import type { Role } from "@/lib/types";
import { db } from "./client";
import { aiAvailable, readWithAi } from "./hub-ai";
import { pushToUsers, usersHolding } from "./push";

export type Actor = { userId: string; role: Role; name: string };
export type HubResult = { ok: true; message: string; taskId?: string } | { ok: false; message: string };
type Tx = Prisma.TransactionClient;

const fail = (message: string): HubResult => ({ ok: false, message });
const done = (message: string, taskId?: string): HubResult => ({ ok: true, message, taskId });

// ---------------------------------------------------------------------------
// Settings, clocks and notices
// ---------------------------------------------------------------------------

/** The agreed clocks, with any a manager has changed in Settings ("hub.sla.low.accept" = "8h"). */
export async function slaPolicy(): Promise<SlaPolicy> {
  const [rows, closed] = await Promise.all([db.setting.findMany({ where: { key: { startsWith: "hub.sla." } } }), db.setting.findUnique({ where: { key: "hub.closed_days" } })]);
  setClosedDays(closed ? (JSON.parse(closed.value) as string[]) : []);
  if (!rows.length) return SLA_DEFAULTS;
  const policy = structuredClone(SLA_DEFAULTS) as SlaPolicy;
  for (const r of rows) {
    const [, , priority, clock] = r.key.split(".");
    const span = parseSpan(r.value);
    if (span && priority in policy && ["accept", "action", "update"].includes(clock)) policy[priority as HubPriority][clock as Clock] = span;
  }
  return policy;
}

/** HR and Accounts keep office hours; the Control Room's clocks never stop. */
export function officeHoursFor(t: { department: string; mailbox?: { officeHoursOnly: boolean } | null }): boolean {
  return t.mailbox ? t.mailbox.officeHoursOnly : t.department !== "control";
}

export async function notify(tx: Tx, n: { taskId?: string | null; level: "info" | "warning" | "critical"; text: string; toUserId?: string | null; toRole?: Role | null; department?: HubDepartment | null }) {
  await tx.hubNotice.create({ data: { taskId: n.taskId ?? null, level: n.level, text: n.text.slice(0, 300), toUserId: n.toUserId ?? null, toRole: n.toRole ?? null, department: n.department ?? null } });
}

function event(tx: Tx, t: { id: string; department: string; personId?: string | null }, type: string, detail: string, actor: Actor | null, payload?: object, at?: Date) {
  return tx.event.create({
    data: {
      ...(at ? { at } : {}),
      type,
      actorUserId: actor?.userId ?? null,
      actorRole: actor?.role ?? null,
      actorSystem: actor ? null : "performance-hub",
      department: t.department as HubDepartment,
      hubTaskId: t.id,
      personId: t.personId ?? null,
      detail: detail.slice(0, 2000),
      payload: payload as Prisma.InputJsonValue | undefined,
    },
  });
}

/** Can this person work this department's tasks? */
function works(actor: Actor, department: string) {
  return departmentsOf(actor.role).includes(department as HubDepartment) && actor.role !== "top_management" && actor.role !== "auditor";
}
const supervises = (actor: Actor, department: string) => works(actor, department) && (SUPERVISOR_ROLES[department as HubDepartment].includes(actor.role) || actor.role === MANAGER_ROLE[department as HubDepartment]);

async function load(taskId: string) {
  return db.hubTask.findUnique({ where: { id: String(taskId) }, include: { mailbox: true, owner: { select: { displayName: true } } } });
}

// ---------------------------------------------------------------------------
// Sorting and matching
// ---------------------------------------------------------------------------

/**
 * Names in the email, matched to our records — exactly, and only where the
 * match is unambiguous. Nothing is filled in on a guess.
 */
export async function matchRecords(text: string, fromAddress: string | null, asWritten: { client?: string | null; site?: string | null; officer?: string | null } = {}) {
  const hay = text.toLowerCase();
  const inText = (name: string) => name.length >= 3 && hay.includes(name.toLowerCase());
  const [clients, officerByEmail] = await Promise.all([
    db.client.findMany({ where: { active: true }, select: { id: true, name: true, sites: { where: { active: true }, select: { id: true, name: true } } } }),
    fromAddress ? db.person.findFirst({ where: { email: { equals: fromAddress, mode: "insensitive" }, employment: { isNot: null } }, select: { id: true } }) : null,
  ]);
  const clientHits = clients.filter((c) => inText(c.name) || (asWritten.client && asWritten.client.toLowerCase().includes(c.name.toLowerCase())));
  const client = clientHits.length === 1 ? clientHits[0] : null;
  const sitePool = client ? client.sites : clients.flatMap((c) => c.sites);
  // "Meridian — Depot 7" is written "Depot 7" once the client is known.
  const short = (name: string) => name.split(/\s+[—–-]\s+/).pop() ?? name;
  const siteHits = sitePool.filter((s) => inText(s.name) || (client && short(s.name).length >= 4 && inText(short(s.name))) || (asWritten.site && [s.name, short(s.name)].some((n) => n.toLowerCase() === asWritten.site!.toLowerCase())));
  const site = siteHits.length === 1 ? siteHits[0] : null;
  let personId = officerByEmail?.id ?? null;
  if (!personId && asWritten.officer && asWritten.officer.trim().split(/\s+/).length >= 2) {
    const named = await db.person.findMany({ where: { fullName: { equals: asWritten.officer.trim(), mode: "insensitive" }, employment: { isNot: null } }, select: { id: true }, take: 2 });
    if (named.length === 1) personId = named[0].id;
  }
  const clientId = client?.id ?? (site ? clients.find((c) => c.sites.some((s) => s.id === site.id))?.id ?? null : null);
  return { clientId, siteId: site?.id ?? null, personId };
}

/** Who should take it: whoever had this conversation before, if on shift; otherwise whoever on shift has least open. */
export async function suggestOwner(department: HubDepartment, conversationId: string | null, now = new Date()): Promise<string | null> {
  const roles = DEPARTMENT_ROLES[department] as Role[];
  const onShift = await db.workSession.findMany({
    where: { signedOutAt: null, lastSeenAt: { gt: new Date(now.getTime() - 15 * 60_000) }, activeRole: { in: roles } },
    select: { userId: true },
  });
  const ids = [...new Set(onShift.map((s) => s.userId))];
  if (!ids.length) return null;
  if (conversationId) {
    const before = await db.hubTask.findFirst({ where: { conversationId, ownerUserId: { in: ids } }, orderBy: { receivedAt: "desc" }, select: { ownerUserId: true } });
    if (before?.ownerUserId) return before.ownerUserId;
  }
  const load = await db.hubTask.groupBy({ by: ["ownerUserId"], where: { ownerUserId: { in: ids }, status: { in: IN_HAND } }, _count: true });
  const count = new Map(load.map((l) => [l.ownerUserId, l._count]));
  return ids.sort((a, b) => (count.get(a) ?? 0) - (count.get(b) ?? 0))[0];
}

// ---------------------------------------------------------------------------
// An email arrives
// ---------------------------------------------------------------------------

export interface IncomingEmail {
  mailboxId: string;
  graphMessageId?: string | null;
  internetMessageId?: string | null;
  conversationId?: string | null;
  webLink?: string | null;
  receivedAt: Date;
  fromName?: string | null;
  fromAddress: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  attachments?: { name: string; mimeType: string; sizeBytes: number; storageKey?: string | null; sha256?: string | null; base64?: string }[];
  /** For the demonstration only: when the arrival is written to the history. Real mail is written as it happens. */
  recordedAt?: Date;
}

/**
 * One email in: kept exactly as it arrived; a reply in a conversation that is
 * still open joins its task; anything else is read, sorted, matched to our
 * records and becomes a task, unassigned, with its clocks running.
 */
export async function ingestEmail(e: IncomingEmail): Promise<{ taskId: string; created: boolean; joined: boolean }> {
  const mailbox = await db.mailbox.findUniqueOrThrow({ where: { id: e.mailboxId } });
  if (e.graphMessageId) {
    const seen = await db.inboundEmail.findUnique({ where: { mailboxId_graphMessageId: { mailboxId: mailbox.id, graphMessageId: e.graphMessageId } } });
    if (seen) return { taskId: seen.taskId, created: false, joined: false };
  }
  const emailRow = (taskId: string) => ({
    mailboxId: mailbox.id,
    taskId,
    graphMessageId: e.graphMessageId ?? null,
    internetMessageId: e.internetMessageId ?? null,
    conversationId: e.conversationId ?? null,
    webLink: e.webLink ?? null,
    receivedAt: e.receivedAt,
    fromName: e.fromName ?? null,
    fromAddress: e.fromAddress,
    toAddresses: e.to,
    ccAddresses: e.cc ?? [],
    subject: e.subject.slice(0, 500),
    bodyText: e.body.slice(0, 200_000),
    hasAttachments: !!e.attachments?.length,
    attachments: e.attachments?.length ? { create: e.attachments.map((a) => ({ name: a.name.slice(0, 200), mimeType: a.mimeType, sizeBytes: a.sizeBytes, storageKey: a.storageKey ?? null, sha256: a.sha256 ?? null })) } : undefined,
  });

  // The same email sent to two of our mailboxes is one piece of work.
  const twin = e.internetMessageId ? await db.inboundEmail.findFirst({ where: { internetMessageId: e.internetMessageId }, select: { taskId: true } }) : null;
  // A reply in a conversation that is still open joins it.
  const thread =
    twin ??
    (e.conversationId
      ? await db.hubTask.findFirst({ where: { conversationId: e.conversationId, mailboxId: mailbox.id, status: { notIn: CLOSED } }, orderBy: { receivedAt: "desc" }, select: { id: true } }).then((t) => (t ? { taskId: t.id } : null))
      : null);
  if (thread) {
    const t = await db.hubTask.findUniqueOrThrow({ where: { id: thread.taskId } });
    await db.$transaction(async (tx) => {
      await tx.inboundEmail.create({ data: emailRow(t.id) });
      await event(tx, t, "hub.email_joined", `${twin ? "The same email arrived at" : "A reply arrived in"} ${mailbox.address} from ${e.fromName ?? e.fromAddress}: “${e.subject}”.`, null);
      if (!twin && mailbox.mode !== "shadow") {
        await notify(tx, t.ownerUserId ? { taskId: t.id, level: "info", text: `New reply on ${taskRef(t)} from ${e.fromName ?? e.fromAddress}`, toUserId: t.ownerUserId } : { taskId: t.id, level: "info", text: `New reply on ${taskRef(t)} (still unassigned)`, department: t.department as HubDepartment });
      }
    });
    return { taskId: t.id, created: false, joined: true };
  }

  // Read it: the AI if there is one, the rules if not — and the rules' critical
  // words always get a say.
  const rules = classifyByRules(e.subject, e.body);
  const ai = aiAvailable()
    ? await readWithAi({ subject: e.subject, body: e.body, from: `${e.fromName ?? ""} <${e.fromAddress}>`, mailbox: `${mailbox.displayName} (${mailbox.address})`, attachments: mailbox.readAttachments ? e.attachments?.filter((a) => a.base64).map((a) => ({ name: a.name, mimeType: a.mimeType, base64: a.base64! })) : undefined })
    : null;
  const reading = ai && !("error" in ai) ? ai : null;
  const category: HubCategory = reading?.category ?? rules.category;
  let priority: HubPriority = reading?.priority ?? rules.priority;
  const reasons = [...(reading?.reasons ?? rules.reasons)];
  let confidence = reading?.confidence ?? rules.confidence;
  let uncertain = reading?.uncertain ?? rules.uncertain;
  const dangerWords = criticalWordsIn(e.subject, e.body);
  if (dangerWords.length && priority !== "critical") {
    // Safety first: a missed emergency costs more than a false alarm.
    reasons.push(`Raised to Critical: it mentions ${dangerWords.slice(0, 3).map((w) => `“${w}”`).join(", ")}. Check and lower it if it is not an emergency.`);
    priority = "critical";
    uncertain = true;
    confidence = Math.min(confidence, 0.6);
  }
  if (ai && "error" in ai) reasons.push(`AI unavailable (${ai.error}) — sorted by the rules.`);
  if (!reading) reasons.push(aiAvailable() ? "" : "Sorted by the rules: no AI key is set.");
  const suggestedDept = reading?.department ?? rules.department ?? departmentFor(category);
  const department = (mailbox.department as HubDepartment) ?? "control";
  if (suggestedDept && suggestedDept !== department) reasons.push(`Looks like ${departmentLabel(suggestedDept)} work — move it if so.`);
  const matched = await matchRecords(`${e.subject}\n${e.body}`, e.fromAddress, { client: reading?.clientAsWritten, site: reading?.siteAsWritten, officer: reading?.officerAsWritten });
  const policy = await slaPolicy();
  const clocks = clocksFor(e.receivedAt, priority, mailbox.officeHoursOnly, policy);
  const suggested = mailbox.mode === "shadow" ? null : await suggestOwner(department, e.conversationId ?? null);
  const needsReview = uncertain || confidence < REVIEW_BELOW;

  const task = await db.$transaction(async (tx) => {
    const t = await tx.hubTask.create({
      data: {
        source: "outlook",
        mailboxId: mailbox.id,
        conversationId: e.conversationId ?? null,
        department,
        subject: e.subject.slice(0, 500) || "(no subject)",
        summary: (reading?.summary || rules.summary || null)?.slice(0, 600) ?? null,
        requiredAction: reading?.requiredAction || requiredActionFor(category),
        senderName: e.fromName ?? null,
        senderAddress: e.fromAddress,
        receivedAt: e.receivedAt,
        category,
        categoryNote: category === "other" ? (reading?.categoryOther ?? "Not one of the usual categories — check") : null,
        priority,
        aiCategory: category,
        aiPriority: priority,
        aiConfidence: confidence,
        aiReasons: reasons.filter(Boolean).join(" · ").slice(0, 1000) || null,
        aiModel: reading?.model ?? "rules",
        needsReview,
        clientId: matched.clientId,
        siteId: matched.siteId,
        personId: matched.personId,
        suggestedOwnerId: suggested,
        ackDueAt: clocks.ackDueAt,
        actionDueAt: clocks.actionDueAt,
        test: mailbox.mode === "test",
      },
    });
    await tx.inboundEmail.create({ data: emailRow(t.id) });
    await event(tx, t, "hub.email_received", `${taskRef(t)}: email from ${e.fromName ?? e.fromAddress} to ${mailbox.address} — “${t.subject}”. Sorted as ${categoryLabel(category)}, ${priorityOf(priority).label}${needsReview ? ", for a person to check" : ""} (${reading ? reading.model : "rules"}, confidence ${Math.round(confidence * 100)}%).`, null, { category, priority, confidence, model: reading?.model ?? "rules", ms: reading?.ms ?? null }, e.recordedAt);
    if (mailbox.mode !== "shadow") await announce(tx, t, e.fromName ?? e.fromAddress);
    return t;
  });
  if (mailbox.mode !== "shadow" && priority === "critical") await pushCritical(task);
  return { taskId: task.id, created: true, joined: false };
}

/** A new task: the department is told; a critical one sounds the Control Room's alarm and reaches the manager. */
async function announce(tx: Tx, t: HubTask, from: string) {
  const p = priorityOf(t.priority);
  await notify(tx, { taskId: t.id, level: t.priority === "critical" ? "critical" : t.priority === "very_high" ? "warning" : "info", text: `${p.label}: ${t.subject} — ${taskRef(t)} from ${from}`, department: t.department as HubDepartment });
  if (t.priority !== "critical") return;
  await tx.workItem.create({ data: { title: `${ALERT_KIND_SPECS.hub_critical.prefix}: ${t.subject} (${taskRef(t)}) — accept it now`, hubTaskId: t.id, ownerRole: "control", dueAt: new Date(), slaDays: 0 } });
  const manager = MANAGER_ROLE[t.department as HubDepartment] as Role;
  await notify(tx, { taskId: t.id, level: "critical", text: `Critical email ${taskRef(t)}: ${t.subject}`, toRole: manager });
  if (t.department !== "control") await notify(tx, { taskId: t.id, level: "critical", text: `Critical email to ${departmentLabel(t.department)}: ${t.subject} — ${taskRef(t)}`, department: "control" });
}

async function pushCritical(t: HubTask) {
  const manager = MANAGER_ROLE[t.department as HubDepartment] as Role;
  const ids = await usersHolding([manager]);
  if (ids.length) await pushToUsers(ids, { title: `Critical email ${taskRef(t)}`, body: t.subject, url: `/hub/${t.id}`, tag: `hub-${t.id}`, urgent: true }).catch(() => {});
}

// ---------------------------------------------------------------------------
// What people do
// ---------------------------------------------------------------------------

/** A breach the sweep has not got to yet is recorded when the late thing happens. */
async function lateBreach(tx: Tx, t: HubTask, clock: Clock, dueAt: Date, now: Date) {
  if (now <= dueAt) return 0;
  const r = await tx.hubSlaEvent.createMany({ data: [{ taskId: t.id, clock, kind: "breach", dueAt, at: now, ownerUserId: t.ownerUserId }], skipDuplicates: true });
  if (r.count) await tx.hubTask.update({ where: { id: t.id }, data: { breaches: { increment: 1 } } });
  return r.count;
}

export async function acceptTask(taskId: string, actor: Actor, now = new Date()): Promise<HubResult> {
  const t = await load(taskId);
  if (!t) return fail("That task no longer exists.");
  if (!works(actor, t.department)) return fail(`${departmentLabel(t.department)} works this one.`);
  if (t.status !== "unassigned") return fail(t.owner ? `${t.owner.displayName} is already handling it.` : "It is already closed.");
  // Two people pressing Accept at once: exactly one wins.
  const won = await db.$transaction(async (tx) => {
    const r = await tx.hubTask.updateMany({ where: { id: t.id, status: "unassigned", ownerUserId: null }, data: { status: "accepted", ownerUserId: actor.userId, acceptedAt: now, updatedById: actor.userId, handoverNeededAt: null } });
    if (!r.count) return false;
    await tx.hubOwnership.create({ data: { taskId: t.id, kind: "accept", toUserId: actor.userId, byUserId: actor.userId, at: now } });
    await lateBreach(tx, t, "accept", t.ackDueAt, now);
    await tx.workItem.updateMany({ where: { hubTaskId: t.id, state: "open" }, data: { state: "done", doneAt: now } });
    await event(tx, t, "hub.accepted", `${actor.name} accepted ${taskRef(t)}${now > t.ackDueAt ? ` — after its ${Math.round((now.getTime() - t.receivedAt.getTime()) / 60_000)}-minute wait` : ""}.`, actor, undefined, now);
    return true;
  });
  if (!won) {
    const again = await load(taskId);
    return fail(again?.owner ? `${again.owner.displayName} took it a moment ago.` : "Someone took it a moment ago.");
  }
  return done(`${taskRef(t)} is yours. Record the action taken within the time on the clock.`, t.id);
}

export async function recordNote(taskId: string, actor: Actor, d: { kind: "note" | "action" | "response"; text: string; nextAction?: string | null; nextActionAt?: Date | null }, now = new Date()): Promise<HubResult & { noteId?: string }> {
  const t = await load(taskId);
  if (!t) return fail("That task no longer exists.");
  if (!works(actor, t.department)) return fail(`${departmentLabel(t.department)} works this one.`);
  if (CLOSED.includes(t.status as HubStatus)) return fail("It is closed. Open a new task if there is more to do.");
  const text = d.text.trim().slice(0, 4000);
  if (text.length < 3) return fail("Write what was done.");
  if (d.kind !== "note" && t.ownerUserId !== actor.userId) return fail(t.ownerUserId ? `${t.owner?.displayName} owns it — add a note, or ask for it to be handed to you.` : "Accept it first.");
  if (d.nextActionAt && d.nextActionAt <= now) return fail("The next action is in the future.");
  const counts = d.kind !== "note";
  const policy = await slaPolicy();
  const office = officeHoursFor(t);
  const noteId = await db.$transaction(async (tx) => {
    const n = await tx.hubNote.create({ data: { taskId: t.id, kind: d.kind, text, byUserId: actor.userId, at: now } });
    await tx.hubTask.update({
      where: { id: t.id },
      data: {
        ...(counts
          ? {
              firstActionAt: t.firstActionAt ?? now,
              ...(d.kind === "response" ? { firstResponseAt: t.firstResponseAt ?? now } : {}),
              lastUpdateAt: now,
              updateDueAt: WAITING.includes(t.status as HubStatus) ? t.updateDueAt : nextUpdateDue(now, t.priority as HubPriority, office, policy),
              status: t.status === "accepted" ? "in_progress" : t.status,
            }
          : {}),
        ...(d.nextAction !== undefined ? { nextAction: d.nextAction?.trim() || null, nextActionAt: d.nextActionAt ?? null } : {}),
        updatedById: actor.userId,
      },
    });
    if (counts && !t.firstActionAt) await lateBreach(tx, t, "action", t.actionDueAt, now);
    await event(tx, t, `hub.${d.kind}`, `${actor.name} — ${d.kind === "action" ? "action taken" : d.kind === "response" ? "responded to the sender" : "note"} on ${taskRef(t)}: ${text}${d.nextAction ? ` · Next: ${d.nextAction}${d.nextActionAt ? ` by ${d.nextActionAt.toISOString()}` : ""}` : ""}`, actor, undefined, now);
    return n.id;
  });
  return { ...done(counts ? "Recorded. The update clock starts again." : "Note added."), noteId };
}

/** A note corrected: the new version replaces the old, which stays. */
export async function editNote(noteId: string, actor: Actor, text: string): Promise<HubResult> {
  const n = await db.hubNote.findUnique({ where: { id: String(noteId) }, include: { task: true, newer: { select: { id: true } } } });
  if (!n) return fail("That note no longer exists.");
  if (n.byUserId !== actor.userId) return fail("Only whoever wrote a note can correct it.");
  if (n.newer) return fail("That note has already been corrected — correct the latest version.");
  const clean = text.trim().slice(0, 4000);
  if (clean.length < 3 || clean === n.text) return fail("Nothing has changed.");
  await db.$transaction(async (tx) => {
    await tx.hubNote.create({ data: { taskId: n.taskId, kind: n.kind, text: clean, byUserId: actor.userId, replacesId: n.id } });
    await event(tx, n.task, "hub.note_edited", `${actor.name} corrected a note on ${taskRef(n.task)}. Was: “${n.text.slice(0, 300)}”. Now: “${clean.slice(0, 300)}”.`, actor);
  });
  return done("Corrected. The earlier version is kept in the history.");
}

export async function setWaiting(taskId: string, actor: Actor, d: { status: string; reason: string; waitingFor: string; followUpAt: Date | null; evidence: string }, now = new Date()): Promise<HubResult> {
  const t = await load(taskId);
  if (!t) return fail("That task no longer exists.");
  if (t.ownerUserId !== actor.userId) return fail("Only its owner puts it on hold.");
  const problem = waitingProblem(d, now);
  if (problem) return fail(problem);
  await db.$transaction(async (tx) => {
    await tx.hubTask.update({
      where: { id: t.id },
      data: { status: d.status as HubStatus, waitingReason: d.reason.trim(), waitingFor: d.waitingFor.trim(), followUpAt: d.followUpAt!, followUpEvidence: d.evidence.trim(), firstActionAt: t.firstActionAt ?? now, lastUpdateAt: now, updateDueAt: null, updatedById: actor.userId },
    });
    await tx.hubNote.create({ data: { taskId: t.id, kind: "follow_up", text: `${statusOf(d.status).label}: ${d.reason.trim()} — waiting on ${d.waitingFor.trim()}. Last done: ${d.evidence.trim()}`, byUserId: actor.userId, at: now } });
    if (!t.firstActionAt) await lateBreach(tx, t, "action", t.actionDueAt, now);
    await event(tx, t, "hub.waiting", `${actor.name} set ${taskRef(t)} to ${statusOf(d.status).label}: ${d.reason.trim()}; waiting on ${d.waitingFor.trim()}; follow up ${d.followUpAt!.toISOString()}. Last follow-up: ${d.evidence.trim()}`, actor, undefined, now);
  });
  return done(`On hold until ${d.followUpAt!.toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" })}. The update clock stops until then.`);
}

export async function followUp(taskId: string, actor: Actor, d: { evidence: string; followUpAt: Date | null }, now = new Date()): Promise<HubResult> {
  const t = await load(taskId);
  if (!t) return fail("That task no longer exists.");
  if (t.ownerUserId !== actor.userId) return fail("Only its owner records the follow-up.");
  if (!WAITING.includes(t.status as HubStatus)) return fail("It is not waiting on anyone.");
  if (d.evidence.trim().length < 3) return fail("Say what was done to chase it.");
  if (!d.followUpAt || d.followUpAt <= now) return fail("Give the next follow-up date and time.");
  await db.$transaction(async (tx) => {
    await tx.hubTask.update({ where: { id: t.id }, data: { followUpAt: d.followUpAt!, followUpEvidence: d.evidence.trim(), lastUpdateAt: now, updateDueAt: null, updatedById: actor.userId } });
    await tx.hubNote.create({ data: { taskId: t.id, kind: "follow_up", text: `Followed up: ${d.evidence.trim()}`, byUserId: actor.userId, at: now } });
    await event(tx, t, "hub.follow_up", `${actor.name} followed up ${taskRef(t)}: ${d.evidence.trim()}. Next follow-up ${d.followUpAt!.toISOString()}.`, actor, undefined, now);
  });
  return done("Follow-up recorded.");
}

/** Back to work: off hold, or down from escalated. */
export async function resume(taskId: string, actor: Actor, now = new Date()): Promise<HubResult> {
  const t = await load(taskId);
  if (!t) return fail("That task no longer exists.");
  if (t.ownerUserId !== actor.userId && !supervises(actor, t.department)) return fail("Only its owner or the supervisor does that.");
  if (![...WAITING, "escalated"].includes(t.status as HubStatus)) return fail("It is already in progress.");
  const policy = await slaPolicy();
  await db.$transaction(async (tx) => {
    await tx.hubTask.update({ where: { id: t.id }, data: { status: "in_progress", waitingReason: null, waitingFor: null, followUpAt: null, followUpEvidence: null, lastUpdateAt: now, updateDueAt: nextUpdateDue(now, t.priority as HubPriority, officeHoursFor(t), policy), updatedById: actor.userId } });
    await event(tx, t, "hub.resumed", `${actor.name} put ${taskRef(t)} back in progress (was ${statusOf(t.status).label}).`, actor, undefined, now);
  });
  return done("Back in progress.");
}

export async function escalate(taskId: string, actor: Actor, note: string, now = new Date()): Promise<HubResult> {
  const t = await load(taskId);
  if (!t) return fail("That task no longer exists.");
  if (t.ownerUserId !== actor.userId && !supervises(actor, t.department)) return fail("Only its owner or the supervisor escalates it.");
  if (note.trim().length < 3) return fail("Say why it is being escalated.");
  if (CLOSED.includes(t.status as HubStatus) || t.status === "unassigned") return fail("Accept it first.");
  const policy = await slaPolicy();
  await db.$transaction(async (tx) => {
    await tx.hubTask.update({ where: { id: t.id }, data: { status: "escalated", escalatedAt: now, escalationNote: note.trim(), firstActionAt: t.firstActionAt ?? now, lastUpdateAt: now, updateDueAt: nextUpdateDue(now, t.priority as HubPriority, officeHoursFor(t), policy), updatedById: actor.userId } });
    for (const role of [...SUPERVISOR_ROLES[t.department as HubDepartment], MANAGER_ROLE[t.department as HubDepartment]]) {
      await notify(tx, { taskId: t.id, level: "warning", text: `${actor.name} escalated ${taskRef(t)}: ${note.trim()}`, toRole: role as Role });
    }
    await event(tx, t, "hub.escalated", `${actor.name} escalated ${taskRef(t)}: ${note.trim()}`, actor, undefined, now);
  });
  return done("Escalated. The supervisor and manager have been told.");
}

export async function setNextAction(taskId: string, actor: Actor, text: string, at: Date | null, now = new Date()): Promise<HubResult> {
  const t = await load(taskId);
  if (!t) return fail("That task no longer exists.");
  if (t.ownerUserId !== actor.userId) return fail("Only its owner sets the next action.");
  if (text.trim().length < 3) return fail("Say what happens next.");
  if (!at || at <= now) return fail("Give when — a time in the future.");
  await db.$transaction(async (tx) => {
    await tx.hubTask.update({ where: { id: t.id }, data: { nextAction: text.trim().slice(0, 300), nextActionAt: at, updatedById: actor.userId } });
    await event(tx, t, "hub.next_action", `${actor.name} set the next action on ${taskRef(t)}: ${text.trim()} by ${at.toISOString()}.`, actor, undefined, now);
  });
  return done("Next action set.");
}

// ---------------------------------------------------------------------------
// Corrections — kept, with what they were
// ---------------------------------------------------------------------------

export async function changeCategory(taskId: string, actor: Actor, d: { category: string; note: string; reason: string }): Promise<HubResult> {
  const t = await load(taskId);
  if (!t) return fail("That task no longer exists.");
  if (!works(actor, t.department)) return fail(`${departmentLabel(t.department)} works this one.`);
  const cat = d.category as HubCategory;
  if (!categoryLabel(cat) || cat === (t.category as HubCategory) && (cat !== "other" || d.note.trim() === (t.categoryNote ?? ""))) return fail("Choose a different category.");
  if (cat === "other" && d.note.trim().length < 3) return fail("Say what it is — “Other” needs a few words.");
  await db.$transaction(async (tx) => {
    await tx.hubTask.update({ where: { id: t.id }, data: { category: cat, categoryNote: cat === "other" ? d.note.trim().slice(0, 200) : null, needsReview: false, reviewedAt: new Date(), reviewedById: actor.userId, updatedById: actor.userId } });
    await tx.hubChange.create({ data: { taskId: t.id, field: "category", fromValue: t.category, toValue: cat === "other" ? `other: ${d.note.trim()}` : cat, reason: d.reason.trim() || null, byUserId: actor.userId } });
    await event(tx, t, "hub.category_corrected", `${actor.name} changed ${taskRef(t)} from ${categoryLabel(t.category)} to ${cat === "other" ? `Other (${d.note.trim()})` : categoryLabel(cat)}${t.aiCategory ? ` — first sorted as ${categoryLabel(t.aiCategory)}` : ""}.${d.reason.trim() ? ` ${d.reason.trim()}` : ""}`, actor);
  });
  return done("Category corrected.");
}

export async function changePriority(taskId: string, actor: Actor, d: { priority: string; reason: string }, now = new Date()): Promise<HubResult> {
  const t = await load(taskId);
  if (!t) return fail("That task no longer exists.");
  if (!works(actor, t.department)) return fail(`${departmentLabel(t.department)} works this one.`);
  const p = d.priority as HubPriority;
  if (!priorityOf(p) || p === t.priority) return fail("Choose a different priority.");
  if (d.reason.trim().length < 3) return fail("Say why the priority is changing.");
  const policy = await slaPolicy();
  const office = officeHoursFor(t);
  const clocks = clocksFor(t.receivedAt, p, office, policy);
  await db.$transaction(async (tx) => {
    const updated = await tx.hubTask.update({
      where: { id: t.id },
      data: {
        priority: p,
        ackDueAt: clocks.ackDueAt,
        actionDueAt: clocks.actionDueAt,
        updateDueAt: t.updateDueAt && t.lastUpdateAt ? nextUpdateDue(t.lastUpdateAt, p, office, policy) : t.updateDueAt,
        needsReview: false,
        reviewedAt: now,
        reviewedById: actor.userId,
        updatedById: actor.userId,
      },
    });
    await tx.hubChange.create({ data: { taskId: t.id, field: "priority", fromValue: t.priority, toValue: p, reason: d.reason.trim(), byUserId: actor.userId } });
    await event(tx, t, "hub.priority_changed", `${actor.name} changed ${taskRef(t)} from ${priorityOf(t.priority).label} to ${priorityOf(p).label}: ${d.reason.trim()}${t.aiPriority ? ` (first sorted as ${priorityOf(t.aiPriority).label})` : ""}.`, actor, undefined, now);
    if (p === "critical" && t.status === "unassigned") await announce(tx, updated, t.senderName ?? t.senderAddress ?? "the sender");
  });
  return done(`Priority is now ${priorityOf(p).label}; its clocks follow.`);
}

export async function confirmSorting(taskId: string, actor: Actor): Promise<HubResult> {
  const t = await load(taskId);
  if (!t) return fail("That task no longer exists.");
  if (!works(actor, t.department)) return fail(`${departmentLabel(t.department)} works this one.`);
  if (!t.needsReview) return fail("It has already been checked.");
  await db.$transaction(async (tx) => {
    await tx.hubTask.update({ where: { id: t.id }, data: { needsReview: false, reviewedAt: new Date(), reviewedById: actor.userId, updatedById: actor.userId } });
    await event(tx, t, "hub.sorting_confirmed", `${actor.name} confirmed ${taskRef(t)} as ${categoryLabel(t.category)}, ${priorityOf(t.priority).label}.`, actor);
  });
  return done("Confirmed.");
}

export async function moveDepartment(taskId: string, actor: Actor, d: { department: string; reason: string }): Promise<HubResult> {
  const t = await load(taskId);
  if (!t) return fail("That task no longer exists.");
  if (!works(actor, t.department)) return fail(`${departmentLabel(t.department)} works this one.`);
  const to = d.department as HubDepartment;
  if (!DEPARTMENT_ROLES[to] || to === t.department) return fail("Choose the department it belongs to.");
  if (t.status !== "unassigned" && !supervises(actor, t.department)) return fail("Only an unassigned task moves — or ask the supervisor.");
  if (d.reason.trim().length < 3) return fail("Say why it belongs there.");
  await db.$transaction(async (tx) => {
    // A new department starts it afresh: whoever there takes it on.
    await tx.hubTask.update({ where: { id: t.id }, data: { department: to, status: "unassigned", ownerUserId: null, acceptedAt: null, updatedById: actor.userId } });
    await tx.hubChange.create({ data: { taskId: t.id, field: "department", fromValue: t.department, toValue: to, reason: d.reason.trim(), byUserId: actor.userId } });
    await notify(tx, { taskId: t.id, level: "info", text: `${taskRef(t)} moved to you from ${departmentLabel(t.department)}: ${t.subject}`, department: to });
    await event(tx, { ...t, department: to }, "hub.department_moved", `${actor.name} moved ${taskRef(t)} from ${departmentLabel(t.department)} to ${departmentLabel(to)}: ${d.reason.trim()}.`, actor);
  });
  return done(`Moved to ${departmentLabel(to)}.`);
}

/** The times a person may correct, and who may correct them. */
export const CORRECTABLE: Record<string, { label: string; supervisorOnly: boolean }> = {
  nextActionAt: { label: "Next action", supervisorOnly: false },
  followUpAt: { label: "Next follow-up", supervisorOnly: false },
  receivedAt: { label: "Received", supervisorOnly: true },
  acceptedAt: { label: "Accepted", supervisorOnly: true },
  firstActionAt: { label: "First action", supervisorOnly: true },
  firstResponseAt: { label: "First response", supervisorOnly: true },
  completedAt: { label: "Completed", supervisorOnly: true },
};

export async function correctTime(taskId: string, actor: Actor, d: { field: string; value: Date | null; reason: string }, now = new Date()): Promise<HubResult> {
  const t = await load(taskId);
  if (!t) return fail("That task no longer exists.");
  const spec = CORRECTABLE[d.field];
  if (!spec) return fail("That time cannot be changed.");
  if (spec.supervisorOnly ? !supervises(actor, t.department) : t.ownerUserId !== actor.userId && !supervises(actor, t.department)) {
    return fail(spec.supervisorOnly ? "A recorded time is corrected by the Shift Supervisor or the department's manager." : "Only its owner or the supervisor changes that.");
  }
  if (!d.value) return fail("Give the corrected date and time.");
  if (d.reason.trim().length < 3) return fail("Say why it is being corrected.");
  const before = (t as unknown as Record<string, Date | null>)[d.field];
  if (spec.supervisorOnly && d.value > now) return fail("A time that has happened cannot be in the future.");
  if (d.field === "followUpAt" && d.value <= now) return fail("The follow-up is in the future.");
  if (d.field !== "receivedAt" && spec.supervisorOnly && d.value < t.receivedAt) return fail("That is before it arrived.");
  if (before && before.getTime() === d.value.getTime()) return fail("Nothing has changed.");
  const data: Record<string, unknown> = { [d.field]: d.value, updatedById: actor.userId };
  if (d.field === "receivedAt") {
    const c = clocksFor(d.value, t.priority as HubPriority, officeHoursFor(t), await slaPolicy());
    data.ackDueAt = c.ackDueAt;
    data.actionDueAt = c.actionDueAt;
  }
  await db.$transaction(async (tx) => {
    await tx.hubTask.update({ where: { id: t.id }, data });
    await tx.hubChange.create({ data: { taskId: t.id, field: d.field, fromValue: before?.toISOString() ?? null, toValue: d.value!.toISOString(), reason: d.reason.trim(), byUserId: actor.userId } });
    await event(tx, t, "hub.time_corrected", `${actor.name} corrected ${spec.label.toLowerCase()} on ${taskRef(t)} from ${before?.toISOString() ?? "blank"} to ${d.value!.toISOString()}: ${d.reason.trim()}.`, actor, undefined, now);
  });
  return done(`${spec.label} corrected. The original is kept in the history.`);
}

// ---------------------------------------------------------------------------
// Ownership: one owner, moved only by a reassignment or a handover
// ---------------------------------------------------------------------------

async function canTake(userId: string, department: string) {
  const roles = await db.userRole.findMany({ where: { userId, revokedAt: null, user: { active: true, status: "active" } }, select: { role: true, user: { select: { displayName: true } } } });
  return roles.some((r) => DEPARTMENT_ROLES[department as HubDepartment].includes(r.role)) ? roles[0].user.displayName : null;
}

/**
 * A reassignment (the supervisor moving work) or a handover (the owner, at the
 * end of their shift). The new owner is told; the old one is kept in the
 * history.
 */
export async function moveOwner(taskIds: string[], actor: Actor, d: { toUserId: string; reason: string; kind: "reassign" | "handover" }, now = new Date()): Promise<HubResult> {
  const tasks = await db.hubTask.findMany({ where: { id: { in: taskIds.map(String) } }, include: { mailbox: true } });
  if (!tasks.length) return fail("Choose what to hand over.");
  if (d.reason.trim().length < 3) return fail(d.kind === "handover" ? "Leave a note for the next person — where it has got to." : "Say why it is being reassigned.");
  if (d.toUserId === actor.userId && d.kind === "handover") return fail("Choose who takes it over.");
  for (const t of tasks) {
    if (CLOSED.includes(t.status as HubStatus)) return fail(`${taskRef(t)} is already closed.`);
    const mine = t.ownerUserId === actor.userId;
    if (!mine && !supervises(actor, t.department)) return fail(`${taskRef(t)} is not yours to hand over — ask the Shift Supervisor.`);
    if (t.ownerUserId === d.toUserId) return fail(`${taskRef(t)} is already theirs.`);
  }
  const depts = [...new Set(tasks.map((t) => t.department))];
  let name: string | null = null;
  for (const dept of depts) {
    name = await canTake(d.toUserId, dept);
    if (!name) return fail(`They do not work ${departmentLabel(dept)}'s mailbox.`);
  }
  await db.$transaction(async (tx) => {
    for (const t of tasks) {
      await tx.hubTask.update({
        where: { id: t.id },
        data: { ownerUserId: d.toUserId, acceptedAt: t.acceptedAt ?? now, status: t.status === "unassigned" ? "accepted" : t.status, handoverNeededAt: null, updatedById: actor.userId },
      });
      await tx.hubOwnership.create({ data: { taskId: t.id, kind: d.kind, fromUserId: t.ownerUserId, toUserId: d.toUserId, byUserId: actor.userId, reason: d.reason.trim(), at: now } });
      if (t.status === "unassigned") await tx.workItem.updateMany({ where: { hubTaskId: t.id, state: "open" }, data: { state: "done", doneAt: now } });
      await event(tx, t, d.kind === "handover" ? "hub.handed_over" : "hub.reassigned", `${actor.name} ${d.kind === "handover" ? "handed over" : "reassigned"} ${taskRef(t)} to ${name}: ${d.reason.trim()}`, actor, undefined, now);
    }
    await notify(tx, { level: "info", text: `${actor.name} ${d.kind === "handover" ? "handed you" : "gave you"} ${tasks.length === 1 ? taskRef(tasks[0]) : `${tasks.length} tasks`}: ${d.reason.trim()}`, toUserId: d.toUserId, taskId: tasks.length === 1 ? tasks[0].id : null });
  });
  return done(`${tasks.length === 1 ? taskRef(tasks[0]) : `${tasks.length} tasks`} ${tasks.length === 1 ? "is" : "are"} now with ${name}.`);
}

// ---------------------------------------------------------------------------
// Closing
// ---------------------------------------------------------------------------

export async function closeTask(taskId: string, actor: Actor, d: { outcome: string; reason: string; corrective: string; clientMessage?: string }, now = new Date()): Promise<HubResult> {
  const t = await load(taskId);
  if (!t) return fail("That task no longer exists.");
  if (CLOSED.includes(t.status as HubStatus)) return fail("It is already closed.");
  // A client who asked through their portal is told how it ended, in words written for them.
  const clientMessage = (d.clientMessage ?? "").trim().slice(0, 1000);
  if (t.source === "client_portal" && clientMessage.length < 5) return fail("Write what to tell the client — they read it in their portal.");
  if (t.ownerUserId !== actor.userId && !supervises(actor, t.department)) return fail(t.ownerUserId ? "Only its owner or the supervisor closes it." : "Accept it first — or the supervisor can close a duplicate.");
  // Late now counts as late, even if the sweep has not said so yet.
  const lateNow =
    (t.status === "unassigned" && now > t.ackDueAt) || (!t.firstActionAt && now > t.actionDueAt && d.outcome !== "duplicate_or_mistake") || (t.updateDueAt !== null && now > t.updateDueAt);
  const breaches = t.breaches + (lateNow ? 1 : 0);
  const problem = closeProblem({ ...d, breaches });
  if (problem) return fail(problem);
  const o = outcomeOf(d.outcome)!;
  await db.$transaction(async (tx) => {
    if (lateNow) {
      const clock: Clock = t.status === "unassigned" ? "accept" : !t.firstActionAt ? "action" : "update";
      const due = clock === "accept" ? t.ackDueAt : clock === "action" ? t.actionDueAt : t.updateDueAt!;
      await lateBreach(tx, t, clock, due, now);
    }
    const fresh = await tx.hubTask.findUniqueOrThrow({ where: { id: t.id }, select: { breaches: true } });
    await tx.hubTask.update({
      where: { id: t.id },
      data: {
        status: o.status,
        outcome: o.id,
        outcomeReason: d.reason.trim() || null,
        correctiveAction: d.corrective.trim() || null,
        completedAt: now,
        completedById: actor.userId,
        withinSla: fresh.breaches === 0,
        updateDueAt: null,
        handoverNeededAt: null,
        updatedById: actor.userId,
        ...(t.source === "client_portal" ? { clientUpdate: clientMessage, clientUpdateAt: now } : {}),
      },
    });
    await tx.workItem.updateMany({ where: { hubTaskId: t.id, state: "open" }, data: { state: "done", doneAt: now } });
    await event(tx, t, "hub.closed", `${actor.name} closed ${taskRef(t)}: ${o.label}${fresh.breaches ? `, outside SLA (${fresh.breaches} breach${fresh.breaches === 1 ? "" : "es"})` : ", within SLA"}.${d.reason.trim() ? ` Reason: ${d.reason.trim()}.` : ""}${d.corrective.trim() ? ` Corrective action: ${d.corrective.trim()}.` : ""}`, actor, { outcome: o.id, breaches: fresh.breaches }, now);
  });
  return done(`Closed as ${o.label}.`);
}

// ---------------------------------------------------------------------------
// From the client portal (26 September 2026)
// ---------------------------------------------------------------------------

/** What a client can ask for, in their words, and where it goes. */
export const CLIENT_REQUEST_KINDS = [
  { id: "extra_cover", label: "Extra cover or a new shift", category: "cover_request" },
  { id: "change", label: "A change to a shift or post", category: "client_request" },
  { id: "cancel", label: "Cancel a shift", category: "shift_cancellation" },
  { id: "complaint", label: "A complaint", category: "complaint" },
  { id: "invoice", label: "An invoice or account question", category: "invoice_accounts" },
  { id: "feedback", label: "Feedback or thanks", category: "other" },
  { id: "other", label: "Something else", category: "client_request" },
] as const satisfies readonly { id: string; label: string; category: HubCategory }[];

/**
 * A request from a client contact. It becomes a task for the department that
 * deals with it — the Control Room, or Accounts for invoices — on the same
 * clocks as an email, and the department is told at once. The client follows
 * it in their portal; nothing internal is shown to them.
 */
export async function createClientRequest(
  contact: { userId: string; name: string; clientId: string; clientName: string },
  d: { kind: string; siteId: string | null; subject: string; details: string; urgent: boolean; when: string },
  now = new Date(),
): Promise<HubResult> {
  const kind = CLIENT_REQUEST_KINDS.find((k) => k.id === d.kind);
  if (!kind) return fail("Choose what the request is about.");
  if (d.subject.trim().length < 3) return fail("Give it a short title.");
  if (d.details.trim().length < 5) return fail("Say a little more, so the right person can act on it.");
  const category = kind.category as HubCategory;
  const dept = departmentFor(category) ?? "control";
  const priority: HubPriority = d.urgent ? (category === "complaint" ? "very_high" : "high") : category === "complaint" ? "high" : "medium";
  const policy = await slaPolicy();
  const clocks = clocksFor(now, priority, dept !== "control", policy);
  const summary = `${d.details.trim()}${d.when.trim() ? `\n\nWhen: ${d.when.trim()}` : ""}`.slice(0, 1000);
  const t = await db.$transaction(async (tx) => {
    const t = await tx.hubTask.create({
      data: {
        source: "client_portal",
        department: dept,
        subject: d.subject.trim().slice(0, 300),
        summary,
        requiredAction: requiredActionFor(category),
        senderName: `${contact.name} (${contact.clientName})`,
        receivedAt: now,
        category,
        categoryNote: category === "other" ? "Feedback from the client portal" : null,
        priority,
        aiModel: "client",
        aiReasons: `Raised by the client in their portal as “${kind.label}”${d.urgent ? ", marked urgent" : ""}.`,
        clientId: contact.clientId,
        siteId: d.siteId,
        ackDueAt: clocks.ackDueAt,
        actionDueAt: clocks.actionDueAt,
        createdById: contact.userId,
      },
    });
    await tx.event.create({
      data: { type: "hub.task_created", actorUserId: contact.userId, actorRole: "client", department: dept, hubTaskId: t.id, detail: `${contact.name} of ${contact.clientName} raised ${taskRef(t)} in the client portal: “${t.subject}” — ${kind.label}${d.urgent ? ", urgent" : ""}.` },
    });
    await announce(tx, t, `${contact.name}, ${contact.clientName} (client portal)`);
    return t;
  });
  if (t.priority === "critical") await pushCritical(t);
  return done(`Sent. Your reference is ${taskRef(t)}.`, t.id);
}

/** What the client is told, in their portal, about a request they raised. Replaces the last message. */
export async function updateClient(taskId: string, actor: Actor, message: string, now = new Date()): Promise<HubResult> {
  const t = await load(taskId);
  if (!t) return fail("That task no longer exists.");
  if (t.source !== "client_portal") return fail("Only requests from the client portal have a message to the client.");
  if (!works(actor, t.department as HubDepartment)) return fail("It is another department's.");
  const text = message.trim().slice(0, 1000);
  if (text.length < 5) return fail("Write what the client should read.");
  await db.$transaction(async (tx) => {
    await tx.hubTask.update({ where: { id: t.id }, data: { clientUpdate: text, clientUpdateAt: now, updatedById: actor.userId } });
    await event(tx, t, "hub.client_updated", `${actor.name} told the client about ${taskRef(t)}: “${text}”`, actor, undefined, now);
  });
  return done("The client can read it in their portal now.");
}

// ---------------------------------------------------------------------------
// Logged by hand: a phone call, a WhatsApp, anything else
// ---------------------------------------------------------------------------

export async function createManualTask(
  actor: Actor,
  d: { source: string; senderName: string; contact: string; subject: string; details: string; category: string; categoryNote: string; priority: string; department: string; clientId: string | null; siteId: string | null; receivedAt: Date; take: boolean },
  now = new Date(),
): Promise<HubResult> {
  const dept = d.department as HubDepartment;
  if (!DEPARTMENT_ROLES[dept] || !works(actor, dept)) return fail("Log it for a department whose work you do.");
  if (!["manual", "phone", "whatsapp", "other"].includes(d.source)) return fail("Say where it came from.");
  if (d.subject.trim().length < 3) return fail("Give it a short title.");
  if (d.details.trim().length < 3) return fail("Say what it is about.");
  if (!categoryLabel(d.category) || !priorityOf(d.priority)) return fail("Choose the category and priority.");
  if (d.category === "other" && d.categoryNote.trim().length < 3) return fail("Say what it is — “Other” needs a few words.");
  if (d.receivedAt > now) return fail("It cannot have come in the future.");
  if (now.getTime() - d.receivedAt.getTime() > 7 * 86_400_000) return fail("That is more than a week ago — check the date.");
  const policy = await slaPolicy();
  const office = dept !== "control";
  const clocks = clocksFor(d.receivedAt, d.priority as HubPriority, office, policy);
  const rules = classifyByRules(d.subject, d.details);
  const t = await db.$transaction(async (tx) => {
    const t = await tx.hubTask.create({
      data: {
        source: d.source as "manual",
        department: dept,
        subject: d.subject.trim().slice(0, 300),
        summary: d.details.trim().slice(0, 1000),
        requiredAction: requiredActionFor(d.category as HubCategory),
        senderName: d.senderName.trim() || null,
        senderAddress: d.contact.trim() || null,
        receivedAt: d.receivedAt,
        category: d.category as HubCategory,
        categoryNote: d.category === "other" ? d.categoryNote.trim() : null,
        priority: d.priority as HubPriority,
        aiCategory: rules.category,
        aiPriority: rules.priority,
        aiConfidence: rules.confidence,
        aiModel: "rules",
        aiReasons: `Logged by hand. The rules would have said ${categoryLabel(rules.category)}, ${priorityOf(rules.priority).label}.`,
        clientId: d.clientId,
        siteId: d.siteId,
        ackDueAt: clocks.ackDueAt,
        actionDueAt: clocks.actionDueAt,
        createdById: actor.userId,
        ...(d.take ? { status: "accepted", ownerUserId: actor.userId, acceptedAt: now } : {}),
      },
    });
    if (d.take) await tx.hubOwnership.create({ data: { taskId: t.id, kind: "accept", toUserId: actor.userId, byUserId: actor.userId, at: now } });
    await event(tx, t, "hub.task_created", `${actor.name} logged ${taskRef(t)} (${d.source === "manual" ? "entered by hand" : `by ${d.source}`}): “${t.subject}” — ${categoryLabel(t.category)}, ${priorityOf(t.priority).label}${d.take ? "; took it on" : ""}.`, actor, undefined, now);
    if (!d.take) await announce(tx, t, d.senderName.trim() || "a caller");
    else if (t.priority === "critical") {
      // Taken on the spot, so no alarm for an owner — but the manager is told.
      await notify(tx, { taskId: t.id, level: "critical", text: `Critical ${taskRef(t)} logged by ${actor.name}: ${t.subject}`, toRole: MANAGER_ROLE[dept] as Role });
    }
    return t;
  });
  return done(`${taskRef(t)} logged${d.take ? " and yours" : " for the department to take"}.`, t.id);
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export async function addFile(taskId: string, actor: Actor, f: { fileName: string; mimeType: string; sizeBytes: number; sha256: string; storageKey: string; noteId?: string | null }): Promise<HubResult> {
  const t = await load(taskId);
  if (!t) return fail("That task no longer exists.");
  if (!works(actor, t.department)) return fail(`${departmentLabel(t.department)} works this one.`);
  await db.$transaction(async (tx) => {
    await tx.hubFile.create({ data: { taskId: t.id, noteId: f.noteId ?? null, fileName: f.fileName.slice(0, 200), mimeType: f.mimeType, sizeBytes: f.sizeBytes, sha256: f.sha256, storageKey: f.storageKey, uploadedById: actor.userId } });
    await event(tx, t, "hub.file_added", `${actor.name} added “${f.fileName}” to ${taskRef(t)}.`, actor);
  });
  return done("Added.");
}

export async function removeFile(fileId: string, actor: Actor, reason: string): Promise<HubResult> {
  const f = await db.hubFile.findUnique({ where: { id: String(fileId) }, include: { task: true } });
  if (!f || f.removedAt) return fail("That file is not there.");
  if (f.uploadedById !== actor.userId && !supervises(actor, f.task.department)) return fail("Only whoever added it, or the supervisor, removes it.");
  if (reason.trim().length < 3) return fail("Say why it is being removed.");
  await db.$transaction(async (tx) => {
    await tx.hubFile.update({ where: { id: f.id }, data: { removedAt: new Date(), removedById: actor.userId, removedReason: reason.trim() } });
    await event(tx, f.task, "hub.file_removed", `${actor.name} removed “${f.fileName}” from ${taskRef(f.task)}: ${reason.trim()}.`, actor);
  });
  return done("Removed. It stays in the history as removed.");
}

export { IN_HAND, WAITING, CLOSED };
