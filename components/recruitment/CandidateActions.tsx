"use client";

import { useFormAction } from "@/components/ui/useFormAction";
import { useActionState, useState } from "react";
import { advanceCandidacy, recordInterview, withdrawCandidacy } from "@/lib/actions/recruitment";
import type { ActionResult } from "@/lib/actions/types";

function Result({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className="mt-2 text-[12px] leading-snug"
      style={{ color: state.ok ? "var(--good-text)" : "var(--critical-text)" }}
    >
      {state.message}
    </p>
  );
}

const primary =
  "inline-flex h-9 items-center rounded-md px-3.5 text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50";
const quiet =
  "inline-flex h-9 items-center rounded-md border px-3.5 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50";
const field =
  "w-full rounded-md border px-3 text-[13px] outline-none focus:border-[var(--series-1)] focus:ring-2 focus:ring-[var(--series-1)]/30";

/** Move on to the next stage, or say exactly what is in the way. */
export function AdvanceButton({
  candidacyId,
  toLabel,
  blockedBy,
  denied,
}: {
  candidacyId: string;
  toLabel: string | null;
  blockedBy: string | null;
  denied: string | null;
}) {
  const [state, action, pending] = useActionState(advanceCandidacy, null);
  return (
    <form action={action}>
      <input type="hidden" name="candidacyId" value={candidacyId} />
      <button
        type="submit"
        disabled={pending || Boolean(blockedBy) || Boolean(denied) || !toLabel}
        className={primary}
        style={{ background: "var(--series-1)" }}
        title={denied ?? blockedBy ?? undefined}
      >
        {pending ? "Moving…" : toLabel ? `Move to ${toLabel}` : "No further stage"}
      </button>
      {(denied || blockedBy) && !state && (
        <p className="mt-2 text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          {denied ?? blockedBy}
        </p>
      )}
      <Result state={state} />
    </form>
  );
}

/** Record the interview this stage is waiting on. */
export function InterviewForm({
  candidacyId,
  stageLabel,
  denied,
}: {
  candidacyId: string;
  stageLabel: string;
  denied: string | null;
}) {
  const { state, pending, form } = useFormAction(recordInterview);
  const [outcome, setOutcome] = useState("progress");

  if (denied) {
    return (
      <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {denied}
      </p>
    );
  }

  return (
    <form {...form} className="space-y-3">
      <input type="hidden" name="candidacyId" value={candidacyId} />
      <fieldset>
        <legend className="text-[12px] font-medium">Outcome of the {stageLabel.toLowerCase()} interview</legend>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {[
            ["progress", "Progress"],
            ["hold", "Hold"],
            ["reject", "Reject"],
          ].map(([value, label]) => (
            <label
              key={value}
              className="flex h-9 cursor-pointer items-center justify-center rounded-md border text-[12px] font-medium"
              style={{
                background: outcome === value ? "var(--wash)" : "var(--surface-1)",
                borderColor: outcome === value ? "var(--series-1)" : "var(--hairline)",
              }}
            >
              <input
                type="radio"
                name="outcome"
                value={value}
                checked={outcome === value}
                onChange={() => setOutcome(value)}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="heldAt" className="block text-[12px] font-medium">
          Held at <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(leave blank for just now)</span>
        </label>
        <input
          id="heldAt"
          name="heldAt"
          type="datetime-local"
          className={`${field} mt-1.5 h-9`}
          style={{ background: "var(--surface-1)" }}
        />
      </div>
      <div>
        <label htmlFor="notes" className="block text-[12px] font-medium">
          Notes {outcome === "progress" ? "(optional)" : "(required — say why)"}
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          required={outcome !== "progress"}
          className={`${field} mt-1.5 py-2`}
          style={{ background: "var(--surface-1)" }}
        />
      </div>
      <button type="submit" disabled={pending} className={primary} style={{ background: "var(--series-1)" }}>
        {pending ? "Saving…" : "Record interview"}
      </button>
      <Result state={state} />
    </form>
  );
}

/** Withdraw, with the reason. Tucked away so it is not the easiest click. */
export function WithdrawForm({ candidacyId, denied }: { candidacyId: string; denied: string | null }) {
  const { state, pending, form } = useFormAction(withdrawCandidacy);
  if (denied) return null;
  return (
    <details className="rounded-md border" style={{ borderColor: "var(--hairline)" }}>
      <summary className="cursor-pointer px-3.5 py-2.5 text-[12px] font-medium select-none" style={{ color: "var(--text-secondary)" }}>
        Withdraw this candidate
      </summary>
      <form {...form} className="space-y-2.5 border-t px-3.5 pt-3 pb-3.5" style={{ borderColor: "var(--hairline)" }}>
        <input type="hidden" name="candidacyId" value={candidacyId} />
        <label htmlFor="reason" className="block text-[12px] font-medium">
          Reason
        </label>
        <textarea
          id="reason"
          name="reason"
          rows={2}
          required
          placeholder="e.g. Accepted another offer; no response after three chasers"
          className={`${field} py-2`}
          style={{ background: "var(--surface-1)" }}
        />
        <button
          type="submit"
          disabled={pending}
          className={quiet}
          style={{ borderColor: "var(--status-critical)", color: "var(--critical-text)", background: "var(--surface-1)" }}
        >
          {pending ? "Withdrawing…" : "Withdraw"}
        </button>
        <Result state={state} />
      </form>
    </details>
  );
}
