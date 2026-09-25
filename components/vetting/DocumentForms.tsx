"use client";

import { useEffect, useState } from "react";
import { useFormAction } from "@/components/ui/useFormAction";
import {
  rejectScreeningDocument,
  removeScreeningDocument,
  uploadScreeningDocument,
  verifyScreeningDocument,
} from "@/lib/actions/screening-documents";
import type { ActionResult } from "@/lib/actions/types";
import { MAX_UPLOAD_BYTES } from "@/lib/core/screening-documents";

const input =
  "h-8 w-full rounded-md border px-2.5 text-[12px] outline-none focus:border-[var(--series-1)] focus:ring-2 focus:ring-[var(--series-1)]/30";
const inputStyle = { background: "var(--surface-1)", color: "var(--text-primary)" } as const;
const primary = "h-8 rounded-md px-3 text-[12px] font-medium whitespace-nowrap text-white disabled:opacity-50";
const quiet = "h-7 rounded-md border px-2.5 text-[11px] font-medium whitespace-nowrap disabled:opacity-50";

function Result({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className="mt-1.5 text-[11px] leading-snug"
      style={{ color: state.ok ? "var(--good-text)" : "var(--critical-text)" }}
    >
      {state.message}
    </p>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block text-[11px] font-medium ${wide ? "sm:col-span-2" : ""}`} style={{ color: "var(--text-secondary)" }}>
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

export interface UploadType {
  id: string;
  label: string;
  expires: boolean;
  copyRetained: boolean;
  clause?: string;
}

export function UploadDocumentForm({
  fileId,
  types,
  evidence,
}: {
  fileId: string;
  types: UploadType[];
  evidence: { value: string; label: string; group: string }[];
}) {
  const { state, pending, form } = useFormAction(uploadScreeningDocument);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  // The form clears on success; the chosen type clears with it.
  useEffect(() => {
    if (state?.ok) setTypeId(types[0]?.id ?? "");
  }, [state, types]);
  const type = types.find((t) => t.id === typeId);
  const outcomeOnly = type ? !type.copyRetained : false;
  const groups = [...new Set(evidence.map((e) => e.group))];

  return (
    <details className="rounded-md border" style={{ borderColor: "var(--hairline)" }}>
      <summary className="cursor-pointer px-3 py-2.5 text-[12px] font-medium select-none">Add a document</summary>
      <form {...form} className="grid gap-2.5 border-t px-3 pt-3 pb-3 sm:grid-cols-2" style={{ borderColor: "var(--hairline)" }}>
        <input type="hidden" name="fileId" value={fileId} />
        <Field label="What it is">
          <select name="typeId" value={typeId} onChange={(e) => setTypeId(e.target.value)} className={input} style={inputStyle}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
                {t.copyRetained ? "" : " — outcome only"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Evidence for (optional)">
          <select name="evidenceFor" defaultValue="" className={input} style={inputStyle}>
            <option value="">The file in general</option>
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {evidence
                  .filter((e) => e.group === g)
                  .map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>

        {outcomeOnly ? (
          <>
            <p className="rounded-md px-2.5 py-2 text-[11px] sm:col-span-2" style={{ background: "var(--wash-warning)" }}>
              The certificate is seen and <strong>not copied</strong> (7.7j). Record what it showed and the date on it; no file is kept.
            </p>
            <Field label="Outcome" wide>
              <textarea
                name="outcome"
                rows={2}
                required
                placeholder="e.g. Basic disclosure — no unspent convictions shown. Certificate no. ending 4471."
                className={`${input} h-auto py-2`}
                style={inputStyle}
              />
            </Field>
            <Field label="Date on the certificate">
              <input name="documentDate" type="date" className={input} style={inputStyle} />
            </Field>
          </>
        ) : (
          <>
            <Field label="File — PDF, JPEG or PNG, up to 10 MB" wide>
              <input
                name="file"
                type="file"
                required
                accept="application/pdf,image/jpeg,image/png"
                // Refused here before a byte is sent; the server checks again.
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0];
                  e.currentTarget.setCustomValidity(
                    f && f.size > MAX_UPLOAD_BYTES ? "That file is over 10 MB. Scan it at a lower resolution, or as a PDF." : "",
                  );
                }}
                className="block w-full text-[12px] file:mr-3 file:rounded-md file:border file:px-2.5 file:py-1 file:text-[12px]"
              />
            </Field>
            <Field label={typeId === "address_proof" ? "Date on the document (must be recent)" : "Date on the document"}>
              <input name="documentDate" type="date" required={typeId === "address_proof"} className={input} style={inputStyle} />
            </Field>
            {type?.expires && (
              <Field label="Expires">
                <input name="expiresAt" type="date" required className={input} style={inputStyle} />
              </Field>
            )}
            <label className="flex items-start gap-2 text-[11px] sm:col-span-2" style={{ color: "var(--text-secondary)" }}>
              <input type="checkbox" name="originalSeen" required={typeId === "photo_id"} className="mt-0.5" />
              <span>
                I examined the original document, and my name is recorded against it (7.4c)
                {typeId === "photo_id" ? " — required for photographic identity" : ""}
              </span>
            </label>
          </>
        )}
        <Field label="Note (optional)" wide>
          <input name="note" autoComplete="off" className={input} style={inputStyle} />
        </Field>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} className={primary} style={{ background: "var(--series-1)" }}>
            {pending ? "Uploading…" : outcomeOnly ? "Record outcome" : "Upload"}
          </button>
          <Result state={state} />
        </div>
      </form>
    </details>
  );
}

export function VerifyDocumentButtons({ documentId }: { documentId: string }) {
  const verify = useFormAction(verifyScreeningDocument);
  const reject = useFormAction(rejectScreeningDocument);
  const [rejecting, setRejecting] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <form {...verify.form}>
          <input type="hidden" name="documentId" value={documentId} />
          <button type="submit" disabled={verify.pending} className={quiet} style={{ background: "var(--surface-1)" }}>
            {verify.pending ? "Saving…" : "Verify"}
          </button>
        </form>
        <button type="button" onClick={() => setRejecting((r) => !r)} className={quiet} style={{ background: "var(--surface-1)" }}>
          Reject
        </button>
      </div>
      {rejecting && (
        <form {...reject.form} className="flex gap-1.5">
          <input type="hidden" name="documentId" value={documentId} />
          <input name="reason" required aria-label="Why it is rejected" placeholder="Why — e.g. name not visible" className={`${input} h-7 w-56`} style={inputStyle} />
          <button type="submit" disabled={reject.pending} className={quiet} style={{ background: "var(--surface-1)" }}>
            {reject.pending ? "Saving…" : "Reject"}
          </button>
        </form>
      )}
      <Result state={verify.state ?? reject.state} />
    </div>
  );
}

export function RemoveDocumentButton({ documentId }: { documentId: string }) {
  const { state, pending, form } = useFormAction(removeScreeningDocument);
  return (
    <form {...form}>
      <input type="hidden" name="documentId" value={documentId} />
      <button type="submit" disabled={pending} className="text-[11px] underline-offset-2 hover:underline" style={{ color: "var(--text-muted)" }}>
        {pending ? "Removing…" : "Remove"}
      </button>
      <Result state={state} />
    </form>
  );
}
