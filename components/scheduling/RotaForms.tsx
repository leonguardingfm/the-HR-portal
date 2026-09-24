"use client";

import { useState } from "react";
import { useFormAction } from "@/components/ui/useFormAction";
import {
  cancelShift,
  changeHours,
  leaveUncovered,
  officerOff,
  publishWeek,
  recordAsk,
  setRegularOfficer,
  setWeeklyHours,
  takeOffDraft,
} from "@/lib/actions/rota";
import type { ActionResult } from "@/lib/actions/types";
import { ASK_CHANNELS, CHANNEL_LABELS, OFF_REASONS, OFF_REASON_LABELS } from "@/lib/core/rota";

/** A field with no width of its own, for places that set one: two width classes on one element fight. */
export const field = "h-9 rounded-md border px-2.5 text-[13px] outline-none focus:border-[var(--series-1)] focus:ring-2 focus:ring-[var(--series-1)]/30";
export const input = `${field} w-full`;
export const inputStyle = { background: "var(--surface-1)", color: "var(--text-primary)" } as const;
const primary = "h-8 rounded-md px-3 text-[12px] font-medium whitespace-nowrap text-white disabled:opacity-50";
const quiet = "h-8 rounded-md border px-3 text-[12px] font-medium whitespace-nowrap disabled:opacity-50";

export function Result({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className="mt-1.5 text-[12px] leading-snug"
      style={{ color: state.ok ? "var(--status-good)" : "var(--status-critical)" }}
    >
      {state.message}
    </p>
  );
}

/**
 * What the officer said. One form per officer, carrying the ticked shifts and
 * the hours; the button pressed is the answer.
 */
export function AskForm({
  postId,
  personId,
  openShiftIds = [],
  coverNeedId,
  now = false,
}: {
  postId: string;
  personId: string;
  /** The open shifts asked about. */
  openShiftIds?: string[];
  /** Asking to cover for somebody who came off: a yes is on the rota at once. */
  coverNeedId?: string;
  /** A shift already under way: a yes is on the rota at once. */
  now?: boolean;
}) {
  const { state, pending, form } = useFormAction(recordAsk);
  const ready = coverNeedId ? true : openShiftIds.length > 0;
  const atOnce = !!coverNeedId || now;
  return (
    <form {...form} className="mt-2 space-y-2 rounded-md border p-2.5" style={{ borderColor: "var(--hairline)", background: "var(--wash-neutral)" }}>
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="personId" value={personId} />
      {coverNeedId ? (
        <input type="hidden" name="coverNeedId" value={coverNeedId} />
      ) : (
        openShiftIds.map((id) => <input key={id} type="hidden" name="openShiftId" value={id} />)
      )}
      <div className="grid grid-cols-[8rem_1fr] gap-2">
        <select name="channel" defaultValue="phone" aria-label="How you asked" className={`${input} h-8`} style={inputStyle}>
          {ASK_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
        <input name="note" autoComplete="off" aria-label="Note" placeholder="Note (optional) — e.g. can do nights only" className={`${input} h-8`} style={inputStyle} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="submit" name="answer" value="yes" disabled={pending || !ready} className={primary} style={{ background: atOnce ? "var(--status-critical)" : "var(--series-1)" }}>
          {pending ? "Saving…" : atOnce ? "Said yes — on now" : "Said yes — put on"}
        </button>
        <button type="submit" name="answer" value="no" disabled={pending || !ready} className={quiet} style={{ background: "var(--surface-1)" }}>
          Said no
        </button>
        <button type="submit" name="answer" value="no_answer" disabled={pending || !ready} className={quiet} style={{ background: "var(--surface-1)" }}>
          No answer
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

/**
 * The draft disappears from the list the moment it is taken off, taking this
 * form with it — so the result is also handed up, to be shown where it stays.
 */
export function TakeOffDraftForm({ assignmentId, onResult }: { assignmentId: string; onResult?: (r: ActionResult) => void }) {
  const { state, pending, form } = useFormAction(async (prev: ActionResult | null, data: FormData) => {
    const result = await takeOffDraft(prev, data);
    if (result.ok) onResult?.(result);
    return result;
  });
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] underline-offset-2 hover:underline" style={{ color: "var(--text-secondary)" }}>
        Take off
      </button>
    );
  }
  return (
    <form {...form} className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input name="reason" autoComplete="off" aria-label="Why it is coming off" placeholder="Why (optional)" className={`${field} h-8 w-44`} style={inputStyle} />
      <button type="submit" disabled={pending} className={quiet} style={{ background: "var(--surface-1)" }}>
        {pending ? "Taking off…" : "Take off the draft"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function RegularOfficerForm({
  postId,
  current,
  officers,
}: {
  postId: string;
  current: string | null;
  officers: { id: string; name: string }[];
}) {
  const { state, pending, form } = useFormAction(setRegularOfficer, { resetOnSuccess: false });
  return (
    <form {...form} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="postId" value={postId} />
      <select key={current ?? "none"} name="personId" defaultValue={current ?? ""} aria-label="Regular officer" className={`${field} h-8 w-52`} style={inputStyle}>
        <option value="">None — covered from the pool</option>
        {officers.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className={quiet} style={{ background: "var(--surface-1)" }}>
        {pending ? "Saving…" : "Save"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function PublishWeekForm({ monday, weeks = 1, count, denied }: { monday: string; weeks?: number; count: number; denied: string | null }) {
  const { state, pending, form } = useFormAction(publishWeek);
  return (
    <form {...form} className="flex flex-col items-end gap-1">
      <input type="hidden" name="monday" value={monday} />
      <input type="hidden" name="weeks" value={weeks} />
      <button
        type="submit"
        disabled={pending || count === 0 || !!denied}
        title={denied ?? undefined}
        className="h-9 rounded-md px-4 text-[12px] font-medium whitespace-nowrap text-white disabled:opacity-50"
        style={{ background: "var(--series-1)" }}
      >
        {pending ? "Publishing…" : `Publish ${weeks === 1 ? "the week" : `all ${weeks} weeks`}${count ? ` (${count} draft${count === 1 ? "" : "s"})` : ""}`}
      </button>
      <div className="max-w-md text-right">
        <Result state={state} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Changing a published shift
// ---------------------------------------------------------------------------

/** A write whose form vanishes on success hands its result up to be shown. */
function useLifted(
  action: (prev: ActionResult | null, data: FormData) => Promise<ActionResult>,
  onResult?: (r: ActionResult) => void,
) {
  return useFormAction(async (prev: ActionResult | null, data: FormData) => {
    const result = await action(prev, data);
    if (result.ok) onResult?.(result);
    return result;
  });
}

/** Sick, changed their mind, did not turn up: off now, and the rest needs cover. */
export function OfficerOffForm({ assignmentId, name, onResult }: { assignmentId: string; name: string; onResult?: (r: ActionResult) => void }) {
  const { state, pending, form } = useLifted(officerOff, onResult);
  return (
    <form {...form} className="space-y-2">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <fieldset>
        <legend className="text-[11px] font-medium">Why is {name.split(" ")[0]} coming off?</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {OFF_REASONS.map((r, i) => (
            <label key={r} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] has-[:checked]:border-[var(--status-critical)] has-[:checked]:bg-[var(--wash-critical)]">
              <input type="radio" name="reason" value={r} defaultChecked={i === 0} className="h-3.5 w-3.5" />
              {OFF_REASON_LABELS[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <input name="note" autoComplete="off" aria-label="What happened" placeholder="What happened — e.g. rang in 17:02, flu" className={`${input} h-8`} style={inputStyle} />
      <button type="submit" disabled={pending} className={primary} style={{ background: "var(--status-critical)" }}>
        {pending ? "Taking off…" : "Take them off and find cover"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function ChangeHoursForm({ assignmentId, start, end, started, onResult }: { assignmentId: string; start: string; end: string; started: boolean; onResult?: (r: ActionResult) => void }) {
  const { state, pending, form } = useLifted(changeHours, onResult);
  return (
    <form {...form} className="space-y-2">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      {started && <input type="hidden" name="start" value={start} />}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] font-medium">
          Starts
          <input name={started ? undefined : "start"} type="time" defaultValue={start} disabled={started} className={`${field} mt-1 h-8 w-28`} style={inputStyle} />
        </label>
        <label className="text-[11px] font-medium">
          Ends
          <input name="end" type="time" defaultValue={end} required className={`${field} mt-1 h-8 w-28`} style={inputStyle} />
        </label>
      </div>
      {started && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          The shift has started, so only the end can change.
        </p>
      )}
      <input name="reason" required autoComplete="off" aria-label="Why the hours are changing" placeholder="Why — e.g. client asked for an earlier start" className={`${input} h-8`} style={inputStyle} />
      <button type="submit" disabled={pending} className={quiet} style={{ background: "var(--surface-1)" }}>
        {pending ? "Saving…" : "Change the hours"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function CancelShiftForm({ assignmentId, onResult }: { assignmentId: string; onResult?: (r: ActionResult) => void }) {
  const { state, pending, form } = useLifted(cancelShift, onResult);
  return (
    <form {...form} className="space-y-2">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input name="reason" required autoComplete="off" aria-label="Why the shift is not needed" placeholder="Why — e.g. client closed the site for the day" className={`${input} h-8`} style={inputStyle} />
      <button type="submit" disabled={pending} className={quiet} style={{ borderColor: "var(--status-critical)", color: "var(--status-critical)", background: "var(--surface-1)" }}>
        {pending ? "Cancelling…" : "Cancel the shift — nobody needed"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function LeaveUncoveredForm({ coverNeedId, onResult }: { coverNeedId: string; onResult?: (r: ActionResult) => void }) {
  const { state, pending, form } = useLifted(leaveUncovered, onResult);
  return (
    <form {...form} className="space-y-2">
      <input type="hidden" name="coverNeedId" value={coverNeedId} />
      <input name="reason" required autoComplete="off" aria-label="Why it is left uncovered" placeholder="Why, and whether the client was told — e.g. client told 17:40, agreed" className={`${input} h-8`} style={inputStyle} />
      <button type="submit" disabled={pending} className={quiet} style={{ background: "var(--surface-1)" }}>
        {pending ? "Saving…" : "Leave it uncovered"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function WeeklyHoursForm({ personId, hours }: { personId: string; hours: number }) {
  const { state, pending, form } = useFormAction(setWeeklyHours, { resetOnSuccess: false });
  return (
    <form {...form} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="personId" value={personId} />
      <input
        key={hours}
        name="weeklyHours"
        type="number"
        min={1}
        max={96}
        defaultValue={hours}
        aria-label="Weekly hours"
        className={`${field} h-8 w-20`}
        style={inputStyle}
      />
      <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        h a week
      </span>
      <button type="submit" disabled={pending} className={quiet} style={{ background: "var(--surface-1)" }}>
        {pending ? "Saving…" : "Save"}
      </button>
      <Result state={state} />
    </form>
  );
}
