"use client";

import { useState } from "react";
import { Result, field, inputStyle } from "@/components/scheduling/RotaForms";
import type { ActionResult } from "@/lib/actions/types";
import { useFormAction } from "@/components/ui/useFormAction";
import { recordChaseUp } from "@/lib/actions/duty";
import { logContactAttempt, notifyClientNoSignal, recordBookOn, recordCheckCall, reportClientLostContact } from "@/lib/actions/operations";
import { officerOff } from "@/lib/actions/rota";
import { ASK_CHANNELS, CHANNEL_LABELS, OFF_REASON_LABELS } from "@/lib/core/rota";
import { CHANNEL_EVIDENCE } from "@/lib/core/ops";

/** The row a form sits in often moves list on success, taking the form with it — so the result is handed up too. */
type OnResult = { onResult?: (r: ActionResult) => void };
function lift(action: (prev: ActionResult | null, data: FormData) => Promise<ActionResult>, onResult?: (r: ActionResult) => void) {
  return async (prev: ActionResult | null, data: FormData) => {
    const r = await action(prev, data);
    if (r.ok) onResult?.(r);
    return r;
  };
}

const btn = "h-8 rounded-md border px-3 text-[12px] font-medium whitespace-nowrap disabled:opacity-50";
const solid = "h-8 rounded-md px-3 text-[12px] font-semibold whitespace-nowrap text-white disabled:opacity-50";

/** Shown in place of a form this role cannot use: the thing exists, and whose it is. */
function Denied({ reason }: { reason: string }) {
  return (
    <p className="text-[11px]" style={{ color: "var(--text-muted)" }} title={reason}>
      {reason}
    </p>
  );
}

/** The chase-up: confirmed, no answer, or cannot attend — which takes them off and raises cover. */
export function ChaseUpForm({ assignmentId, denied, onResult }: { assignmentId: string; denied: string | null } & OnResult) {
  const { state, pending, form } = useFormAction(lift(recordChaseUp.bind(null, assignmentId), onResult));
  const [cannot, setCannot] = useState(false);
  if (denied) return <Denied reason={denied} />;
  return (
    <form {...form} className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <select name="channel" defaultValue="phone" aria-label="How you reached them" className={`${field} h-8 w-28`} style={inputStyle}>
          {ASK_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
        <button type="submit" name="outcome" value="confirmed" disabled={pending} className={solid} style={{ background: "var(--button-good)" }}>
          Confirmed
        </button>
        <button type="submit" name="outcome" value="no_answer" disabled={pending} className={btn} style={{ borderColor: "var(--hairline)" }}>
          No answer
        </button>
        <button type="button" onClick={() => setCannot((v) => !v)} aria-expanded={cannot} className={btn} style={{ borderColor: "var(--status-critical)", color: "var(--critical-text)" }}>
          Can&rsquo;t make it
        </button>
      </div>
      {cannot && (
        <div className="space-y-2 rounded-md border p-2.5" style={{ borderColor: "var(--hairline)", background: "var(--wash-critical)" }}>
          <div className="flex flex-wrap gap-1.5">
            {(["sick", "withdrew", "other"] as const).map((r, i) => (
              <label key={r} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px]" style={{ borderColor: "var(--hairline)", background: "var(--surface-1)" }}>
                <input type="radio" name="reason" value={r} defaultChecked={i === 0} className="h-3.5 w-3.5" />
                {OFF_REASON_LABELS[r]}
              </label>
            ))}
          </div>
          <input name="note" autoComplete="off" aria-label="What they said" placeholder="What they said" className={`${field} h-8 w-full`} style={inputStyle} />
          <button type="submit" name="outcome" value="cannot_attend" disabled={pending} className={solid} style={{ background: "var(--status-critical)" }}>
            Take them off — cover needed
          </button>
        </div>
      )}
      <Result state={state} />
    </form>
  );
}

const BOOK_ON_CHANNELS = ["phone", "site_phone", "app", "qr", "supervisor", "sms"] as const;

/** The book-on: they are at the site and on duty. How it came in says what it is worth as a record. */
export function BookOnForm({ assignmentId, denied, onResult }: { assignmentId: string; denied: string | null } & OnResult) {
  const { state, pending, form } = useFormAction(lift(recordBookOn.bind(null, assignmentId), onResult));
  if (denied) return <Denied reason={denied} />;
  return (
    <form {...form} className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <select name="channel" defaultValue="phone" aria-label="How they booked on" className={`${field} h-8 w-44`} style={inputStyle}>
          {BOOK_ON_CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_EVIDENCE[c].label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending} className={solid} style={{ background: "var(--button-good)" }}>
          {pending ? "Booking on…" : "Booked on"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

/** A try that did not reach them. On a missed check call it is what moves the ladder up a step. */
export function AttemptForm({ assignmentId, denied, label = "Tried — no answer", onResult }: { assignmentId: string; denied: string | null; label?: string } & OnResult) {
  const { state, pending, form } = useFormAction(lift(logContactAttempt.bind(null, assignmentId), onResult));
  if (denied) return <Denied reason={denied} />;
  return (
    <form {...form} className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <select name="channel" defaultValue="phone" aria-label="What you tried" className={`${field} h-8 w-40`} style={inputStyle}>
          <option value="phone">Their mobile</option>
          <option value="site_phone">The site phone</option>
          <option value="supervisor">Another officer on site</option>
          <option value="sms">Text</option>
        </select>
        <input name="note" autoComplete="off" aria-label="Note" placeholder="Note (optional)" className={`${field} h-8 w-40`} style={inputStyle} />
        <button type="submit" disabled={pending} className={btn} style={{ borderColor: "var(--hairline)" }}>
          {pending ? "Saving…" : label}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

/** A check call that came in. Usually all well; when not, the note says what. */
export function CheckCallForm({ assignmentId, denied, onResult }: { assignmentId: string; denied: string | null } & OnResult) {
  const { state, pending, form } = useFormAction(lift(recordCheckCall.bind(null, assignmentId), onResult));
  const [notWell, setNotWell] = useState(false);
  if (denied) return <Denied reason={denied} />;
  return (
    <form {...form} className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <select name="channel" defaultValue="phone" aria-label="How the call came in" className={`${field} h-8 w-44`} style={inputStyle}>
          {(["phone", "site_phone", "app", "qr", "supervisor", "sms"] as const).map((c) => (
            <option key={c} value={c}>
              {CHANNEL_EVIDENCE[c].label}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1 text-[12px]">
          <input type="checkbox" checked={notWell} onChange={(e) => setNotWell(e.target.checked)} className="h-3.5 w-3.5" />
          Not all well
        </label>
        <input type="hidden" name="allWell" value={notWell ? "no" : "yes"} />
        {notWell && <input name="note" required autoComplete="off" aria-label="What is wrong" placeholder="What is wrong" className={`${field} h-8 w-48`} style={inputStyle} />}
        <button type="submit" disabled={pending} className={solid} style={{ background: "var(--button-good)" }}>
          {pending ? "Saving…" : "Call received"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

/** Not coming: they come off, and the shift goes on the cover list — the rota's own route. */
export function NoShowForm({ assignmentId, denied, onResult }: { assignmentId: string; denied: string | null } & OnResult) {
  const { state, pending, form } = useFormAction(lift(officerOff, onResult));
  if (denied) return <Denied reason={denied} />;
  return (
    <form {...form} className="space-y-1">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <input type="hidden" name="reason" value="no_show" />
      <div className="flex flex-wrap items-center gap-1.5">
        <input name="note" autoComplete="off" aria-label="What you know" placeholder="What you know (optional)" className={`${field} h-8 w-48`} style={inputStyle} />
        <button type="submit" disabled={pending} className={solid} style={{ background: "var(--status-critical)" }}>
          {pending ? "Saving…" : "Not coming — find cover"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

/** No signal at the post: the client is told, and holds contact on the site phone (E10). */
export function TellClientForm({ assignmentId, denied, onResult }: { assignmentId: string; denied: string | null } & OnResult) {
  const { state, pending, form } = useFormAction(lift(notifyClientNoSignal.bind(null, assignmentId), onResult));
  if (denied) return <Denied reason={denied} />;
  return (
    <form {...form} className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <input name="contact" required autoComplete="off" aria-label="Who at the client was told" placeholder="Who at the client you told" className={`${field} h-8 w-52`} style={inputStyle} />
        <button type="submit" disabled={pending} className={solid} style={{ background: "var(--series-1)" }}>
          {pending ? "Saving…" : "Client told"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}

export function LostContactForm({ assignmentId, denied, onResult }: { assignmentId: string; denied: string | null } & OnResult) {
  const { state, pending, form } = useFormAction(lift(reportClientLostContact.bind(null, assignmentId), onResult));
  const [open, setOpen] = useState(false);
  if (denied) return <Denied reason={denied} />;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] underline-offset-2 hover:underline" style={{ color: "var(--critical-text)" }}>
        Client says they cannot reach the officer
      </button>
    );
  }
  return (
    <form {...form} className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <input name="reportedBy" required autoComplete="off" aria-label="Who at the client reported it" placeholder="Who reported it" className={`${field} h-8 w-40`} style={inputStyle} />
        <input name="detail" autoComplete="off" aria-label="What they said" placeholder="What they said" className={`${field} h-8 w-48`} style={inputStyle} />
        <button type="submit" disabled={pending} className={solid} style={{ background: "var(--status-critical)" }}>
          {pending ? "Saving…" : "Record — attend site"}
        </button>
      </div>
      <Result state={state} />
    </form>
  );
}
