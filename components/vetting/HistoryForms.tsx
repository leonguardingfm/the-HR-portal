"use client";

import { useEffect, useState } from "react";
import { useFormAction } from "@/components/ui/useFormAction";
import {
  addHistoryPeriod,
  chaseReference,
  recordPermission,
  removeHistoryPeriod,
  requestReference,
  verifyPeriod,
} from "@/lib/actions/history";
import type { ActionResult } from "@/lib/actions/types";

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
      style={{ color: state.ok ? "var(--status-good)" : "var(--status-critical)" }}
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

function Disclose({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="rounded-md border" style={{ borderColor: "var(--hairline)" }} open={open}>
      <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium select-none">{title}</summary>
      <div className="border-t px-3 pt-3 pb-3" style={{ borderColor: "var(--hairline)" }}>
        {children}
      </div>
    </details>
  );
}

const KINDS = [
  ["employment", "Employment"],
  ["self_employment", "Self-employment"],
  ["education", "Education"],
  ["unemployment", "Registered unemployment"],
  ["career_break", "Career break"],
  ["residence_abroad", "Residence abroad"],
  ["gap", "Other gap"],
] as const;

export function AddPeriodForm({ fileId, open = false }: { fileId: string; open?: boolean }) {
  const { state, pending, form } = useFormAction(addHistoryPeriod);
  const [kind, setKind] = useState("employment");
  const [current, setCurrent] = useState(false);
  // The form clears on success; its chosen kind and "continuing" clear with it.
  useEffect(() => {
    if (state?.ok) {
      setKind("employment");
      setCurrent(false);
    }
  }, [state]);
  return (
    <Disclose title="Add a period" open={open}>
      <form {...form} className="grid gap-2.5 sm:grid-cols-2">
        <input type="hidden" name="fileId" value={fileId} />
        <Field label="What it was">
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={input} style={inputStyle}>
            {KINDS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label={kind === "education" ? "School, college or university" : kind === "employment" ? "Employer" : "Organisation or place (optional)"}>
          <input name="organisation" autoComplete="off" className={input} style={inputStyle} />
        </Field>
        <Field label="From">
          <input name="statedFrom" type="date" required className={input} style={inputStyle} />
        </Field>
        <Field label="To">
          <input name="statedTo" type="date" disabled={current} className={input} style={inputStyle} />
        </Field>
        <label className="flex items-center gap-2 text-[11px] sm:col-span-2" style={{ color: "var(--text-secondary)" }}>
          <input type="checkbox" name="isCurrent" checked={current} onChange={(e) => setCurrent(e.target.checked)} />
          Still continuing{kind === "employment" ? " — their current employer" : ""}
        </label>
        {current && kind === "employment" && (
          <Field label="Permission to contact this employer (7.7b)" wide>
            <select name="permissionToContact" defaultValue="" className={input} style={inputStyle}>
              <option value="">Not asked yet</option>
              <option value="yes">Given in writing</option>
              <option value="no">Withheld until an offer</option>
            </select>
          </Field>
        )}
        {(kind === "employment" || kind === "self_employment") && (
          <Field label="Role (optional)">
            <input name="role" autoComplete="off" className={input} style={inputStyle} />
          </Field>
        )}
        <Field label="Note (optional)" wide={!(kind === "employment" || kind === "self_employment")}>
          <input
            name="notes"
            autoComplete="off"
            placeholder={kind === "gap" || kind === "career_break" ? "Reason: travel, caring, illness…" : ""}
            className={input}
            style={inputStyle}
          />
        </Field>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} className={primary} style={{ background: "var(--series-1)" }}>
            {pending ? "Adding…" : "Add period"}
          </button>
          <Result state={state} />
        </div>
      </form>
    </Disclose>
  );
}

export function PermissionForm({ periodId }: { periodId: string }) {
  const { state, pending, form } = useFormAction(recordPermission);
  return (
    <form {...form} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="periodId" value={periodId} />
      <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
        Permission to contact (7.7b):
      </span>
      <button type="submit" name="permission" value="yes" disabled={pending} className={quiet} style={{ background: "var(--surface-1)" }}>
        Given in writing
      </button>
      <button type="submit" name="permission" value="no" disabled={pending} className={quiet} style={{ background: "var(--surface-1)" }}>
        Withheld
      </button>
      <Result state={state} />
    </form>
  );
}

export function RequestForm({ periodId }: { periodId: string }) {
  const { state, pending, form } = useFormAction(requestReference);
  return (
    <Disclose title="Send the 1st reference request">
      <form {...form} className="grid gap-2.5 sm:grid-cols-2">
        <input type="hidden" name="periodId" value={periodId} />
        <Field label="Sent to">
          <input name="verifierName" required autoComplete="off" placeholder="e.g. HR department, Brightwater" className={input} style={inputStyle} />
        </Field>
        <Field label="Their contact">
          <input name="verifierContact" required autoComplete="off" placeholder="Phone or email used" className={input} style={inputStyle} />
        </Field>
        <Field label="How the contact was established independently (7.5.2a)" wide>
          <input
            name="contactVerifiedHow"
            required
            autoComplete="off"
            placeholder="e.g. Switchboard number from the company website — not the number the candidate gave"
            className={input}
            style={inputStyle}
          />
        </Field>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} className={primary} style={{ background: "var(--series-1)" }}>
            {pending ? "Saving…" : "Record request sent"}
          </button>
          <Result state={state} />
        </div>
      </form>
    </Disclose>
  );
}

export function ChaseButton({ periodId }: { periodId: string }) {
  const { state, pending, form } = useFormAction(chaseReference);
  return (
    <form {...form} className="inline-block">
      <input type="hidden" name="periodId" value={periodId} />
      <button type="submit" disabled={pending} className={quiet} style={{ background: "var(--surface-1)" }}>
        {pending ? "Saving…" : "Record 2nd request sent"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function VerifyForm({
  periodId,
  documentOnly,
  contactKnown,
}: {
  periodId: string;
  documentOnly: boolean;
  contactKnown: boolean;
}) {
  const { state, pending, form } = useFormAction(verifyPeriod);
  const [method, setMethod] = useState(documentOnly ? "documentary" : "reference");
  return (
    <Disclose title="Mark verified">
      <form {...form} className="grid gap-2.5 sm:grid-cols-2">
        <input type="hidden" name="periodId" value={periodId} />
        <Field label="How it was verified" wide>
          <select name="method" value={method} onChange={(e) => setMethod(e.target.value)} className={input} style={inputStyle}>
            {!documentOnly && <option value="reference">Reference from the verifier</option>}
            <option value="documentary">Documentary evidence</option>
            <option value="government_record">Government record (e.g. DWP, HMRC)</option>
          </select>
        </Field>
        {method === "reference" && !contactKnown && (
          <Field label="How the verifier's contact was established independently (7.5.2a)" wide>
            <input name="contactVerifiedHow" required autoComplete="off" className={input} style={inputStyle} />
          </Field>
        )}
        {method === "documentary" && (
          <>
            <Field label="Document dated at the start">
              <input name="documentStart" required autoComplete="off" placeholder="e.g. Payslip" className={input} style={inputStyle} />
            </Field>
            <Field label="Document dated at the end (a different type)">
              <input name="documentEnd" required autoComplete="off" placeholder="e.g. P60" className={input} style={inputStyle} />
            </Field>
          </>
        )}
        <Field label="Confirmed from (if different)">
          <input name="confirmedFrom" type="date" className={input} style={inputStyle} />
        </Field>
        <Field label="Confirmed to (if different)">
          <input name="confirmedTo" type="date" className={input} style={inputStyle} />
        </Field>
        <Field label="Note (optional)" wide>
          <input name="notes" autoComplete="off" className={input} style={inputStyle} />
        </Field>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} className={primary} style={{ background: "var(--series-1)" }}>
            {pending ? "Saving…" : "Mark verified"}
          </button>
          <Result state={state} />
        </div>
      </form>
    </Disclose>
  );
}

export function RemovePeriodButton({ periodId }: { periodId: string }) {
  const { state, pending, form } = useFormAction(removeHistoryPeriod);
  return (
    <form {...form} className="inline-block">
      <input type="hidden" name="periodId" value={periodId} />
      <button type="submit" disabled={pending} className="text-[11px] underline-offset-2 hover:underline" style={{ color: "var(--text-muted)" }}>
        {pending ? "Removing…" : "Remove"}
      </button>
      <Result state={state} />
    </form>
  );
}
