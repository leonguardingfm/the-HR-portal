"use client";

import { useState, useTransition } from "react";
import { field, inputStyle } from "@/components/scheduling/RotaForms";
import { useFormAction } from "@/components/ui/useFormAction";
import { bookMeOn, cancelMyLeave, cannotMakeIt, confirmMyShift, myCheckCall, offerForShift, reportIncident, requestMyLeave, runningLate, setMyAvailability, withdrawOffer } from "@/lib/actions/me";
import { dayLabel } from "@/lib/core/rota";
import type { MyLeave } from "@/lib/db/me";
import type { ActionResult } from "@/lib/actions/types";
import { enqueue, isOffline, type QueueKind } from "@/lib/offline/queue";
import { ProofCamera, type ProofShot } from "./ProofCamera";

type OnResult = { onResult: (r: ActionResult) => void };

/** Big enough for a thumb, on a phone, in the dark. */
const big = "h-12 w-full rounded-lg px-4 text-[15px] font-semibold text-white disabled:opacity-60";
const link = "text-[13px] underline underline-offset-2";

function useLifted(action: (prev: ActionResult | null, data: FormData) => Promise<ActionResult>, onResult: (r: ActionResult) => void) {
  return useFormAction(async (prev: ActionResult | null, data: FormData) => {
    const r = await action(prev, data);
    onResult(r);
    return r;
  });
}

export function ConfirmButton({ assignmentId, onResult }: { assignmentId: string } & OnResult) {
  const { pending, form } = useLifted(confirmMyShift.bind(null, assignmentId), onResult);
  return (
    <form {...form}>
      <button type="submit" disabled={pending} className={big} style={{ background: "var(--button-good)" }}>
        {pending ? "Confirming…" : "Confirm — I’ll be there"}
      </button>
    </form>
  );
}

export function CannotMakeItForm({ assignmentId, onResult }: { assignmentId: string } & OnResult) {
  const { pending, form } = useLifted(cannotMakeIt.bind(null, assignmentId), onResult);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={link} style={{ color: "var(--critical-text)" }}>
        I can’t make this shift
      </button>
    );
  }
  return (
    <form {...form} className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--status-critical)", background: "var(--wash-critical)" }}>
      <label className="block text-[13px] font-medium">
        Tell Control why
        <input name="note" required autoComplete="off" placeholder="e.g. I’m unwell" className={`${field} mt-1 h-11 w-full text-[15px]`} style={inputStyle} />
      </label>
      <button type="submit" disabled={pending} className={big} style={{ background: "var(--status-critical)" }}>
        {pending ? "Sending…" : "Tell Control I can’t make it"}
      </button>
    </form>
  );
}

/** A selfie as the form the server action reads. */
function proofForm(shot: ProofShot, extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("photo", new File([shot.photo], `${shot.code}.jpg`, { type: "image/jpeg" }));
  fd.set("code", shot.code);
  fd.set("deviceAt", String(shot.deviceAt));
  fd.set("live", shot.live ? "1" : "0");
  if (shot.lat !== null && shot.lng !== null && shot.accuracy !== null) {
    fd.set("lat", String(shot.lat));
    fd.set("lng", String(shot.lng));
    fd.set("accuracy", String(shot.accuracy));
  }
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

/** A form with no photo: a problem reported, or the camera would not work. */
function plainForm(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const newRef = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/**
 * Sent now when there is signal; kept on the phone and sent later when there
 * is not (26 September 2026). One reference from the start, so an attempt
 * that reached Control before the signal dropped is never counted twice.
 */
async function sendOrKeep(kind: QueueKind, assignmentId: string, fd: FormData, label: string, action: (id: string, prev: ActionResult | null, fd: FormData) => Promise<ActionResult>): Promise<ActionResult> {
  const id = newRef();
  fd.set("clientRef", id);
  const madeAt = Number(fd.get("deviceAt")) || Date.now();
  const keep = async (): Promise<ActionResult> => {
    const fields: Record<string, string> = {};
    let photo: Blob | undefined;
    fd.forEach((v, k) => {
      if (v instanceof File) photo = v;
      else fields[k] = String(v);
    });
    await enqueue({ id, kind, assignmentId, madeAt, fields, photo, label });
    const urgent = fields.allWell === "no" ? " If you need help now, ring Control — or 999 in an emergency." : "";
    return { ok: true, message: `No signal — your ${label.toLowerCase()} is saved on this phone (made at ${clock(madeAt)}) and goes to Control the moment you have signal.${urgent}` };
  };
  if (typeof navigator !== "undefined" && !navigator.onLine) return keep();
  try {
    return await action(assignmentId, null, fd);
  } catch (e) {
    if (isOffline(e)) return keep();
    throw e;
  }
}

interface ProofProps {
  assignmentId: string;
  officer: { name: string; pin: string | null };
  place: { post: string; site: string };
}

/** "Camera not working?" — still able to book on or call in, and Control is told to ring. */
function WithoutPhoto({ label, send }: { label: string; send: (reason: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={link} style={{ color: "var(--text-secondary)" }}>
        Camera not working?
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--hairline)" }}>
      <p className="text-[13px]">Without a selfie, Control will ring you to confirm you are on site.</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What is wrong with the camera?" className={`${field} h-11 w-full text-[15px]`} style={inputStyle} />
      <button type="button" disabled={pending} onClick={() => start(() => send(reason || "Camera would not work"))} className={big} style={{ background: "var(--text-secondary)" }}>
        {pending ? "Sending…" : label}
      </button>
    </div>
  );
}

export function BookOnButton({ assignmentId, late, officer, place, onResult }: ProofProps & { late: boolean } & OnResult) {
  const [camera, setCamera] = useState(false);
  const [pending, start] = useTransition();
  const send = (fd: FormData) =>
    new Promise<void>((resolve) =>
      start(async () => {
        const r = await sendOrKeep("book_on", assignmentId, fd, fd.get("noPhoto") ? "Book-on without a selfie" : "Book-on", bookMeOn);
        onResult(r);
        if (r.ok) setCamera(false);
        resolve();
      }),
    );
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setCamera(true)} disabled={pending} className={big} style={{ background: late ? "var(--status-critical)" : "var(--series-1)" }}>
        📷 Book on — take your selfie
      </button>
      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        Your selfie is stamped with the time, where you are and a code, and goes to Control.
      </p>
      <WithoutPhoto label="Book on without a selfie" send={(reason) => send(plainForm({ noPhoto: "1", noPhotoReason: reason }))} />
      {camera && <ProofCamera kind="book_on" officer={officer} place={place} sending={pending} onCancel={() => setCamera(false)} onUse={(shot) => void send(proofForm(shot))} />}
    </div>
  );
}

export function CheckCallButtons({ assignmentId, overdue, officer, place, onResult }: ProofProps & { overdue: boolean } & OnResult) {
  const [camera, setCamera] = useState(false);
  const [problem, setProblem] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const send = (fd: FormData) =>
    new Promise<void>((resolve) =>
      start(async () => {
        const r = await sendOrKeep("check_call", assignmentId, fd, fd.get("allWell") === "no" ? `Problem report: “${fd.get("note")}”` : fd.get("noPhoto") ? "Check call without a selfie" : "Check call — all well", myCheckCall);
        onResult(r);
        if (r.ok) {
          setCamera(false);
          setProblem(false);
          setNote("");
        }
        resolve();
      }),
    );
  return (
    <div className="space-y-2">
      {problem ? (
        <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--status-critical)", background: "var(--wash-critical)" }}>
          <label className="block text-[13px] font-medium">
            What is wrong?
            <input value={note} onChange={(e) => setNote(e.target.value)} required autoComplete="off" placeholder="Tell Control what is happening" className={`${field} mt-1 h-11 w-full text-[15px]`} style={inputStyle} />
          </label>
          {/* Help does not wait for a photo. */}
          <button type="button" disabled={pending || note.trim().length === 0} onClick={() => void send(plainForm({ allWell: "no", note }))} className={big} style={{ background: "var(--status-critical)" }}>
            {pending ? "Sending…" : "Send to Control now"}
          </button>
          <button type="button" onClick={() => setProblem(false)} className={link} style={{ color: "var(--text-secondary)" }}>
            Everything is fine after all
          </button>
        </div>
      ) : (
        <>
          <button type="button" onClick={() => setCamera(true)} disabled={pending} className={big} style={{ background: overdue ? "var(--status-critical)" : "var(--button-good)" }}>
            📷 Check call — all well
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setProblem(true)} className={link} style={{ color: "var(--critical-text)" }}>
              Something is wrong
            </button>
            <WithoutPhoto label="Check call without a selfie" send={(reason) => send(plainForm({ allWell: "yes", noPhoto: "1", noPhotoReason: reason }))} />
          </div>
        </>
      )}
      {camera && <ProofCamera kind="check_call" officer={officer} place={place} sending={pending} onCancel={() => setCamera(false)} onUse={(shot) => void send(proofForm(shot, { allWell: "yes" }))} />}
    </div>
  );
}

export function RunningLateForm({ assignmentId, onResult }: { assignmentId: string } & OnResult) {
  const { pending, form } = useLifted(runningLate.bind(null, assignmentId), onResult);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={link} style={{ color: "var(--serious-text)" }}>
        I’m running late
      </button>
    );
  }
  return (
    <form {...form} className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--status-serious)", background: "var(--wash-serious)" }}>
      <label className="block text-[13px] font-medium">
        I’ll be there in
        <select name="minutes" defaultValue="15" className={`${field} mt-1 h-11 w-full text-[15px]`} style={inputStyle}>
          {[5, 10, 15, 20, 30, 45, 60, 90, 120].map((m) => (
            <option key={m} value={m}>
              {m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`}
            </option>
          ))}
        </select>
      </label>
      <input name="note" autoComplete="off" placeholder="Why? (optional) — e.g. train cancelled" className={`${field} h-11 w-full text-[15px]`} style={inputStyle} />
      <button type="submit" disabled={pending} className={big} style={{ background: "var(--status-serious)" }}>
        {pending ? "Sending…" : "Tell Control"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className={link} style={{ color: "var(--text-secondary)" }}>
        Cancel
      </button>
    </form>
  );
}

export function IncidentForm({ assignmentId, onResult }: { assignmentId: string } & OnResult) {
  const { pending, form } = useLifted(reportIncident.bind(null, assignmentId), onResult);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-11 w-full rounded-lg border text-[14px] font-semibold" style={{ borderColor: "var(--status-critical)", color: "var(--critical-text)" }}>
        Report an incident
      </button>
    );
  }
  return (
    <form {...form} className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--status-critical)" }}>
      <p className="text-[13px] font-semibold" style={{ color: "var(--critical-text)" }}>
        If anyone is in danger, ring 999 first.
      </p>
      <fieldset className="space-y-1.5">
        <legend className="text-[13px] font-medium">How serious?</legend>
        {(
          [
            ["serious", "Serious — Control needs to act now"],
            ["notable", "Notable — Control should know"],
            ["log_only", "For the record only"],
          ] as const
        ).map(([v, l]) => (
          <label key={v} className="flex items-center gap-2 text-[14px]">
            <input type="radio" name="severity" value={v} defaultChecked={v === "notable"} className="h-4 w-4" />
            {l}
          </label>
        ))}
      </fieldset>
      <label className="block text-[13px] font-medium">
        What happened?
        <textarea name="summary" required rows={4} placeholder="What, where, who was involved, and what you did" className={`${field} mt-1 h-auto w-full py-2 text-[15px]`} style={inputStyle} />
      </label>
      <button type="submit" disabled={pending} className={big} style={{ background: "var(--status-critical)" }}>
        {pending ? "Sending…" : "Send to Control"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className={link} style={{ color: "var(--text-secondary)" }}>
        Cancel
      </button>
    </form>
  );
}

export function OfferButton({ openShiftId, onResult }: { openShiftId: string } & OnResult) {
  const { pending, form } = useLifted(offerForShift.bind(null, openShiftId), onResult);
  return (
    <form {...form}>
      <button type="submit" disabled={pending} className="h-10 rounded-lg px-4 text-[14px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--series-1)" }}>
        {pending ? "Offering…" : "I can do this"}
      </button>
    </form>
  );
}

export function WithdrawOfferButton({ openShiftId, onResult }: { openShiftId: string } & OnResult) {
  const { pending, form } = useLifted(withdrawOffer.bind(null, openShiftId), onResult);
  return (
    <form {...form}>
      <button type="submit" disabled={pending} className={link} style={{ color: "var(--text-secondary)" }}>
        {pending ? "Withdrawing…" : "Withdraw my offer"}
      </button>
    </form>
  );
}

/**
 * The next four weeks: tap a day to say free, again for not free, again to
 * say nothing. Saved as it is tapped.
 */
export type CalendarDay = { date: string; label: string; weekday: string; shift: string | null; leave: "approved" | "pending" | null };

export function AvailabilityCalendar({ days, said, onResult }: { days: CalendarDay[]; said: Record<string, "available" | "unavailable">; onResult: (r: ActionResult) => void }) {
  const [local, setLocal] = useState(said);
  const [pending, start] = useTransition();
  const cycle = (date: string) => {
    const now = local[date];
    const next = now === undefined ? "available" : now === "available" ? "unavailable" : "clear";
    setLocal((l) => {
      const copy = { ...l };
      if (next === "clear") delete copy[date];
      else copy[date] = next;
      return copy;
    });
    start(async () => {
      const fd = new FormData();
      fd.set("date", date);
      fd.set("kind", next);
      const r = await setMyAvailability(null, fd);
      if (!r.ok) {
        onResult(r);
        setLocal(said);
      }
    });
  };
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          const s = local[d.date];
          const offset = i === 0 ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(d.weekday) : 0;
          // Approved leave is not a day to offer; the rota already knows.
          const fixed = !!d.shift || d.leave === "approved";
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => !fixed && cycle(d.date)}
              disabled={fixed}
              title={d.leave === "approved" ? "On leave" : d.shift ? `On shift: ${d.shift}` : s === "available" ? "Free — tap for not free" : s === "unavailable" ? "Not free — tap to clear" : "Tap if you are free"}
              aria-label={`${d.label}: ${d.leave === "approved" ? "on leave" : d.shift ? `on shift, ${d.shift}` : s === "available" ? "free" : s === "unavailable" ? "not free" : "not said"}${d.leave === "pending" ? ", leave asked for" : ""}`}
              className="flex h-12 flex-col items-center justify-center rounded-md border text-[13px] font-semibold"
              style={{
                gridColumnStart: offset ? offset + 1 : undefined,
                borderColor: d.leave === "approved" ? "var(--series-1)" : s === "available" ? "var(--status-good)" : s === "unavailable" ? "var(--status-critical)" : d.leave === "pending" ? "var(--series-1)" : "var(--hairline)",
                borderStyle: d.leave === "pending" ? "dashed" : undefined,
                background: d.leave === "approved" ? "color-mix(in srgb, var(--series-1) 14%, transparent)" : d.shift ? "var(--wash-neutral)" : s === "available" ? "var(--wash-good)" : s === "unavailable" ? "var(--wash-critical)" : "transparent",
                color: d.shift && d.leave !== "approved" ? "var(--text-muted)" : undefined,
              }}
            >
              {Number(d.date.slice(8))}
              <span className="text-[9px] font-normal">{d.leave === "approved" ? "leave" : d.shift ? "on" : s === "available" ? "free" : s === "unavailable" ? "not free" : d.leave === "pending" ? "asked" : ""}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
        Tap once for <span style={{ color: "var(--good-text)" }}>free</span>, twice for <span style={{ color: "var(--critical-text)" }}>not free</span>, three times to clear.
        {pending && " Saving…"}
      </p>
    </div>
  );
}

const DECISION_LABEL = { pending: "Waiting for Administration", approved: "Approved", rejected: "Not approved", cancelled: "Withdrawn" } as const;
const DECISION_COLOUR = { pending: "var(--warning-text)", approved: "var(--good-text)", rejected: "var(--critical-text)", cancelled: "var(--text-muted)" } as const;

/**
 * Leave: what they have left, what they have asked for, and a form to ask.
 * The request goes to Administration; Control sees it on the rota at once.
 */
export function MyLeaveSection({ leave, onResult }: { leave: MyLeave; onResult: (r: ActionResult) => void }) {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { pending, form } = useLifted(requestMyLeave, (r) => {
    onResult(r);
    setProblem(r.ok ? null : r.message);
    if (r.ok) setOpen(false);
  });
  const left = leave.entitlement !== null ? leave.entitlement - leave.taken - leave.waiting : null;
  return (
    <div className="space-y-2">
      {leave.entitlement !== null ? (
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          <strong style={{ color: "var(--text-primary)" }}>{left} hours left</strong> of {leave.entitlement} this year · {leave.taken} taken
          {leave.waiting ? ` · ${leave.waiting} waiting` : ""}
          {leave.yearEnds ? ` · year ends ${dayLabel(leave.yearEnds)}` : ""}
        </p>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Ask for days off here. Administration decides; if you are on shifts then, they come off and Control finds cover.
        </p>
      )}
      {leave.requests.length > 0 && (
        <ul className="divide-y rounded-lg border" style={{ borderColor: "var(--hairline)" }}>
          {leave.requests.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
              <div className="min-w-0">
                <p className="text-[14px] font-medium">{r.from === r.to ? dayLabel(r.from) : `${dayLabel(r.from)} – ${dayLabel(r.to)}`}</p>
                <p className="text-[12px]" style={{ color: DECISION_COLOUR[r.decision] }}>
                  {DECISION_LABEL[r.decision]} · {r.hours}h{r.decision === "rejected" && r.note ? ` — ${r.note}` : ""}
                </p>
              </div>
              {r.decision === "pending" && <WithdrawLeaveButton requestId={r.id} onResult={onResult} />}
            </li>
          ))}
        </ul>
      )}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="h-11 w-full rounded-lg border text-[14px] font-semibold" style={{ borderColor: "var(--hairline)" }}>
          Ask for leave
        </button>
      ) : (
        <form {...form} className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--hairline)" }}>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[13px] font-medium">
              First day
              <input type="date" name="from" required className={`${field} mt-1 h-11 w-full text-[15px]`} style={inputStyle} />
            </label>
            <label className="block text-[13px] font-medium">
              Last day
              <input type="date" name="to" className={`${field} mt-1 h-11 w-full text-[15px]`} style={inputStyle} />
            </label>
          </div>
          <input name="note" maxLength={300} autoComplete="off" placeholder="Anything Administration should know (optional)" className={`${field} h-11 w-full text-[15px]`} style={inputStyle} />
          {problem && (
            <p role="alert" className="text-[13px]" style={{ color: "var(--critical-text)" }}>
              {problem}
            </p>
          )}
          <button type="submit" disabled={pending} className={big} style={{ background: "var(--series-1)" }}>
            {pending ? "Sending…" : "Send to Administration"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className={link} style={{ color: "var(--text-secondary)" }}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

function WithdrawLeaveButton({ requestId, onResult }: { requestId: string } & OnResult) {
  const { pending, form } = useLifted(cancelMyLeave.bind(null, requestId), onResult);
  return (
    <form {...form}>
      <button type="submit" disabled={pending} className={link} style={{ color: "var(--text-secondary)" }}>
        {pending ? "…" : "Withdraw"}
      </button>
    </form>
  );
}
