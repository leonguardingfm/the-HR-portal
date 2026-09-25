import { Card } from "@/components/ui/Card";
import { ClauseRef, StatusPill } from "@/components/ui/StatusPill";
import { humanSize } from "@/lib/core/screening-documents";
import { formatDate } from "@/lib/format";
import type { Severity } from "@/lib/types";
import {
  RemoveDocumentButton,
  UploadDocumentForm,
  VerifyDocumentButtons,
  type UploadType,
} from "./DocumentForms";

export interface ScreeningDocumentRow {
  id: string;
  typeLabel: string;
  clause: string | null;
  copyRetained: boolean;
  verification: "not_supplied" | "supplied" | "rejected" | "verified" | "expired";
  fileName: string | null;
  sizeBytes: number | null;
  hasCopy: boolean;
  documentDate: Date | null;
  expiresAt: Date | null;
  suppliedAt: Date | null;
  uploadedBy: string | null;
  uploadedById: string | null;
  originalSeenBy: string | null;
  verifiedBy: string | null;
  outcome: string | null;
  rejectionReason: string | null;
  note: string | null;
  evidenceFor: string | null;
}

const STATUS: Record<ScreeningDocumentRow["verification"], { label: string; severity: Severity }> = {
  not_supplied: { label: "Not supplied", severity: "neutral" },
  supplied: { label: "To check", severity: "warning" },
  rejected: { label: "Rejected", severity: "critical" },
  verified: { label: "Verified", severity: "good" },
  expired: { label: "Expired", severity: "critical" },
};

/**
 * Everything supplied for this file: the copy, the date on it, who examined
 * the original, and whether it has been checked. Copies open only through
 * the permission-checked /documents route, and every view is logged.
 */
export function ScreeningDocuments({
  fileId,
  rows,
  canUpload,
  canCheck,
  me,
  types,
  evidence,
}: {
  fileId: string;
  rows: ScreeningDocumentRow[];
  canUpload: boolean;
  canCheck: boolean;
  me: string;
  types: UploadType[];
  evidence: { value: string; label: string; group: string }[];
}) {
  const toCheck = rows.filter((r) => r.verification === "supplied").length;
  return (
    <Card
      title="Documents"
      subtitle={
        rows.length === 0
          ? "Nothing supplied yet. Identity, address, right to work, references and gap evidence go here."
          : `${rows.length} on file${toCheck ? ` · ${toCheck} waiting to be checked` : ""}. Copies open in a new tab; every view is logged.`
      }
    >
      {rows.length > 0 && (
        <ul className="mb-3 divide-y rounded-md border" style={{ borderColor: "var(--hairline)" }}>
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">
                  {r.typeLabel} {r.clause && <ClauseRef clause={r.clause} />}
                </p>
                {r.hasCopy ? (
                  <p className="mt-0.5 text-[12px]">
                    <a
                      href={`/documents/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline-offset-2 hover:underline"
                      style={{ color: "var(--accent-text)" }}
                    >
                      {r.fileName ?? "View copy"}
                    </a>
                    {r.sizeBytes ? <span style={{ color: "var(--text-muted)" }}> · {humanSize(r.sizeBytes)}</span> : null}
                  </p>
                ) : !r.copyRetained ? (
                  <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {r.outcome} <span style={{ color: "var(--text-muted)" }}>· no copy kept (7.7j)</span>
                  </p>
                ) : null}
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {[
                    r.documentDate ? `dated ${formatDate(r.documentDate)}` : null,
                    r.expiresAt ? `expires ${formatDate(r.expiresAt)}` : null,
                    r.evidenceFor ? `for: ${r.evidenceFor}` : null,
                    r.uploadedBy ? `added by ${r.uploadedBy}${r.suppliedAt ? ` ${formatDate(r.suppliedAt)}` : ""}` : null,
                    r.originalSeenBy ? `original examined by ${r.originalSeenBy}` : null,
                    r.verifiedBy && r.verification === "verified" ? `verified by ${r.verifiedBy}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {r.rejectionReason && (
                  <p className="mt-0.5 text-[12px]" style={{ color: "var(--critical-text)" }}>
                    Rejected: {r.rejectionReason}
                  </p>
                )}
                {r.note && (
                  <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {r.note}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusPill severity={STATUS[r.verification].severity} label={STATUS[r.verification].label} />
                {canCheck && r.verification === "supplied" && <VerifyDocumentButtons documentId={r.id} />}
                {canUpload && r.verification === "supplied" && r.uploadedById === me && <RemoveDocumentButton documentId={r.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canUpload && <UploadDocumentForm fileId={fileId} types={types} evidence={evidence} />}
    </Card>
  );
}
