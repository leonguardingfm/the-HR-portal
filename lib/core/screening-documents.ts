/**
 * Documents on a screening file, as rules.
 *
 * What may be uploaded, what it has to say about itself, and how a file is
 * recognised as the kind it claims to be. Pure, so the test script reaches it.
 *
 * The database backstops are prisma/constraints.sql §4 (no copy of an
 * outcome-only document) and §15 (a copy described whole, of an allowed kind).
 */

import { DOCUMENT_TYPES } from "@/lib/core/documents";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The kinds a browser can be handed back safely, keyed by what the bytes say. */
export const ALLOWED_KINDS = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;
export type AllowedMime = keyof typeof ALLOWED_KINDS;

/** The document types a vetting file takes, in the order they are usually met. */
export const SCREENING_DOCUMENT_TYPES = [
  "photo_id",
  "address_proof",
  "right_to_work",
  "visa",
  "sia_licence",
  "employment_reference",
  "gap_evidence",
  "statutory_declaration",
  "criminal_record_outcome",
] as const;

export const typeSpec = (id: string) => DOCUMENT_TYPES.find((t) => t.id === id);

/**
 * What the file is, from its first bytes — never from its name or the type the
 * browser claimed, both of which the uploader controls.
 */
export function sniffMime(bytes: Uint8Array): AllowedMime | null {
  const b = (i: number) => bytes[i];
  if (bytes.length >= 5 && b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46 && b(4) === 0x2d) return "application/pdf";
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b(i) === v)
  ) {
    return "image/png";
  }
  return null;
}

const DAY = 86_400_000;

/**
 * Why this upload cannot be accepted, or null.
 *
 *  - An outcome-only type (the criminality check) takes an outcome and never
 *    a copy [7.7j].
 *  - Photographic identity is checked against the original, and who examined
 *    it is recorded [7.4c].
 *  - A document that expires carries its expiry, and an expired one is no
 *    evidence of anything current.
 *  - Proof of address is recent: nothing older than twelve months, and the
 *    common kinds (bank, card, utility, benefit) under three [SV].
 */
export function uploadProblem(args: {
  typeId: string;
  hasFile: boolean;
  sizeBytes: number;
  mime: AllowedMime | null;
  outcome: string;
  documentDate: Date | null;
  expiresAt: Date | null;
  originalSeen: boolean;
  now?: Date;
}): string | null {
  const now = args.now ?? new Date();
  const spec = typeSpec(args.typeId);
  if (!spec || !(SCREENING_DOCUMENT_TYPES as readonly string[]).includes(args.typeId)) return "Choose what the document is.";

  if (!spec.copyRetained) {
    if (args.hasFile) return `${spec.label}: the certificate is seen and not copied. Record the outcome instead (7.7j).`;
    if (args.outcome.trim().length < 5) return "Record what the check found.";
    return null;
  }

  if (!args.hasFile) return "Choose the file to upload.";
  if (args.sizeBytes > MAX_UPLOAD_BYTES) return "That file is over 10 MB. Scan it at a lower resolution, or as a PDF.";
  if (!args.mime) return "Only PDF, JPEG or PNG files — and the file has to actually be one, whatever its name says.";
  if (args.documentDate && args.documentDate.getTime() > now.getTime() + DAY) return "The date on a document cannot be in the future.";
  if (spec.expires) {
    if (!args.expiresAt) return `${spec.label} expires — give its expiry date.`;
    if (args.expiresAt.getTime() < now.getTime() - DAY) return `That ${spec.label.toLowerCase()} has expired. An expired document is not evidence of anything current.`;
  }
  if (args.typeId === "photo_id" && !args.originalSeen) {
    return "Identity is confirmed from the original. Confirm you examined it — your name is recorded against it (7.4c).";
  }
  if (args.typeId === "address_proof") {
    if (!args.documentDate) return "Give the date on the proof of address.";
    if (now.getTime() - args.documentDate.getTime() > 365 * DAY) return "Proof of address must be dated within the last 12 months.";
  }
  return null;
}

/** A note for the reviewer where a document passes, but only just. */
export function uploadWarning(typeId: string, documentDate: Date | null, now = new Date()): string | null {
  if (typeId === "address_proof" && documentDate && now.getTime() - documentDate.getTime() > 92 * DAY) {
    return "Over three months old: acceptable only for council tax, HMRC, P45/P60 or mortgage documents, not bank, card, utility or benefit statements.";
  }
  return null;
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
