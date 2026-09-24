"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { ukDate } from "@/lib/core/rota";
import { ALLOWED_KINDS, sniffMime } from "@/lib/core/screening-documents";
import { EMPLOYEE_DOCUMENT_TYPES, LEAVER_REASONS } from "@/lib/core/employees";
import { loadLive, officerOffWrites } from "@/lib/db/cover";
import { raiseLeave } from "@/lib/db/leave";
import { rewriteIdentityKeys } from "@/lib/db/people";
import { deleteObject, putObject } from "@/lib/storage";
import type { Role } from "@/lib/types";
import { refused, ok, type ActionResult } from "./types";

/**
 * The employee record (HR, 25 September 2026): contact details, next of kin,
 * the contract, payroll, training, documents, leave raised on someone's
 * behalf — and the leaver process. Every change is logged with what changed.
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { session: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) {
    const spec = ACTIONS[action];
    return {
      session,
      error: refused(`${spec.what} belongs to ${spec.owner}. You are working as ${session.activeRole.replace(/_/g, " ")}, so the platform refuses it.`),
    };
  }
  return { session, error: null };
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const day = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null);
const refresh = (personId: string) => {
  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
};

async function employee(personId: string) {
  return db.person.findUnique({ where: { id: String(personId) }, include: { employment: true } });
}

function log(session: { userId: string; activeRole: Role }, personId: string, type: string, detail: string) {
  return db.event.create({ data: { type, actorUserId: session.userId, actorRole: session.activeRole, department: "recruitment", personId, detail } });
}

export async function updateEmployeeContact(personId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("employee.edit");
  if (error || !session) return error!;
  const p = await employee(personId);
  if (!p?.employment) return refused("That employee no longer exists.");
  const next = { phone: text(formData, "phone") || null, email: text(formData, "email") || null, address: text(formData, "address") || null, postcode: text(formData, "postcode").toUpperCase() || null };
  if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) return refused("That is not a valid email address.");
  if (next.phone && next.phone.replace(/\D/g, "").length < 10) return refused("That phone number looks too short.");
  const changed = (["phone", "email", "address", "postcode"] as const).filter((k) => (p[k] ?? null) !== next[k]);
  if (!changed.length) return refused("Nothing has changed.");
  const clash = await db.$transaction(async (tx) => {
    const c = await rewriteIdentityKeys(tx, p.id, { fullName: p.fullName, dateOfBirth: p.dateOfBirth, email: next.email, phone: next.phone, nationalInsurance: p.nationalInsurance });
    if (c) return c;
    await tx.person.update({ where: { id: p.id }, data: next });
    await tx.event.create({ data: { type: "employee.contact_updated", actorUserId: session.userId, actorRole: session.activeRole, department: "recruitment", personId: p.id, detail: `${p.fullName}'s contact details updated: ${changed.join(", ")}.` } });
    return null;
  });
  if (clash) return refused(clash);
  refresh(p.id);
  return ok("Saved.");
}

export async function updateNextOfKin(personId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("employee.edit");
  if (error || !session) return error!;
  const p = await employee(personId);
  if (!p?.employment) return refused("That employee no longer exists.");
  const name = text(formData, "name");
  const relation = text(formData, "relation");
  const phone = text(formData, "phone");
  if (name.length < 2 || phone.replace(/\D/g, "").length < 10) return refused("Give their name and a phone number.");
  await db.$transaction([
    db.person.update({ where: { id: p.id }, data: { nextOfKinName: name, nextOfKinRelation: relation || null, nextOfKinPhone: phone } }),
    log(session, p.id, "employee.next_of_kin_updated", `${p.fullName}'s next of kin updated.`),
  ]);
  refresh(p.id);
  return ok("Saved.");
}

export async function updateContract(personId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("employee.edit");
  if (error || !session) return error!;
  const p = await employee(personId);
  if (!p?.employment) return refused("That employee no longer exists.");
  const contractType = text(formData, "contractType") || null;
  if (contractType && !["full_time", "part_time", "zero_hours", "casual", "fixed_term"].includes(contractType)) return refused("Choose the type of contract.");
  const noticeRaw = text(formData, "noticeWeeks");
  const noticeWeeks = noticeRaw ? Number(noticeRaw) : null;
  if (noticeWeeks !== null && (!Number.isInteger(noticeWeeks) || noticeWeeks < 0 || noticeWeeks > 26)) return refused("Notice is a whole number of weeks, up to 26.");
  const startedAt = day(text(formData, "startedAt"));
  if (!startedAt) return refused("Give the start date.");
  const data: Record<string, unknown> = {
    contractType,
    jobTitle: text(formData, "jobTitle") || null,
    noticeWeeks,
    startedAt,
    contractSignedAt: day(text(formData, "contractSignedAt")),
  };
  // Pay goes further only to those who handle it.
  if (formData.has("payRate")) {
    if (!canDo(session.activeRole, "employee.payroll")) return refused(ACTIONS["employee.payroll"].what + " belongs to " + ACTIONS["employee.payroll"].owner + ".");
    const pounds = text(formData, "payRate");
    const pence = pounds ? Math.round(Number(pounds) * 100) : null;
    if (pence !== null && (!Number.isFinite(pence) || pence <= 0 || pence > 20_000)) return refused("Give the hourly rate in pounds, e.g. 12.60.");
    data.payRatePence = pence;
  }
  await db.$transaction([db.employment.update({ where: { personId: p.id }, data }), log(session, p.id, "employee.contract_updated", `${p.fullName}'s contract details updated.`)]);
  refresh(p.id);
  return ok("Saved.");
}

export async function updatePayroll(personId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("employee.payroll");
  if (error || !session) return error!;
  const p = await employee(personId);
  if (!p?.employment) return refused("That employee no longer exists.");
  const payrollRef = text(formData, "payrollRef").slice(0, 40) || null;
  const ni = text(formData, "nationalInsurance").toUpperCase().replace(/\s+/g, "") || null;
  if (ni && !/^[A-Z]{2}\d{6}[A-D]$/.test(ni)) return refused("That does not look like a National Insurance number.");
  const clash = await db.$transaction(async (tx) => {
    const c = await rewriteIdentityKeys(tx, p.id, { fullName: p.fullName, dateOfBirth: p.dateOfBirth, email: p.email, phone: p.phone, nationalInsurance: ni });
    if (c) return c;
    await tx.person.update({ where: { id: p.id }, data: { payrollRef, nationalInsurance: ni } });
    await tx.event.create({ data: { type: "employee.payroll_updated", actorUserId: session.userId, actorRole: session.activeRole, department: "administration", personId: p.id, detail: `${p.fullName}'s payroll details updated.` } });
    return null;
  });
  if (clash) return refused(clash);
  refresh(p.id);
  return ok("Saved.");
}

/** Store an uploaded file on the person; returns the document id. */
async function storeUpload(personId: string, typeId: string, file: File, expiresAt: Date | null, userId: string, note: string | null) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) return { error: "Upload a PDF, JPEG or PNG." };
  if (file.size > 10 * 1024 * 1024) return { error: "That file is over 10 MB." };
  const key = `people/${personId}/${randomBytes(12).toString("hex")}.${ALLOWED_KINDS[mime]}`;
  await putObject(key, bytes);
  return {
    key,
    data: {
      typeId,
      personId,
      verification: "verified" as const,
      storageKey: key,
      fileName: file.name.slice(0, 200),
      mimeType: mime,
      sizeBytes: file.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      suppliedAt: new Date(),
      verifiedAt: new Date(),
      verifiedById: userId,
      uploadedById: userId,
      expiresAt,
      note,
    },
  };
}

export async function addTraining(personId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("employee.edit");
  if (error || !session) return error!;
  const p = await employee(personId);
  if (!p?.employment) return refused("That employee no longer exists.");
  const course = text(formData, "course");
  const completedOn = day(text(formData, "completedOn"));
  const expiresOn = day(text(formData, "expiresOn"));
  if (course.length < 2) return refused("Name the course.");
  if (!completedOn) return refused("Give the date it was done.");
  if (expiresOn && expiresOn <= completedOn) return refused("It runs out after it was done.");
  const file = formData.get("certificate");
  const upload = file instanceof File && file.size > 0 ? await storeUpload(p.id, "training_certificate", file, expiresOn, session.userId, course) : null;
  if (upload && "error" in upload) return refused(upload.error!);
  try {
    await db.$transaction(async (tx) => {
      const doc = upload && "data" in upload ? await tx.documentRecord.create({ data: upload.data }) : null;
      await tx.trainingRecord.create({ data: { personId: p.id, course, provider: text(formData, "provider") || null, completedOn, expiresOn, documentId: doc?.id ?? null, createdById: session.userId } });
      await tx.event.create({ data: { type: "employee.training_added", actorUserId: session.userId, actorRole: session.activeRole, department: "recruitment", personId: p.id, detail: `${p.fullName}: ${course} recorded${expiresOn ? `, runs out ${ukDate(expiresOn)}` : ""}.` } });
    });
  } catch (e) {
    if (upload && "key" in upload && upload.key) await deleteObject(upload.key).catch(() => {});
    throw e;
  }
  refresh(p.id);
  return ok("Training recorded.");
}

export async function uploadEmployeeDocument(personId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("employee.edit");
  if (error || !session) return error!;
  const p = await employee(personId);
  if (!p?.employment) return refused("That employee no longer exists.");
  const typeId = text(formData, "typeId");
  if (!EMPLOYEE_DOCUMENT_TYPES.some((t) => t.id === typeId)) return refused("Choose what the document is.");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return refused("Choose the file.");
  const upload = await storeUpload(p.id, typeId, file, day(text(formData, "expiresAt")), session.userId, text(formData, "note") || null);
  if ("error" in upload) return refused(upload.error!);
  try {
    await db.$transaction([
      db.documentRecord.create({ data: upload.data! }),
      ...(typeId === "employment_contract" ? [db.employment.update({ where: { personId: p.id }, data: { contractSignedAt: p.employment.contractSignedAt ?? new Date() } })] : []),
      log(session, p.id, "employee.document_added", `${p.fullName}: document added (${typeId.replace(/_/g, " ")}).`),
    ]);
  } catch (e) {
    await deleteObject(upload.key!).catch(() => {});
    throw e;
  }
  refresh(p.id);
  return ok("Added.");
}

/** Leave asked for on someone's behalf — it goes to Administration to decide, exactly like one from their portal. */
export async function raiseLeaveFor(personId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("employee.edit");
  if (error || !session) return error!;
  const out = await raiseLeave({ personId: String(personId), from: text(formData, "from"), to: text(formData, "to"), note: text(formData, "note").slice(0, 300) || null, by: { userId: session.userId, role: session.activeRole }, onBehalf: true });
  if (!out.ok) return refused(out.message);
  refresh(String(personId));
  revalidatePath("/admin/people");
  revalidatePath("/me");
  return ok(out.message);
}

/**
 * The leaver process. Their shifts after the last day come off and go on the
 * cover list; their offers and availability go; a post they were regular on
 * is freed; kit still out becomes return tasks; exit and final-pay tasks are
 * raised; portal access ends after the last day; and the seven-year retention
 * clock runs from it [11.3].
 */
export async function recordLeaver(personId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("employee.leaver");
  if (error || !session) return error!;
  const p = await db.person.findUnique({ where: { id: String(personId) }, include: { employment: true, user: { select: { id: true } }, equipment: { where: { returnedAt: null, writtenOffAt: null }, include: { item: true } } } });
  if (!p?.employment) return refused("That employee no longer exists.");
  if (p.employment.state === "ended") return refused(`${p.fullName} has already left.`);
  const lastDay = day(text(formData, "lastWorkingDay"));
  const reason = text(formData, "reason");
  const note = text(formData, "note").slice(0, 600) || null;
  if (!lastDay) return refused("Give their last working day.");
  if (lastDay < p.employment.startedAt) return refused("The last working day is before they started.");
  if (!LEAVER_REASONS.some((r) => r.id === reason)) return refused("Choose why they are leaving.");
  if (reason === "other" && !note) return refused("Say what happened.");
  const endOfLastDay = new Date(lastDay.getTime() + 86_400_000);
  const now = new Date();

  // Shifts after the last day: off the rota, onto the cover list.
  const after = await db.assignment.findMany({ where: { personId: p.id, state: { not: "cancelled" }, startsAt: { gte: endOfLastDay } }, select: { id: true, state: true } });
  const offWrites = [];
  for (const a of after.filter((x) => x.state !== "draft")) {
    const live = await loadLive(a.id);
    if (!live) continue;
    const off = officerOffWrites(live, "other", `Leaving — last working day ${ukDate(lastDay)}`, { userId: session.userId, role: session.activeRole }, now);
    if (off.ok) offWrites.push(off.writes);
  }
  const label = LEAVER_REASONS.find((r) => r.id === reason)!.label;
  await db.$transaction(async (tx) => {
    await tx.employment.update({
      where: { personId: p.id },
      data: { state: "ended", endedAt: endOfLastDay, lastWorkingDay: lastDay, leaverReason: reason, leaverNote: note, leaverRecordedById: session.userId },
    });
    await tx.person.update({ where: { id: p.id }, data: { lifecycle: "leaver" } });
    // Drafts nobody was told about simply go; the open shifts they filled open again.
    const drafts = after.filter((x) => x.state === "draft").map((x) => x.id);
    if (drafts.length) {
      await tx.openShift.updateMany({ where: { assignmentId: { in: drafts } }, data: { assignmentId: null } });
      await tx.assignment.updateMany({ where: { id: { in: drafts } }, data: { state: "cancelled" } });
    }
    await tx.shiftVolunteer.updateMany({ where: { personId: p.id, state: "waiting" }, data: { state: "withdrawn", decidedAt: now } });
    await tx.availability.deleteMany({ where: { personId: p.id, date: { gte: endOfLastDay } } });
    await tx.post.updateMany({ where: { regularPersonId: p.id }, data: { regularPersonId: null } });
    await tx.holidayRequest.updateMany({ where: { personId: p.id, decision: { in: ["pending", "approved"] }, startsOn: { gte: endOfLastDay } }, data: { decision: "cancelled", decidedAt: now, decidedByUserId: session.userId, note: "Leaving before the leave" } });
    await tx.workItem.updateMany({ where: { personId: p.id, state: "open", title: { startsWith: `Leave request: ${p.fullName},` } }, data: { state: "cancelled", doneAt: now } });
    const due = new Date(Math.max(endOfLastDay.getTime(), now.getTime()) + 3 * 86_400_000);
    await tx.workItem.createMany({
      data: [
        ...p.equipment.map((x) => ({ title: `Return from leaver ${p.fullName}: ${x.item.label}${x.size ? ` (${x.size})` : ""}${x.quantity > 1 ? ` ×${x.quantity}` : ""}`, personId: p.id, ownerRole: "admin_officer" as const, dueAt: due, slaDays: 3 })),
        { title: `Final pay and P45 for leaver ${p.fullName} — last day ${ukDate(lastDay)}`, personId: p.id, ownerRole: "admin_officer" as const, dueAt: due, slaDays: 3 },
        { title: `Exit interview with ${p.fullName} (${label.toLowerCase()})`, personId: p.id, ownerRole: "recruitment" as const, dueAt: due, slaDays: 3 },
      ],
    });
    await tx.event.create({
      data: {
        type: "employee.leaver_recorded",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "recruitment",
        personId: p.id,
        detail: `${p.fullName} is leaving: ${label}, last working day ${ukDate(lastDay)}${note ? ` — ${note}` : ""}. ${after.length} shift${after.length === 1 ? "" : "s"} after it taken off; ${p.equipment.length} item${p.equipment.length === 1 ? "" : "s"} of kit to return. Retention clock starts from the last day.`,
      },
    });
  });
  for (const w of offWrites) await db.$transaction(w);
  // Access ends after the last day — at once, if that has passed.
  if (p.user && endOfLastDay <= now) {
    await db.$transaction([db.user.update({ where: { id: p.user.id }, data: { active: false } }), db.workSession.updateMany({ where: { userId: p.user.id, signedOutAt: null }, data: { signedOutAt: now } })]);
  }
  refresh(p.id);
  revalidatePath("/scheduling");
  return ok(`${p.fullName} is recorded as leaving on ${ukDate(lastDay)}.${after.length ? ` ${after.length} shift${after.length === 1 ? "" : "s"} after that went on the cover list.` : ""} Kit returns, final pay and the exit interview are on the task lists.`);
}
