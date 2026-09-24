/**
 * A candidate's own application, from the database side: finding it by its
 * link, and landing what they sent in their screening file (HR, 25 September
 * 2026).
 *
 * What the candidate states is what the screening team verifies — they do not
 * type it in again. Their history becomes the stated periods on the file;
 * their documents move onto it, supplied and awaiting verification; their
 * e-signed declarations mark the consent checks received. The contact details
 * they give for referees are kept as given and marked to be verified
 * independently: BS 7858 does not let a number the individual supplied be
 * relied on [7.5.2a].
 */

import type { Prisma } from "@prisma/client";
import type { ApplicationDraft } from "@/lib/core/application";
import { db } from "./client";
import { hashToken } from "./email";
import { settleFileStatus } from "./screening-status";

/** Documents that belong on a screening file, not just on the person. */
export const SCREENING_DOCUMENT_TYPES = ["photo_id", "address_proof", "right_to_work", "sia_licence", "employment_reference", "gap_evidence", "statutory_declaration", "visa"];

/** The invite behind a link, if the link is live: not expired, withdrawn or already used. */
export async function inviteByToken(token: string, purpose: "application" | "welcome_pack" | null = "application") {
  if (!token || token.length < 20 || token.length > 100) return { invite: null, problem: "This link is not valid." as const };
  const invite = await db.candidateInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      candidacy: {
        include: {
          person: {
            include: {
              documents: { where: { disposedAt: null }, include: { type: true } },
              screeningFile: { where: { disposedAt: null }, select: { id: true, documents: { where: { disposedAt: null, note: "Uploaded by the candidate" }, include: { type: true } } } },
            },
          },
          requirement: { include: { client: true } },
        },
      },
    },
  });
  // A link opens only the form it was sent for.
  if (!invite || (purpose && invite.purpose !== purpose)) return { invite: null, problem: "This link is not valid." as const };
  if (invite.revokedAt) return { invite: null, problem: "This link has been replaced. Use the newest email we sent you." as const };
  if (invite.submittedAt) return { invite: null, problem: "done" as const, submittedAt: invite.submittedAt, purpose: invite.purpose };
  if (invite.expiresAt < new Date()) return { invite: null, problem: "This link has expired. Ask the recruitment team to send you a new one." as const };
  return { invite, problem: null };
}

/** The screening period that applies: the client's contract, where there is one; five years otherwise. */
export function yearsFor(invite: { candidacy: { requirement: { client: { screeningPeriodYears: number } } | null } }): number {
  return invite.candidacy.requirement?.client.screeningPeriodYears === 10 ? 10 : 5;
}

/**
 * Land a submitted application in a screening file: the history as stated
 * periods, the documents moved onto the file, the consent checks received.
 * Run when the application is submitted if the file is already open, and when
 * the file is opened otherwise.
 */
export async function importApplication(
  tx: Prisma.TransactionClient,
  args: { fileId: string; personId: string; submission: ApplicationDraft & { signedName?: string; signedAt?: string }; actorUserId: string | null },
) {
  const d = args.submission;
  let periods = 0;
  const existing = await tx.historyPeriod.count({ where: { fileId: args.fileId } });
  // A file someone has already started on keeps its history; nothing is doubled.
  if (existing === 0) {
    for (const h of d.history ?? []) {
      const contact = [h.contactName, h.contactPhone, h.contactEmail].filter(Boolean).join(", ");
      await tx.historyPeriod.create({
        data: {
          fileId: args.fileId,
          kind: h.kind,
          organisation: h.organisation || null,
          role: h.role || null,
          statedFrom: new Date(`${h.from}T00:00:00Z`),
          statedTo: h.current || !h.to ? null : new Date(`${h.to}T00:00:00Z`),
          isCurrent: h.current,
          permissionToContact: h.current && h.kind === "employment" ? h.mayContact : null,
          notes: [
            contact ? `Contact given by the candidate: ${contact} — establish the employer's number independently before relying on it (7.5.2a).` : null,
            h.reasonForLeaving ? `Reason for leaving: ${h.reasonForLeaving}` : null,
          ]
            .filter(Boolean)
            .join(" ") || null,
        },
      });
      periods++;
    }
  }

  // Their documents move onto the file, supplied and waiting to be verified.
  const moved = await tx.documentRecord.updateMany({
    where: { personId: args.personId, typeId: { in: SCREENING_DOCUMENT_TYPES }, screeningFileId: null },
    data: { personId: null, screeningFileId: args.fileId },
  });

  // The e-signed declarations are the consent the standard asks for with the application.
  if (d.signedAt) {
    const signed = `E-signed by the candidate as “${d.signedName}” in their application, ${new Date(d.signedAt).toISOString().slice(0, 16).replace("T", " ")} UTC.`;
    await tx.screeningCheck.updateMany({
      where: { fileId: args.fileId, group: "consent", status: { in: ["not_started", "requested", "chased"] } },
      data: { status: "received", firstRequestSentAt: new Date(d.signedAt), notes: signed, ownerUserId: args.actorUserId },
    });
  }
  await settleFileStatus(tx, args.fileId);
  return { periods, documents: moved.count };
}

/** The latest submitted application for a person, if any — for a file being opened. */
export async function submittedApplicationFor(personId: string) {
  return db.candidateInvite.findFirst({
    where: { purpose: "application", submittedAt: { not: null }, candidacy: { personId } },
    orderBy: { submittedAt: "desc" },
    select: { submission: true },
  });
}

/** Everything the candidate has uploaded through their link, on their record or on their screening file. */
export function candidateUploads(invite: NonNullable<Awaited<ReturnType<typeof inviteByToken>>["invite"]>) {
  const p = invite.candidacy.person;
  return [...p.documents.filter((d) => d.note === "Uploaded by the candidate"), ...(p.screeningFile[0]?.documents ?? [])].sort((a, b) => (a.suppliedAt?.getTime() ?? 0) - (b.suppliedAt?.getTime() ?? 0));
}
