"use client";

import { useFormAction } from "@/components/ui/useFormAction";
import { useActionState, useState } from "react";
import {
  assignController,
  openScreeningFile,
  reviewFile,
  submitForReview,
  updateCheck,
  updateHistoryFigures,
} from "@/lib/actions/screening";
import type { ActionResult } from "@/lib/actions/types";

const input =
  "h-8 rounded-md border px-2 text-[12px] outline-none focus:border-[var(--series-1)] focus:ring-2 focus:ring-[var(--series-1)]/30";
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

type Option = { id: string; label: string };

function ControllerSelect({ options, name = "controllerUserId", required = false }: { options: Option[]; name?: string; required?: boolean }) {
  return (
    <select name={name} required={required} defaultValue="" aria-label="Controller" className={input} style={inputStyle}>
      <option value="">{required ? "Choose a controller…" : "Controller later"}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Open a file for a candidate, with you as administrator. */
export function OpenFileForm({ candidacyId, controllers }: { candidacyId: string; controllers: Option[] }) {
  const { state, pending, form } = useFormAction(openScreeningFile);
  return (
    <form {...form}>
      <div className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="candidacyId" value={candidacyId} />
        <ControllerSelect options={controllers} />
        <button type="submit" disabled={pending} className={primary} style={{ background: "var(--series-1)" }}>
          {pending ? "Opening…" : "Open file"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function AssignControllerForm({
  fileId,
  controllers,
  takeSelf,
}: {
  fileId: string;
  controllers: Option[];
  /** A controller taking an unassigned file themselves. */
  takeSelf?: string;
}) {
  const { state, pending, form } = useFormAction(assignController);
  return (
    <form {...form}>
      <input type="hidden" name="fileId" value={fileId} />
      <div className="flex flex-wrap items-center gap-2">
        {takeSelf ? (
          <input type="hidden" name="controllerUserId" value={takeSelf} />
        ) : (
          <ControllerSelect options={controllers} required />
        )}
        <button type="submit" disabled={pending} className={primary} style={{ background: "var(--series-1)" }}>
          {pending ? "Saving…" : takeSelf ? "Take this file as controller" : "Assign"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

const STATUS_OPTIONS = [
  ["not_started", "Not started"],
  ["requested", "Requested"],
  ["chased", "Chased (2nd request)"],
  ["received", "Received"],
  ["verified", "Verified"],
  ["not_applicable", "Not applicable"],
  ["failed", "Failed"],
] as const;

/** Move one check on. A note is required for failed and not applicable. */
export function CheckForm({ checkId, status }: { checkId: string; status: string }) {
  const { state, pending, form } = useFormAction(updateCheck);
  const [next, setNext] = useState(status);
  const needsNote = next === "failed" || next === "not_applicable";
  return (
    <form {...form} className="mt-2">
      <input type="hidden" name="checkId" value={checkId} />
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="status"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-label="Status"
          className={input}
          style={inputStyle}
        >
          {STATUS_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input
          name="note"
          autoComplete="off"
          required={needsNote}
          placeholder={needsNote ? "Required — say why" : "Note (optional)"}
          aria-label="Note"
          className={`${input} min-w-0 flex-1`}
          style={inputStyle}
        />
        <button type="submit" disabled={pending} className={quiet} style={{ background: "var(--surface-1)" }}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function HistoryFiguresForm({
  fileId,
  unverifiedDays,
  gapsOver31Days,
}: {
  fileId: string;
  unverifiedDays: number;
  gapsOver31Days: number;
}) {
  const { state, pending, form } = useFormAction(updateHistoryFigures);
  return (
    <form {...form}>
      <input type="hidden" name="fileId" value={fileId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
          Unverified days
          <input name="unverifiedDays" type="number" min={0} defaultValue={unverifiedDays} className={`${input} mt-1 block w-28`} style={inputStyle} />
        </label>
        <label className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
          Gaps over 31 days
          <input name="gapsOver31Days" type="number" min={0} defaultValue={gapsOver31Days} className={`${input} mt-1 block w-28`} style={inputStyle} />
        </label>
        <button type="submit" disabled={pending} className={quiet} style={{ background: "var(--surface-1)" }}>
          {pending ? "Saving…" : "Save figures"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function SubmitReviewButton({ fileId, label, blockedBy }: { fileId: string; label: string; blockedBy: string | null }) {
  const [state, action, pending] = useActionState(submitForReview, null);
  return (
    <form action={action}>
      <input type="hidden" name="fileId" value={fileId} />
      <button
        type="submit"
        disabled={pending || Boolean(blockedBy)}
        className={primary}
        style={{ background: "var(--series-1)" }}
        title={blockedBy ?? undefined}
      >
        {pending ? "Sending…" : label}
      </button>
      {blockedBy && !state && (
        <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          {blockedBy}
        </p>
      )}
      <Result state={state} />
    </form>
  );
}

/** The controller's decision: confirm, or send back with what needs doing. */
export function ReviewForm({ fileId, what }: { fileId: string; what: string }) {
  const { state, pending, form } = useFormAction(reviewFile);
  const [decision, setDecision] = useState<"confirm" | "return">("confirm");
  return (
    <form {...form} className="space-y-2">
      <input type="hidden" name="fileId" value={fileId} />
      <input type="hidden" name="decision" value={decision} />
      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            ["confirm", `Confirm ${what}`],
            ["return", "Return to administrator"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => setDecision(v)}
            aria-pressed={decision === v}
            className="h-9 rounded-md border px-2 text-[12px] font-medium"
            style={{
              background: decision === v ? "var(--wash)" : "var(--surface-1)",
              borderColor: decision === v ? "var(--series-1)" : "var(--hairline)",
            }}
          >
            {l}
          </button>
        ))}
      </div>
      <textarea
        name="note"
        rows={2}
        required={decision === "return"}
        aria-label="Review note"
        placeholder={decision === "return" ? "Required — what needs doing before it comes back" : "Note (optional)"}
        className={`${input} h-auto w-full py-2`}
        style={inputStyle}
      />
      <button type="submit" disabled={pending} className={primary} style={{ background: "var(--series-1)" }}>
        {pending ? "Saving…" : decision === "confirm" ? "Sign off" : "Return"}
      </button>
      <Result state={state} />
    </form>
  );
}
