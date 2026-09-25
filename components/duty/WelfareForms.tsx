"use client";

import { useState } from "react";
import { field, inputStyle } from "@/components/scheduling/RotaForms";
import { StatusPill } from "@/components/ui/StatusPill";
import { useFormAction } from "@/components/ui/useFormAction";
import type { ActionResult } from "@/lib/actions/types";
import { dispatchWelfareVisit, markWelfareArrived, recordWelfareOutcome } from "@/lib/actions/welfare";
import { ATTENDEE_LABELS, OUTCOME_SPECS, WELFARE_OUTCOMES, WELFARE_RULES, visitStatus, type WelfareAttendee } from "@/lib/core/welfare";
import type { OpenWelfareVisit } from "@/lib/db/welfare";
import { formatTime } from "@/lib/format";

type OnResult = { onResult: (r: ActionResult) => void };
const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;

function useLifted(action: (prev: ActionResult | null, data: FormData) => Promise<ActionResult>, onResult: (r: ActionResult) => void) {
  return useFormAction(async (prev: ActionResult | null, data: FormData) => {
    const r = await action(prev, data);
    onResult(r);
    return r;
  });
}

/**
 * Step 3: send a supervisor or the Operations Manager to site, with the time
 * they should be there. Two minutes past it without an arrival, the alarm goes
 * to Control and the Operations Manager.
 */
export function DispatchForm({ assignmentId, managers, denied, onResult }: { assignmentId: string; managers: { id: string; name: string; phone: string | null }[]; denied: string | null } & OnResult) {
  const { pending, form } = useLifted(dispatchWelfareVisit.bind(null, assignmentId), onResult);
  const [kind, setKind] = useState<WelfareAttendee>("supervisor");
  if (denied) return null;
  return (
    <form {...form} className="space-y-2 rounded-md border-2 p-2.5" style={{ borderColor: "var(--status-critical)", background: "var(--surface-1)" }}>
      <p className="text-[12px] font-semibold" style={{ color: "var(--critical-text)" }}>
        Send someone to site
      </p>
      <div className="flex flex-wrap gap-3 text-[12px]">
        {(["supervisor", "operations_manager"] as const).map((k) => (
          <label key={k} className="flex items-center gap-1.5">
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} disabled={k === "operations_manager" && managers.length === 0} />
            {ATTENDEE_LABELS[k]}
          </label>
        ))}
      </div>
      {kind === "operations_manager" ? (
        <select name="userId" required className={`${field} w-full`} style={inputStyle} defaultValue={managers[0]?.id}>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.phone ? ` · ${m.phone}` : ""}
            </option>
          ))}
        </select>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <input name="name" required placeholder="Supervisor's name" className={field} style={inputStyle} />
          <input name="phone" type="tel" required placeholder="Their phone" className={field} style={inputStyle} />
        </div>
      )}
      <label className="block text-[12px]">
        There in
        <select name="eta" defaultValue="20" className={`${field} ml-2`} style={inputStyle}>
          {WELFARE_RULES.etaChoices.map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className="h-8 w-full rounded-md text-[12px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--status-critical)" }}>
        {pending ? "Sending…" : "Send — start the arrival clock"}
      </button>
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Not marked arrived {WELFARE_RULES.overdueGraceMinutes} minutes after that time, and Control and the Operations Manager are alarmed.
      </p>
    </form>
  );
}

/** One visit under way: who went, when they are due, and the next thing to record. */
export function VisitCard({ v, now, denied, onResult }: { v: OpenWelfareVisit; now: Date; denied: string | null } & OnResult) {
  const s = visitStatus({ dispatchedAt: new Date(v.dispatchedAt), expectedBy: new Date(v.expectedBy), arrivedAt: v.arrivedAt ? new Date(v.arrivedAt) : null, closedAt: null }, now);
  const arrived = useLifted(markWelfareArrived.bind(null, v.id), onResult);
  return (
    <li className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.5fr)]" style={{ borderColor: "var(--hairline)", background: s.state === "overdue" ? "var(--wash-critical)" : undefined }}>
      <div className="min-w-0 text-[12px]">
        <p className="text-[13px] font-semibold">{v.officer}</p>
        {v.officerPhone && (
          <a href={tel(v.officerPhone)} className="underline" style={{ color: "var(--accent-text)" }}>
            {v.officerPhone}
          </a>
        )}
        <p style={{ color: "var(--text-secondary)" }}>{v.where}</p>
      </div>
      <div className="space-y-1 text-[12px]">
        <StatusPill severity={s.severity} label={s.label} wrap />
        <p>
          {ATTENDEE_LABELS[v.attendeeKind]} <strong>{v.attendeeName}</strong>
          {v.attendeePhone && (
            <>
              {" · "}
              <a href={tel(v.attendeePhone)} className="font-medium underline" style={{ color: "var(--accent-text)" }}>
                {v.attendeePhone}
              </a>
            </>
          )}
        </p>
        <p style={{ color: "var(--text-secondary)" }}>
          Sent {formatTime(v.dispatchedAt)} · due by {formatTime(v.expectedBy)}
          {v.arrivedAt && ` · arrived ${formatTime(v.arrivedAt)}`}
        </p>
      </div>
      {!denied && (
        <div className="space-y-2">
          {!v.arrivedAt && (
            <form {...arrived.form}>
              <button type="submit" disabled={arrived.pending} className="h-9 w-full rounded-md text-[13px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--series-1)" }}>
                {arrived.pending ? "Saving…" : `${v.attendeeName} is on site`}
              </button>
            </form>
          )}
          {/* Fresh once they arrive: the choices change from "call it off" to what was found. */}
          <OutcomeForm key={v.arrivedAt ? "arrived" : "en-route"} visitId={v.id} arrived={!!v.arrivedAt} onResult={onResult} />
        </div>
      )}
    </li>
  );
}

/**
 * What was found. Before anyone is on site, only "the officer got in touch
 * first" can be recorded; after, the rest. Police when an incident needs them.
 */
function OutcomeForm({ visitId, arrived, onResult }: { visitId: string; arrived: boolean } & OnResult) {
  const { pending, form } = useLifted(recordWelfareOutcome.bind(null, visitId), onResult);
  const [open, setOpen] = useState(arrived);
  const [outcome, setOutcome] = useState<string>(arrived ? "safe_and_well" : "stood_down");
  const [police, setPolice] = useState(false);
  const [client, setClient] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[12px] underline" style={{ color: "var(--text-secondary)" }}>
        The officer got in touch first — call it off
      </button>
    );
  }
  const options = WELFARE_OUTCOMES.filter((o) => (arrived ? true : !OUTCOME_SPECS[o].needsArrival));
  return (
    <form {...form} className="space-y-2 rounded-md border p-2.5" style={{ borderColor: "var(--hairline)", background: "var(--surface-1)" }}>
      <fieldset className="space-y-1">
        <legend className="text-[12px] font-semibold">{arrived ? "What did they find?" : "Call the visit off"}</legend>
        {options.map((o) => (
          <label key={o} className="flex items-start gap-1.5 text-[12px]">
            <input
              type="radio"
              name="outcome"
              value={o}
              checked={outcome === o}
              onChange={() => {
                setOutcome(o);
                if (o === "not_found_police") setPolice(true);
              }}
              className="mt-0.5"
            />
            <span>
              {OUTCOME_SPECS[o].label}
              {outcome === o && (
                <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {OUTCOME_SPECS[o].hint}
                </span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <textarea name="note" required rows={2} placeholder={arrived ? "What was found, and what was done" : "How the officer got in touch"} className={`${field} h-auto w-full py-1.5`} style={inputStyle} />
      <label className="flex items-center gap-1.5 text-[12px]">
        <input type="checkbox" name="police" checked={police} onChange={(e) => setPolice(e.target.checked)} disabled={outcome === "not_found_police"} />
        An incident — police called
        {outcome === "not_found_police" && <input type="hidden" name="police" value="on" />}
      </label>
      {police && <input name="policeReference" required placeholder="Police reference number" className={`${field} w-full`} style={inputStyle} />}
      <label className="flex items-center gap-1.5 text-[12px]">
        <input type="checkbox" name="clientTold" checked={client} onChange={(e) => setClient(e.target.checked)} />
        The client has been told
      </label>
      {client && <input name="clientContact" required placeholder="Who at the client" className={`${field} w-full`} style={inputStyle} />}
      <button type="submit" disabled={pending} className="h-9 w-full rounded-md text-[12px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--text-primary)" }}>
        {pending ? "Saving…" : "Record and close the visit"}
      </button>
      {!arrived && (
        <button type="button" onClick={() => setOpen(false)} className="text-[12px] underline" style={{ color: "var(--text-secondary)" }}>
          Cancel
        </button>
      )}
    </form>
  );
}
