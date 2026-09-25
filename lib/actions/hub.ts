"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { CATEGORIES, PRIORITIES, departmentsOf, isOpen, parseSpan } from "@/lib/core/hub";
import { SAMPLE_EMAILS } from "@/lib/core/hub-samples";
import { ukInstant } from "@/lib/core/rota";
import { ALLOWED_KINDS, sniffMime } from "@/lib/core/screening-documents";
import { db } from "@/lib/db/client";
import * as hub from "@/lib/db/hub";
import { sweepHub } from "@/lib/db/hub-sweep";
import { deleteObject, putObject } from "@/lib/storage";
import { refused, ok, type ActionResult } from "./types";

/**
 * The Performance hub's buttons (Control, 25 September 2026). Each checks who
 * is pressing it, then hands to lib/db/hub.ts, which checks the task itself:
 * whose department it is, who owns it, and whether the change is complete.
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { session: null, actor: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) {
    const spec = ACTIONS[action];
    return { session, actor: null, error: refused(`${spec.what} belongs to ${spec.owner}.`) };
  }
  return { session, actor: { userId: session.userId, role: session.activeRole, name: session.name } as hub.Actor, error: null };
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
/** A date and time typed on the page is UK time. */
const when = (v: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? ukInstant(v.slice(0, 10), v.slice(11, 16)) : null);
const answer = (r: hub.HubResult, taskId?: string): ActionResult => {
  revalidatePath("/hub");
  if (taskId ?? (r.ok ? r.taskId : undefined)) revalidatePath(`/hub/${taskId ?? (r.ok ? r.taskId : "")}`);
  return r.ok ? ok(r.message) : refused(r.message);
};

async function storeEvidence(file: File) {
  if (file.size > 10 * 1024 * 1024) return { error: "That file is over 10 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) return { error: "Evidence is a PDF, JPEG or PNG." };
  const key = `hub/${randomBytes(12).toString("hex")}.${ALLOWED_KINDS[mime]}`;
  await putObject(key, bytes);
  return { key, mime, size: file.size, sha256: createHash("sha256").update(bytes).digest("hex"), name: file.name };
}

export async function acceptHubTask(taskId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  return answer(await hub.acceptTask(taskId, actor), taskId);
}

export async function recordHubNote(taskId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  const kind = text(formData, "kind");
  if (!["note", "action", "response"].includes(kind)) return refused("Say what kind of entry it is.");
  const file = formData.get("evidence");
  const stored = file instanceof File && file.size > 0 ? await storeEvidence(file) : null;
  if (stored && "error" in stored) return refused(stored.error!);
  const next = text(formData, "nextAction");
  const r = await hub.recordNote(taskId, actor, { kind: kind as "note", text: text(formData, "text"), ...(next ? { nextAction: next, nextActionAt: when(text(formData, "nextActionAt")) } : {}) });
  if (!r.ok) {
    if (stored && "key" in stored) await deleteObject(stored.key!).catch(() => {});
    return refused(r.message);
  }
  if (stored && "key" in stored) await hub.addFile(taskId, actor, { fileName: stored.name!, mimeType: stored.mime!, sizeBytes: stored.size!, sha256: stored.sha256!, storageKey: stored.key!, noteId: r.noteId });
  return answer(r, taskId);
}

export async function editHubNote(noteId: string, taskId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  return answer(await hub.editNote(noteId, actor, text(formData, "text")), taskId);
}

export async function setHubWaiting(taskId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  return answer(await hub.setWaiting(taskId, actor, { status: text(formData, "status"), reason: text(formData, "reason"), waitingFor: text(formData, "waitingFor"), followUpAt: when(text(formData, "followUpAt")), evidence: text(formData, "evidence") }), taskId);
}

export async function recordHubFollowUp(taskId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  return answer(await hub.followUp(taskId, actor, { evidence: text(formData, "evidence"), followUpAt: when(text(formData, "followUpAt")) }), taskId);
}

export async function resumeHubTask(taskId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  return answer(await hub.resume(taskId, actor), taskId);
}

export async function escalateHubTask(taskId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  return answer(await hub.escalate(taskId, actor, text(formData, "note")), taskId);
}

export async function setHubNextAction(taskId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  return answer(await hub.setNextAction(taskId, actor, text(formData, "nextAction"), when(text(formData, "nextActionAt"))), taskId);
}

export async function changeHubCategory(taskId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  return answer(await hub.changeCategory(taskId, actor, { category: text(formData, "category"), note: text(formData, "categoryNote"), reason: text(formData, "reason") }), taskId);
}

export async function changeHubPriority(taskId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  return answer(await hub.changePriority(taskId, actor, { priority: text(formData, "priority"), reason: text(formData, "reason") }), taskId);
}

export async function confirmHubSorting(taskId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  return answer(await hub.confirmSorting(taskId, actor), taskId);
}

export async function moveHubDepartment(taskId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  return answer(await hub.moveDepartment(taskId, actor, { department: text(formData, "department"), reason: text(formData, "reason") }), taskId);
}

export async function correctHubTime(taskId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  return answer(await hub.correctTime(taskId, actor, { field: text(formData, "field"), value: when(text(formData, "value")), reason: text(formData, "reason") }), taskId);
}

/** The owner hands it over; the supervisor reassigns. */
export async function reassignHubTask(taskId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  const t = await db.hubTask.findUnique({ where: { id: String(taskId) }, select: { ownerUserId: true } });
  const kind = t?.ownerUserId === actor.userId ? "handover" : "reassign";
  if (kind === "reassign" && !canDo(actor.role, "hub.supervise")) return refused(`${ACTIONS["hub.supervise"].what} belongs to ${ACTIONS["hub.supervise"].owner}.`);
  return answer(await hub.moveOwner([taskId], actor, { toUserId: text(formData, "toUserId"), reason: text(formData, "reason"), kind }), taskId);
}

/** End of shift: everything still open, to the next person, with one note. */
export async function handOverMyWork(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  const picked = formData.getAll("taskId").map(String);
  const mine = await db.hubTask.findMany({ where: { ownerUserId: actor.userId }, select: { id: true, status: true } });
  const ids = (picked.length ? mine.filter((t) => picked.includes(t.id)) : mine).filter((t) => isOpen(t.status)).map((t) => t.id);
  if (!ids.length) return refused("You have nothing open to hand over.");
  return answer(await hub.moveOwner(ids, actor, { toUserId: text(formData, "toUserId"), reason: text(formData, "note"), kind: "handover" }));
}

export async function closeHubTask(taskId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  return answer(await hub.closeTask(taskId, actor, { outcome: text(formData, "outcome"), reason: text(formData, "reason"), corrective: text(formData, "corrective") }), taskId);
}

export async function logHubTask(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  const siteId = text(formData, "siteId") || null;
  const site = siteId ? await db.site.findUnique({ where: { id: siteId }, select: { clientId: true } }) : null;
  const r = await hub.createManualTask(actor, {
    source: text(formData, "source"),
    senderName: text(formData, "senderName"),
    contact: text(formData, "contact"),
    subject: text(formData, "subject"),
    details: text(formData, "details"),
    category: text(formData, "category"),
    categoryNote: text(formData, "categoryNote"),
    priority: text(formData, "priority"),
    department: text(formData, "department") || departmentsOf(actor.role)[0],
    clientId: site?.clientId ?? (text(formData, "clientId") || null),
    siteId: site ? siteId : null,
    receivedAt: when(text(formData, "receivedAt")) ?? new Date(),
    take: formData.get("take") === "on",
  });
  return answer(r);
}

export async function addHubFile(taskId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return refused("Choose the file.");
  const stored = await storeEvidence(file);
  if ("error" in stored) return refused(stored.error!);
  const r = await hub.addFile(taskId, actor, { fileName: stored.name!, mimeType: stored.mime!, sizeBytes: stored.size!, sha256: stored.sha256!, storageKey: stored.key! });
  if (!r.ok) await deleteObject(stored.key!).catch(() => {});
  return answer(r, taskId);
}

export async function removeHubFile(fileId: string, taskId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.work");
  if (error || !actor) return error!;
  return answer(await hub.removeFile(fileId, actor, text(formData, "reason")), taskId);
}

/**
 * The test inbox: an email sent in here goes through exactly what a real one
 * will — read, sorted, matched, clocks started, people alerted — but only into
 * a mailbox marked as test, and nothing ever goes out.
 */
export async function sendHubTestEmail(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.test");
  if (error || !actor) return error!;
  const mailbox = await db.mailbox.findUnique({ where: { id: text(formData, "mailboxId") } });
  if (!mailbox || mailbox.mode !== "test") return refused("Test emails go only into a test mailbox.");
  const sample = SAMPLE_EMAILS.find((s) => s.key === text(formData, "sample"));
  const subject = text(formData, "subject") || sample?.subject || "";
  const body = text(formData, "body") || sample?.body || "";
  if (subject.length < 2 || body.length < 5) return refused("Give the test email a subject and a few words.");
  const from = text(formData, "fromAddress") || sample?.fromAddress || "tester@example.com";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return refused("That sender address is not an email address.");
  const r = await hub.ingestEmail({
    mailboxId: mailbox.id,
    graphMessageId: `test-${randomBytes(8).toString("hex")}`,
    internetMessageId: `<test-${randomBytes(8).toString("hex")}@test.leonguarding.example>`,
    conversationId: `test-conv-${randomBytes(6).toString("hex")}`,
    receivedAt: new Date(),
    fromName: text(formData, "fromName") || sample?.fromName || null,
    fromAddress: from,
    to: [mailbox.address],
    subject,
    body,
  });
  await sweepHub();
  await db.event.create({ data: { type: "hub.test_email_sent", actorUserId: actor.userId, actorRole: actor.role, department: mailbox.department, hubTaskId: r.taskId, detail: `${actor.name} sent a test email into ${mailbox.address}: “${subject}”.` } });
  revalidatePath("/hub");
  return ok("In the test inbox. Watch it arrive.");
}

// ---------------------------------------------------------------------------
// Settings and reply templates (26 September 2026)
// ---------------------------------------------------------------------------

/** The clocks, priority by priority: "3m", "4h", "1wd". The Managing Director's. */
export async function saveSlaPolicy(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.settings");
  if (error || !actor) return error!;
  const changes: { key: string; value: string }[] = [];
  for (const p of PRIORITIES) {
    for (const clock of ["accept", "action", "update"] as const) {
      const v = text(formData, `${p.id}.${clock}`);
      if (!v) continue;
      if (!parseSpan(v)) return refused(`${p.label} ${clock}: write it as minutes (15m), hours (4h) or working days (1wd).`);
      changes.push({ key: `hub.sla.${p.id}.${clock}`, value: v });
    }
  }
  await db.$transaction([
    ...changes.map((c) => db.setting.upsert({ where: { key: c.key }, create: { key: c.key, value: c.value, valueType: "text", label: `Hub clock ${c.key.slice(8)}`, usedBy: "performance-hub", updatedById: actor.userId }, update: { value: c.value, updatedById: actor.userId } })),
    db.event.create({ data: { type: "hub.settings_changed", actorUserId: actor.userId, actorRole: actor.role, department: "control", detail: `${actor.name} set the hub's clocks: ${changes.map((c) => `${c.key.slice(8)} ${c.value}`).join(", ")}.` } }),
  ]);
  revalidatePath("/performance/settings");
  return ok("Saved. New emails use these clocks from now on; tasks already open keep the deadlines they were given.");
}

export async function saveClosedDays(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.settings");
  if (error || !actor) return error!;
  const days = [...new Set(text(formData, "days").split(/[\s,]+/).filter(Boolean))];
  const bad = days.find((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d));
  if (bad) return refused(`“${bad}” is not a date — write each as 2026-12-24.`);
  await db.$transaction([
    db.setting.upsert({ where: { key: "hub.closed_days" }, create: { key: "hub.closed_days", value: JSON.stringify(days.sort()), valueType: "json", label: "Days the office is closed, beyond bank holidays", usedBy: "performance-hub", updatedById: actor.userId }, update: { value: JSON.stringify(days.sort()), updatedById: actor.userId } }),
    db.event.create({ data: { type: "hub.settings_changed", actorUserId: actor.userId, actorRole: actor.role, department: "control", detail: `${actor.name} set the office closure days: ${days.join(", ") || "none"}.` } }),
  ]);
  revalidatePath("/performance/settings");
  return ok("Saved.");
}

/** A mailbox's mode — test, shadow (read and sorted, nobody alerted) or live — and its hours. */
export async function updateMailbox(mailboxId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.settings");
  if (error || !actor) return error!;
  const m = await db.mailbox.findUnique({ where: { id: String(mailboxId) } });
  if (!m) return refused("That mailbox no longer exists.");
  const mode = text(formData, "mode") as "test" | "shadow" | "live";
  if (!["test", "shadow", "live"].includes(mode)) return refused("Choose test, shadow or live.");
  if (mode === "live" && m.address.includes("test.leonguarding")) return refused("A test mailbox cannot go live — connect the real one.");
  const data = { mode, officeHoursOnly: formData.get("officeHoursOnly") === "on", readAttachments: formData.get("readAttachments") === "on", active: formData.get("active") === "on" };
  await db.$transaction([
    db.mailbox.update({ where: { id: m.id }, data }),
    db.event.create({ data: { type: "hub.mailbox_changed", actorUserId: actor.userId, actorRole: actor.role, department: m.department, detail: `${actor.name} set ${m.address}: ${mode}, ${data.officeHoursOnly ? "office hours" : "round the clock"}, attachments ${data.readAttachments ? "read" : "not read"}, ${data.active ? "on" : "off"}.` } }),
  ]);
  revalidatePath("/performance/settings");
  revalidatePath("/hub");
  return ok("Saved.");
}

/** A reply template, new or changed. Department managers write their own categories' wording. */
export async function saveReplyTemplate(templateId: string | null, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { actor, error } = await guard("hub.templates");
  if (error || !actor) return error!;
  const category = text(formData, "category");
  const title = text(formData, "title").slice(0, 120);
  const body = text(formData, "body").slice(0, 4000);
  if (!CATEGORIES.some((c) => c.id === category)) return refused("Choose the category it is for.");
  if (title.length < 3 || body.length < 10) return refused("Give it a title and the wording.");
  const data = { category: category as (typeof CATEGORIES)[number]["id"], title, body, active: templateId ? formData.get("active") === "on" : true };
  if (templateId) {
    const t = await db.replyTemplate.findUnique({ where: { id: String(templateId) } });
    if (!t) return refused("That template no longer exists.");
    await db.$transaction([
      db.replyTemplate.update({ where: { id: t.id }, data: { ...data, updatedById: actor.userId } }),
      db.event.create({ data: { type: "hub.template_changed", actorUserId: actor.userId, actorRole: actor.role, department: "control", detail: `${actor.name} changed the reply template “${title}”.` } }),
    ]);
  } else {
    await db.$transaction([
      db.replyTemplate.create({ data: { ...data, createdById: actor.userId } }),
      db.event.create({ data: { type: "hub.template_added", actorUserId: actor.userId, actorRole: actor.role, department: "control", detail: `${actor.name} added the reply template “${title}”.` } }),
    ]);
  }
  revalidatePath("/hub/templates");
  return ok("Saved.");
}
