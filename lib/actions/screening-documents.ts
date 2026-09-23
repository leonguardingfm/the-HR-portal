"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import {
  ALLOWED_KINDS,
  sniffMime,
  typeSpec,
  uploadProblem,
  uploadWarning,
} from "@/lib/core/screening-documents";
import { settleFileStatus } from "@/lib/db/screening-status";
import { deleteObject, putObject } from "@/lib/storage";
import type { Role } from "@/lib/types";
import { refused, ok, type ActionResult } from "./types";

/**
 * Documents on a screening file: uploading a copy (or, for the criminality
 * check, recording the outcome in place of one), verifying or rejecting it,
 * and removing an upload made in error.
 *
 * Same shape as every other write: guard, re-read, then write with the event
 * in the same transaction. The copy is written to storage first and removed
 * again if the record cannot be saved, so a file never exists without its row.
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { session: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) {
    const spec = ACTIONS[action];
    return {
      session,
      error: refused(
        `${spec.what} belongs to ${spec.owner}. You are working as ${session.activeRole.replace(/_/g, " ")}, so the platform refuses it.`,
      ),
    };
  }
  return { session, error: null };
}

const ENDED = ["complete", "withdrawn", "unsuccessful"];

const findFile = (id: string) =>
  db.screeningFile.findUnique({
    where: { id },
    include: { person: { include: { candidacies: { orderBy: { stageSince: "desc" }, take: 1, select: { id: true } } } } },
  });
type File = NonNullable<Awaited<ReturnType<typeof findFile>>>;

const refresh = (f: File) => {
  revalidatePath(`/vetting/${f.id}`);
  const c = f.person.candidacies[0];
  if (c) revalidatePath(`/candidates/${c.id}`);
};

function event(
  client: Pick<typeof db, "event">,
  session: { userId: string; activeRole: Role },
  f: { id: string; personId: string },
  documentId: string,
  type: string,
  detail: string,
) {
  return client.event.create({
    data: {
      type,
      actorUserId: session.userId,
      actorRole: session.activeRole,
      department: "vetting",
      personId: f.personId,
      screeningFileId: f.id,
      documentId,
      detail,
    },
  });
}

const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ---------------------------------------------------------------------------

export async function uploadScreeningDocument(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("screening.check");
  if (error || !session) return error!;

  const f = await findFile(String(formData.get("fileId") ?? ""));
  if (!f) return refused("That file no longer exists.");
  if (f.administratorUserId !== session.userId) return refused("Documents are added to a file by its administrator.");
  if (f.controllerReview2At || ENDED.includes(f.status)) return refused("This file has ended. It is kept as a record.");
  if (f.status === "controller_review_1" || f.status === "controller_review_2") {
    return refused("The file is with its controller for review. Add documents once it comes back.");
  }

  const typeId = String(formData.get("typeId") ?? "");
  const upload = formData.get("file");
  const file = upload instanceof File && upload.size > 0 ? upload : null;
  const bytes = file ? new Uint8Array(await file.arrayBuffer()) : null;
  const mime = bytes ? sniffMime(bytes) : null;
  const documentDate = date(formData.get("documentDate"));
  const expiresAt = date(formData.get("expiresAt"));
  const originalSeen = formData.get("originalSeen") === "on";
  const outcome = String(formData.get("outcome") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  const evidence = String(formData.get("evidenceFor") ?? "");

  const problem = uploadProblem({
    typeId,
    hasFile: Boolean(file),
    sizeBytes: file?.size ?? 0,
    mime,
    outcome,
    documentDate,
    expiresAt,
    originalSeen,
  });
  if (problem) return refused(problem);

  // What it is evidence for has to be on this file.
  let checkId: string | null = null;
  let historyPeriodId: string | null = null;
  if (evidence.startsWith("check:")) {
    const c = await db.screeningCheck.findFirst({ where: { id: evidence.slice(6), fileId: f.id }, select: { id: true } });
    if (!c) return refused("That check is not on this file.");
    checkId = c.id;
  } else if (evidence.startsWith("period:")) {
    const p = await db.historyPeriod.findFirst({ where: { id: evidence.slice(7), fileId: f.id }, select: { id: true } });
    if (!p) return refused("That history period is not on this file.");
    historyPeriodId = p.id;
  }

  const spec = typeSpec(typeId)!;
  const now = new Date();
  let storageKey: string | null = null;
  if (bytes && mime) {
    // The key says nothing about the person or the file's name.
    storageKey = `screening/${f.id}/${randomBytes(12).toString("hex")}.${ALLOWED_KINDS[mime]}`;
    await putObject(storageKey, bytes);
  }

  try {
    // The record, the check it supports and the event land together, or not
    // at all — and if not, the catch below removes the copy.
    await db.$transaction(async (tx) => {
      const doc = await tx.documentRecord.create({
        data: {
          typeId,
          screeningFileId: f.id,
          verification: spec.copyRetained ? "supplied" : "verified",
          storageKey,
          fileName: file ? file.name.slice(0, 200) : null,
          mimeType: mime,
          sizeBytes: file?.size ?? null,
          sha256: bytes ? createHash("sha256").update(bytes).digest("hex") : null,
          suppliedAt: now,
          documentDate,
          expiresAt,
          uploadedById: session.userId,
          originalSeenById: originalSeen ? session.userId : null,
          originalSeenAt: originalSeen ? now : null,
          // An outcome-only record is the verification: it is written by the
          // person who saw the certificate.
          verifiedAt: spec.copyRetained ? null : now,
          verifiedById: spec.copyRetained ? null : session.userId,
          outcome: spec.copyRetained ? null : outcome,
          note,
          checkId,
          historyPeriodId,
        },
      });
      // Evidence in: the check it supports moves to Received (Form 2).
      // Verifying the check is still a person's decision, never the upload's.
      if (checkId) {
        const c = await tx.screeningCheck.findUnique({ where: { id: checkId } });
        const derived = c?.group === "history" && (c.clause === "7.5.2a" || c.clause === "7.7");
        if (c && !derived && ["not_started", "requested", "chased"].includes(c.status)) {
          await tx.screeningCheck.update({
            where: { id: c.id },
            data: { status: "received", firstRequestSentAt: c.firstRequestSentAt ?? now, ownerUserId: session.userId },
          });
          await settleFileStatus(tx, f.id);
        }
      }
      await event(
        tx,
        session,
        f,
        doc.id,
        spec.copyRetained ? "document.uploaded" : "document.outcome_recorded",
        spec.copyRetained
          ? `${spec.label} uploaded${originalSeen ? "; original examined" : ""}.`
          : `${spec.label} recorded: ${outcome}. The certificate was seen and not copied.`,
      );
    });
  } catch (err) {
    // No row, no file.
    if (storageKey) await deleteObject(storageKey);
    throw err;
  }

  refresh(f);
  const warning = uploadWarning(typeId, documentDate);
  return ok(spec.copyRetained ? `Uploaded.${warning ? ` ${warning}` : ""}` : "Outcome recorded. No copy is kept.");
}

/** The file's administrator or controller may verify or reject a copy. */
async function loadDocForSeat(documentId: string, userId: string) {
  const doc = await db.documentRecord.findUnique({ where: { id: documentId }, include: { type: true } });
  if (!doc || !doc.screeningFileId) return { error: refused("That document is not on a screening file.") } as { error: ActionResult };
  const f = await findFile(doc.screeningFileId);
  if (!f) return { error: refused("That file no longer exists.") } as { error: ActionResult };
  if (f.administratorUserId !== userId && f.controllerUserId !== userId) {
    return { error: refused("Documents on a file are verified by its administrator or controller.") } as { error: ActionResult };
  }
  if (ENDED.includes(f.status)) return { error: refused("This file has ended. It is kept as a record.") } as { error: ActionResult };
  return { doc, f };
}

export async function verifyScreeningDocument(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("document.verify");
  if (error || !session) return error!;

  const loaded = await loadDocForSeat(String(formData.get("documentId") ?? ""), session.userId);
  if ("error" in loaded) return loaded.error;
  const { doc, f } = loaded;
  if (doc.verification !== "supplied") return refused("Only a supplied document waiting to be checked can be verified.");

  await db.$transaction([
    db.documentRecord.update({
      where: { id: doc.id },
      data: { verification: "verified", verifiedAt: new Date(), verifiedById: session.userId, rejectionReason: null },
    }),
    event(db, session, f, doc.id, "document.verified", `${doc.type.label} verified.`),
  ]);
  refresh(f);
  return ok(`${doc.type.label} verified.`);
}

export async function rejectScreeningDocument(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("document.verify");
  if (error || !session) return error!;

  const loaded = await loadDocForSeat(String(formData.get("documentId") ?? ""), session.userId);
  if ("error" in loaded) return loaded.error;
  const { doc, f } = loaded;
  const reason = String(formData.get("reason") ?? "").trim();
  if (doc.verification !== "supplied") return refused("Only a supplied document waiting to be checked can be rejected.");
  if (reason.length < 5) return refused("Say why, so the right document can be asked for.");

  await db.$transaction([
    db.documentRecord.update({ where: { id: doc.id }, data: { verification: "rejected", rejectionReason: reason } }),
    event(db, session, f, doc.id, "document.rejected", `${doc.type.label} rejected: ${reason}`),
  ]);
  refresh(f);
  return ok("Rejected. It stays on the file with the reason; ask for a replacement.");
}

/** An upload made in error, by the person who made it, before anyone has checked it. */
export async function removeScreeningDocument(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("screening.check");
  if (error || !session) return error!;

  const doc = await db.documentRecord.findUnique({
    where: { id: String(formData.get("documentId") ?? "") },
    include: { type: true },
  });
  if (!doc || !doc.screeningFileId) return refused("That document is not on a screening file.");
  const f = await findFile(doc.screeningFileId);
  if (!f) return refused("That file no longer exists.");
  if (doc.uploadedById !== session.userId) return refused("Only the person who uploaded a document can remove it.");
  if (doc.verification !== "supplied") return refused("A checked document stays on the record. Reject it with a reason instead.");

  await db.$transaction([
    db.documentRecord.delete({ where: { id: doc.id } }),
    event(db, session, f, doc.id, "document.removed", `${doc.type.label} removed by the uploader before it was checked.`),
  ]);
  if (doc.storageKey) await deleteObject(doc.storageKey);
  refresh(f);
  return ok("Removed.");
}
