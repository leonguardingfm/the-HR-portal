"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { APPLICATION_STEPS, DECLARATIONS, REQUESTED_DOCUMENTS, cleanDraft, stepProblem, submitProblem, type ApplicationDraft, type StepId } from "@/lib/core/application";
import { ukDate } from "@/lib/core/rota";
import { ALLOWED_KINDS, sniffMime } from "@/lib/core/screening-documents";
import { COMPANY, sendEmail } from "@/lib/db/email";
import { SCREENING_DOCUMENT_TYPES, candidateUploads, importApplication, inviteByToken, yearsFor } from "@/lib/db/application";
import { rewriteIdentityKeys } from "@/lib/db/people";
import { WELCOME_ACKS, welcomeProblem } from "@/lib/core/welcome";
import { deleteObject, putObject } from "@/lib/storage";
import { refused, ok, type ActionResult } from "./types";

/**
 * The candidate's own application, through the link emailed to them (HR, 25
 * September 2026). There is no account and no session: the link is the key.
 * Each action checks it first — live, not used, not withdrawn, not expired —
 * and touches only the candidate the link belongs to.
 */
async function guard(token: string, purpose: "application" | "welcome_pack" = "application") {
  const r = await inviteByToken(String(token ?? ""), purpose);
  if (!r.invite) return { invite: null, error: refused(r.problem === "done" ? (purpose === "application" ? "Your application has been sent. Thank you — we will be in touch." : "Your welcome pack is signed. Thank you.") : r.problem) };
  return { invite: r.invite, error: null };
}

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_UPLOADS = 12;
type Result = ActionResult & { done?: StepId[] };

/** Save what they have filled in; with a step, check it and mark it done. */
export async function saveApplication(token: string, input: unknown, step: StepId | null): Promise<Result> {
  const { invite, error } = await guard(token);
  if (error || !invite) return error!;
  const draft = cleanDraft(input);
  const today = ukDate(new Date());
  const done = new Set(((invite.draft as ApplicationDraft | null)?.done ?? []).filter((s) => APPLICATION_STEPS.some((x) => x.id === s)));
  if (step) {
    const problem = stepProblem(step, draft, today, yearsFor(invite));
    if (problem) return refused(problem);
    done.add(step);
  }
  draft.done = [...done];
  await db.candidateInvite.update({
    where: { id: invite.id },
    data: { draft: draft as object, openedAt: invite.openedAt ?? new Date() },
  });
  return { ...ok(step ? "Saved." : "Saved as you go."), done: draft.done };
}

/** One of their documents: photo ID, proof of address, right to work, SIA licence or CV. */
export async function uploadApplicationDocument(token: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { invite, error } = await guard(token);
  if (error || !invite) return error!;
  const typeId = String(formData.get("typeId") ?? "");
  const spec = REQUESTED_DOCUMENTS.find((r) => r.typeId === typeId);
  if (!spec) return refused("Choose what the document is.");
  const upload = formData.get("file");
  if (!(upload instanceof File) || upload.size === 0) return refused("Choose the file, or take a photo of it.");
  if (upload.size > MAX_BYTES) return refused("That file is over 10 MB. Take the photo again, or save it smaller.");
  const bytes = new Uint8Array(await upload.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) return refused("Upload a photo (JPEG or PNG) or a PDF.");
  const documentDateRaw = String(formData.get("documentDate") ?? "");
  const documentDate = /^\d{4}-\d{2}-\d{2}$/.test(documentDateRaw) ? new Date(`${documentDateRaw}T00:00:00Z`) : null;
  if (spec.needsDate && !documentDate) return refused("Give the date printed on the document.");
  const person = invite.candidacy.person;
  if (candidateUploads(invite).length >= MAX_UPLOADS) return refused("That is the most documents that can be sent here. Remove one to add another.");

  // Screening documents go on the screening file where one is open; the rest on the person.
  const fileId = SCREENING_DOCUMENT_TYPES.includes(typeId) ? (person.screeningFile[0]?.id ?? null) : null;
  const key = `applicants/${invite.candidacyId}/${randomBytes(12).toString("hex")}.${ALLOWED_KINDS[mime]}`;
  await putObject(key, bytes);
  try {
    await db.$transaction([
      db.documentRecord.create({
        data: {
          typeId,
          personId: fileId ? null : person.id,
          screeningFileId: fileId,
          verification: "supplied",
          storageKey: key,
          fileName: upload.name.slice(0, 200),
          mimeType: mime,
          sizeBytes: upload.size,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          suppliedAt: new Date(),
          documentDate,
          note: "Uploaded by the candidate",
        },
      }),
      db.event.create({
        data: { type: "candidate.document_uploaded", actorSystem: "candidate-portal", department: "recruitment", personId: person.id, screeningFileId: fileId, detail: `${person.fullName} uploaded their ${spec.label.toLowerCase()} through their application link.` },
      }),
    ]);
  } catch (e) {
    await deleteObject(key).catch(() => {});
    throw e;
  }
  revalidatePath(`/apply/${token}`);
  return ok(`${spec.label} added.`);
}

/** Take back a document they uploaded by mistake — only their own, and only before anyone has checked it. */
export async function removeApplicationDocument(token: string, documentId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { invite, error } = await guard(token);
  if (error || !invite) return error!;
  const person = invite.candidacy.person;
  const doc = await db.documentRecord.findUnique({ where: { id: String(documentId) } });
  const theirs = doc && (doc.personId === person.id || (doc.screeningFileId && doc.screeningFileId === person.screeningFile[0]?.id));
  if (!doc || !theirs || doc.note !== "Uploaded by the candidate" || doc.uploadedById) return refused("That document cannot be removed here.");
  if (doc.verification !== "supplied") return refused("That document has already been checked, so it stays.");
  await db.$transaction([
    db.documentRecord.delete({ where: { id: doc.id } }),
    db.event.create({ data: { type: "candidate.document_removed", actorSystem: "candidate-portal", department: "recruitment", personId: person.id, detail: `${person.fullName} removed a document they had uploaded.` } }),
  ]);
  if (doc.storageKey) await deleteObject(doc.storageKey).catch(() => {});
  revalidatePath(`/apply/${token}`);
  return ok("Removed.");
}

/** Sign and send. Everything they stated lands on their record, and in their screening file. */
export async function submitApplication(token: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { invite, error } = await guard(token);
  if (error || !invite) return error!;
  const draft = cleanDraft(invite.draft);
  const person = invite.candidacy.person;
  const uploaded = candidateUploads(invite).map((d) => d.typeId);
  const signedName = String(formData.get("signedName") ?? "").trim().slice(0, 120);
  const ticked = formData.getAll("declaration").map(String);
  const today = ukDate(new Date());
  const problem = submitProblem(draft, uploaded, signedName, ticked, today, yearsFor(invite));
  if (problem) return refused(problem);

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const now = new Date();
  const a = draft.about!;
  const submission = {
    ...draft,
    signedName,
    signedAt: now.toISOString(),
    signedIp: ip,
    declarations: DECLARATIONS.map((d) => d.text),
  };

  const warning = await db.$transaction(async (tx) => {
    await tx.candidateInvite.update({ where: { id: invite.id }, data: { submittedAt: now, submission: submission as object, signedName, signedAt: now, signedIp: ip, draft: draft as object } });
    // What they stated about themselves becomes their record. A clash with
    // somebody else is not a reason to lose their application — it is flagged.
    const clash = await rewriteIdentityKeys(tx, person.id, {
      fullName: a.fullName!,
      dateOfBirth: new Date(`${a.dateOfBirth}T00:00:00Z`),
      email: a.email || null,
      phone: a.phone || null,
      nationalInsurance: a.nationalInsurance ? a.nationalInsurance.replace(/\s+/g, "").toUpperCase() : null,
    });
    await tx.person.update({
      where: { id: person.id },
      data: {
        fullName: a.fullName!,
        previousName: a.previousNames || null,
        dateOfBirth: new Date(`${a.dateOfBirth}T00:00:00Z`),
        phone: a.phone || null,
        email: a.email || null,
        address: a.address || null,
        postcode: a.postcode?.toUpperCase() || null,
        ...(clash ? {} : { nationalInsurance: a.nationalInsurance ? a.nationalInsurance.replace(/\s+/g, "").toUpperCase() : null }),
        nextOfKinName: draft.nextOfKin?.name || null,
        nextOfKinRelation: draft.nextOfKin?.relation || null,
        nextOfKinPhone: draft.nextOfKin?.phone || null,
        lifecycle: person.lifecycle === "enquiry" ? "applicant" : person.lifecycle,
      },
    });
    const c = invite.candidacy;
    await tx.candidacy.update({
      where: { id: c.id },
      data: { applicationSubmittedAt: now, ...(["sourcing", "shortlisted", "invited"].includes(c.stage) ? { stage: "application_received", stageSince: now } : {}) },
    });
    const fileId = person.screeningFile[0]?.id;
    if (fileId) await importApplication(tx, { fileId, personId: person.id, submission, actorUserId: null });
    await tx.workItem.create({
      data: {
        title: `Application received: ${a.fullName} — check it is complete${clash ? `. Possible duplicate: ${clash}` : ""}`,
        personId: person.id,
        ownerRole: "recruitment",
        ownerUserId: c.ownerUserId,
        dueAt: new Date(now.getTime() + 86_400_000),
        slaDays: 1,
      },
    });
    await tx.event.create({
      data: {
        type: "candidate.application_submitted",
        actorSystem: "candidate-portal",
        department: "recruitment",
        personId: person.id,
        detail: `${a.fullName} sent their application, e-signed as “${signedName}” from ${ip}: ${draft.history?.length ?? 0} history entries, ${draft.addresses?.length ?? 0} addresses, ${uploaded.length} documents.${fileId ? " Added to their screening file." : ""}`,
      },
    });
    if (a.email) {
      await sendEmail(
        {
          to: a.email,
          subject: `We have your application — ${COMPANY}`,
          body: `Hello ${a.fullName!.split(" ")[0]},\n\nThank you — we have your application and documents. We will check them and be in touch about the next step.\n\n${COMPANY} Recruitment`,
          purpose: "application_received",
          personId: person.id,
          candidacyId: c.id,
        },
        tx,
      );
    }
    return clash;
  });
  // A possible duplicate is for Recruitment to look at, not the candidate.
  void warning;
  return ok("Sent. Thank you — we will be in touch.");
}

/**
 * The welcome pack, signed through its link (HR, 25 September 2026). Each
 * part they accept completes its onboarding step; their next of kin goes on
 * their record; a photo of a signed paper contract, if they have one, is kept
 * with it. Moving them on to the next stage stays Recruitment's decision.
 */
export async function submitWelcomePack(token: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { invite, error } = await guard(token, "welcome_pack");
  if (error || !invite) return error!;
  const person = invite.candidacy.person;
  const input = {
    acks: formData.getAll("ack").map(String),
    nextOfKinName: String(formData.get("nextOfKinName") ?? "").trim().slice(0, 120),
    nextOfKinRelation: String(formData.get("nextOfKinRelation") ?? "").trim().slice(0, 60),
    nextOfKinPhone: String(formData.get("nextOfKinPhone") ?? "").trim().slice(0, 40),
    signedName: String(formData.get("signedName") ?? "").trim().slice(0, 120),
  };
  const problem = welcomeProblem(input, person.fullName);
  if (problem) return refused(problem);

  // A photo or scan of the signed paper contract, if they have one.
  const upload = formData.get("contract");
  let stored: { key: string; data: Parameters<typeof db.documentRecord.create>[0]["data"] } | null = null;
  if (upload instanceof File && upload.size > 0) {
    if (upload.size > MAX_BYTES) return refused("That file is over 10 MB. Take the photo again, or save it smaller.");
    const bytes = new Uint8Array(await upload.arrayBuffer());
    const mime = sniffMime(bytes);
    if (!mime) return refused("Upload a photo (JPEG or PNG) or a PDF of the signed contract.");
    const key = `applicants/${invite.candidacyId}/${randomBytes(12).toString("hex")}.${ALLOWED_KINDS[mime]}`;
    stored = {
      key,
      data: {
        typeId: "employment_contract",
        personId: person.id,
        verification: "supplied",
        storageKey: key,
        fileName: upload.name.slice(0, 200),
        mimeType: mime,
        sizeBytes: upload.size,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        suppliedAt: new Date(),
        note: "Signed contract uploaded by the candidate",
      },
    };
    await putObject(key, bytes);
  }

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const now = new Date();
  const signature = `Signed online as “${input.signedName}” on ${ukDate(now)} from ${ip}`;
  try {
    await db.$transaction(async (tx) => {
      await tx.candidateInvite.update({
        where: { id: invite.id },
        data: { submittedAt: now, signedName: input.signedName, signedAt: now, signedIp: ip, submission: { ...input, accepted: WELCOME_ACKS.map((a) => ({ id: a.id, title: a.title, text: a.text })) } as object },
      });
      await tx.person.update({ where: { id: person.id }, data: { nextOfKinName: input.nextOfKinName, nextOfKinRelation: input.nextOfKinRelation || null, nextOfKinPhone: input.nextOfKinPhone } });
      // Each part accepted completes its step; one already ticked by hand stays as it was.
      const already = new Set((await tx.onboardingStep.findMany({ where: { candidacyId: invite.candidacyId }, select: { step: true } })).map((x) => x.step));
      const steps = [...WELCOME_ACKS.map((a) => ({ step: a.step, note: `${a.title}: ${signature}.` })), { step: "next_of_kin_recorded" as const, note: `Given by the candidate in their welcome pack: ${input.nextOfKinName}${input.nextOfKinRelation ? ` (${input.nextOfKinRelation})` : ""}.` }];
      const add = steps.filter((x) => !already.has(x.step));
      if (add.length) await tx.onboardingStep.createMany({ data: add.map((x) => ({ candidacyId: invite.candidacyId, step: x.step, doneAt: now, note: x.note })) });
      if (stored) await tx.documentRecord.create({ data: stored.data });
      await tx.workItem.create({
        data: {
          title: `Welcome pack signed: ${person.fullName} — check it${stored ? " and the uploaded contract" : ""}, then take bank details and move them on`,
          personId: person.id,
          ownerRole: "recruitment",
          ownerUserId: invite.candidacy.ownerUserId,
          dueAt: new Date(now.getTime() + 86_400_000),
          slaDays: 1,
        },
      });
      await tx.event.create({
        data: {
          type: "candidate.welcome_pack_signed",
          actorSystem: "candidate-portal",
          department: "recruitment",
          personId: person.id,
          detail: `${person.fullName} signed their welcome pack online (${WELCOME_ACKS.map((a) => a.title.toLowerCase()).join(", ")}). ${signature}.${stored ? " A signed paper contract was uploaded too." : ""}`,
        },
      });
      if (person.email) {
        await sendEmail(
          {
            to: person.email,
            subject: `Your welcome pack is signed — ${COMPANY}`,
            body: `Hello ${person.fullName.split(" ")[0]},\n\nThank you — your welcome pack is signed. You accepted: ${WELCOME_ACKS.map((a) => a.title.toLowerCase()).join(", ")}.\n\n${signature}.\n\nWe will be in touch about your start and your first shift.\n\n${COMPANY} Recruitment`,
            purpose: "welcome_pack_signed",
            personId: person.id,
            candidacyId: invite.candidacyId,
          },
          tx,
        );
      }
    });
  } catch (e) {
    if (stored) await deleteObject(stored.key).catch(() => {});
    throw e;
  }
  revalidatePath(`/candidates/${invite.candidacyId}`);
  revalidatePath("/onboarding");
  return ok("Signed. Thank you — welcome to the team.");
}
