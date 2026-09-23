"use client";

import { useFormAction } from "@/components/ui/useFormAction";
import { useActionState, useEffect, useState } from "react";
import {
  decideException,
  raiseRiskFinding,
  recordRepresentation,
  requestDeclaration,
  requestExtension,
  runClockSweep,
} from "@/lib/actions/screening-exceptions";
import type { ActionResult } from "@/lib/actions/types";

const input =
  "rounded-md border px-2.5 text-[12px] outline-none focus:border-[var(--series-1)] focus:ring-2 focus:ring-[var(--series-1)]/30";
const inputStyle = { background: "var(--surface-1)", color: "var(--text-primary)" } as const;
const primary = "h-8 rounded-md px-3 text-[12px] font-medium whitespace-nowrap text-white disabled:opacity-50";
const quiet = "h-8 rounded-md border px-3 text-[12px] font-medium whitespace-nowrap disabled:opacity-50";

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

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
      {text}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

/** A disclosure, so the raise forms are there when needed and quiet otherwise. */
function Raise({ title, clause, children }: { title: string; clause: string; children: React.ReactNode }) {
  return (
    <details className="rounded-md border" style={{ borderColor: "var(--hairline)" }}>
      <summary className="cursor-pointer px-3 py-2.5 text-[12px] font-medium select-none">
        {title} <span className="tnum text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>{clause}</span>
      </summary>
      <div className="border-t px-3 pt-3 pb-3.5" style={{ borderColor: "var(--hairline)" }}>
        {children}
      </div>
    </details>
  );
}

export function RiskFindingForm({ fileId, triggers }: { fileId: string; triggers: { id: string; label: string }[] }) {
  const { state, pending, form } = useFormAction(raiseRiskFinding);
  const [trigger, setTrigger] = useState("");
  // The form clears on success; the chosen trigger has to clear with it.
  useEffect(() => {
    if (state?.ok) setTrigger("");
  }, [state]);
  return (
    <Raise title="Record a public-record finding" clause="7.4f, Form 5">
      <form {...form} className="space-y-2.5">
        <input type="hidden" name="fileId" value={fileId} />
        <Label text="What the search found">
          <select name="trigger" required value={trigger} onChange={(e) => setTrigger(e.target.value)} className={`${input} h-8 w-full`} style={inputStyle}>
            <option value="" disabled>
              Choose…
            </option>
            {triggers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Label>
        {trigger === "ccj" && (
          <Label text="Total of the CCJs (£)">
            <input name="amountGbp" inputMode="decimal" required placeholder="14200" className={`${input} h-8 w-40`} style={inputStyle} />
          </Label>
        )}
        <Label text="Details">
          <textarea name="detail" rows={2} required placeholder="What was found, where, and when" className={`${input} w-full py-2`} style={inputStyle} />
        </Label>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          The file pauses. The individual is invited to make representation, then Higher Management decides whether to accept the risk.
        </p>
        <button type="submit" disabled={pending} className={primary} style={{ background: "var(--series-1)" }}>
          {pending ? "Saving…" : "Record finding"}
        </button>
        <Result state={state} />
      </form>
    </Raise>
  );
}

export function ExtensionForm({ fileId, blockedBy }: { fileId: string; blockedBy: string | null }) {
  const { state, pending, form } = useFormAction(requestExtension);
  return (
    <Raise title="Request the four-week extension" clause="7.6">
      {blockedBy ? (
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {blockedBy}
        </p>
      ) : (
        <form {...form} className="space-y-2.5">
          <input type="hidden" name="fileId" value={fileId} />
          <Label text="What is outstanding, and who has not replied">
            <textarea name="detail" rows={2} required className={`${input} w-full py-2`} style={inputStyle} />
          </Label>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            One extension per file, of four weeks. The request dates on the history checks go with it as evidence.
          </p>
          <button type="submit" disabled={pending} className={primary} style={{ background: "var(--series-1)" }}>
            {pending ? "Sending…" : "Request extension"}
          </button>
          <Result state={state} />
        </form>
      )}
    </Raise>
  );
}

export function DeclarationForm({ fileId, blockedBy }: { fileId: string; blockedBy: string | null }) {
  const { state, pending, form } = useFormAction(requestDeclaration);
  return (
    <Raise title="Request a statutory declaration" clause="7.7i">
      {blockedBy ? (
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {blockedBy}
        </p>
      ) : (
        <form {...form} className="space-y-2.5">
          <input type="hidden" name="fileId" value={fileId} />
          <div className="flex flex-wrap gap-3">
            <Label text="Period from">
              <input name="periodFrom" type="date" required className={`${input} h-8`} style={inputStyle} />
            </Label>
            <Label text="Period to">
              <input name="periodTo" type="date" required className={`${input} h-8`} style={inputStyle} />
            </Label>
          </div>
          <Label text="Why it cannot be verified — what was tried">
            <textarea name="detail" rows={2} required className={`${input} w-full py-2`} style={inputStyle} />
          </Label>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            One period, at most six months, within the last five years, and only with Higher Management&rsquo;s approval first.
          </p>
          <button type="submit" disabled={pending} className={primary} style={{ background: "var(--series-1)" }}>
            {pending ? "Sending…" : "Request approval"}
          </button>
          <Result state={state} />
        </form>
      )}
    </Raise>
  );
}

/** What the individual said, or that they were asked and said nothing. */
export function RepresentationForm({ exceptionId }: { exceptionId: string }) {
  const { state, pending, form } = useFormAction(recordRepresentation);
  const [none, setNone] = useState(false);
  return (
    <form {...form} className="mt-2 space-y-2">
      <input type="hidden" name="exceptionId" value={exceptionId} />
      <textarea
        name="representation"
        rows={2}
        required
        aria-label={none ? "How the invitation was made" : "The individual's representation"}
        placeholder={none ? "How and when they were invited, e.g. emailed 20 Sept, no reply by 27 Sept" : "What the individual said about it"}
        className={`${input} w-full py-2`}
        style={inputStyle}
      />
      <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
        <input type="checkbox" name="none" checked={none} onChange={(e) => setNone(e.target.checked)} />
        They made no representation
      </label>
      <button type="submit" disabled={pending} className={primary} style={{ background: "var(--series-1)" }}>
        {pending ? "Saving…" : "Record and send for decision"}
      </button>
      <Result state={state} />
    </form>
  );
}

/** Higher Management's decision, with its grounds. */
export function DecisionForm({
  exceptionId,
  outcomes,
}: {
  exceptionId: string;
  outcomes: { value: string; label: string; ends?: string }[];
}) {
  const { state, pending, form } = useFormAction(decideException);
  const [outcome, setOutcome] = useState("");
  const chosen = outcomes.find((o) => o.value === outcome);
  return (
    <form {...form} className="mt-2 space-y-2">
      <input type="hidden" name="exceptionId" value={exceptionId} />
      <input type="hidden" name="outcome" value={outcome} />
      <div className="grid grid-cols-2 gap-1.5">
        {outcomes.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={outcome === o.value}
            onClick={() => setOutcome(o.value)}
            className="h-9 rounded-md border px-2 text-[12px] font-medium"
            style={{
              background: outcome === o.value ? "var(--wash)" : "var(--surface-1)",
              borderColor: outcome === o.value ? "var(--series-1)" : "var(--hairline)",
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      {chosen?.ends && (
        <p className="rounded-md px-2.5 py-2 text-[11px]" style={{ background: "var(--wash-critical)" }}>
          {chosen.ends}
        </p>
      )}
      <textarea
        name="rationale"
        rows={3}
        required
        minLength={10}
        aria-label="Grounds for the decision"
        placeholder="The grounds for the decision. This is what an auditor reads."
        className={`${input} w-full py-2`}
        style={inputStyle}
      />
      <button type="submit" disabled={pending || !outcome} className={primary} style={{ background: "var(--series-1)" }}>
        {pending ? "Saving…" : "Sign the decision"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function SweepButton() {
  const [state, action, pending] = useActionState(runClockSweep, null);
  return (
    <form action={action}>
      <button type="submit" disabled={pending} className={quiet} style={{ background: "var(--surface-1)" }}>
        {pending ? "Checking…" : "Run the clock check now"}
      </button>
      <Result state={state} />
    </form>
  );
}
