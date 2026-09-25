"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Drawer } from "@/components/scheduling/Drawer";
import { Result, input, inputStyle } from "@/components/scheduling/RotaForms";
import { Card } from "@/components/ui/Card";
import { useFormAction } from "@/components/ui/useFormAction";
import { useNow } from "@/components/ui/useNow";
import {
  acceptHubTask,
  addHubFile,
  changeHubCategory,
  changeHubPriority,
  closeHubTask,
  confirmHubSorting,
  correctHubTime,
  editHubNote,
  escalateHubTask,
  moveHubDepartment,
  reassignHubTask,
  recordHubFollowUp,
  recordHubNote,
  removeHubFile,
  resumeHubTask,
  setHubNextAction,
  setHubWaiting,
} from "@/lib/actions/hub";
import type { ActionResult } from "@/lib/actions/types";
import { CATEGORIES, DEPARTMENTS, OUTCOMES, PRIORITIES, WAITING, categoryLabel, clocksFor, departmentLabel, outcomeOf, priorityOf, sourceLabel, spanText, spanWords, statusOf, type HubPriority } from "@/lib/core/hub";
import type { HubTaskFull } from "@/lib/db/hub-queries";
import { CategoryChip, ClockBadge, Owner, PriorityBadge, StatusBadge, TONE, localInput, ukDateTimeOf } from "./HubBits";

type Can = { work: boolean; supervise: boolean };
type Act = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

const primary = "h-10 w-full rounded-md text-[13px] font-semibold text-white disabled:opacity-60";
const btn = "h-9 rounded-md border px-3 text-[12px] font-semibold disabled:opacity-60";
const muted = { color: "var(--text-secondary)" } as const;
const F = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block text-[12px] font-medium">
    {label}
    <span className="mt-1 block">{children}</span>
  </label>
);

/** A button that opens a form in a drawer, and closes it when the form succeeds. */
function FormDrawer({ label, title, subtitle, action, children, submit, tone = "primary", small = false }: { label: ReactNode; title: string; subtitle: string; action: Act; children: ReactNode; submit: string; tone?: "primary" | "plain" | "danger"; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const f = useFormAction(
    async (prev: ActionResult | null, fd: FormData) => {
      const r = await action(prev, fd);
      if (r.ok) setOpen(false);
      return r;
    },
    { resetOnSuccess: false },
  );
  const style =
    tone === "primary"
      ? { background: "var(--brand-royal)", color: "#fff", borderColor: "var(--brand-royal)" }
      : tone === "danger"
        ? { color: "var(--status-critical)", borderColor: "var(--status-critical)" }
        : { borderColor: "var(--hairline)" };
  return (
    <>
      {small ? (
        <button type="button" onClick={() => setOpen(true)} className="text-[11px] underline underline-offset-2" style={{ color: "var(--brand-royal)" }}>
          {label}
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={btn} style={style}>
          {label}
        </button>
      )}
      {open && (
        <Drawer title={title} subtitle={subtitle} onClose={() => setOpen(false)}>
          <form {...f.form} className="space-y-3">
            {children}
            <button type="submit" disabled={f.pending} className={primary} style={{ background: tone === "danger" ? "var(--status-critical)" : "var(--series-1)" }}>
              {f.pending ? "Saving…" : submit}
            </button>
            <Result state={f.state} />
          </form>
        </Drawer>
      )}
    </>
  );
}

function OneClick({ action, label, tone = "plain" }: { action: Act; label: string; tone?: "primary" | "plain" }) {
  const f = useFormAction(action);
  return (
    <form {...f.form} className="inline-flex flex-col">
      <button type="submit" disabled={f.pending} className={btn} style={tone === "primary" ? { background: "var(--brand-royal)", color: "#fff", borderColor: "var(--brand-royal)" } : { borderColor: "var(--hairline)" }}>
        {f.pending ? "…" : label}
      </button>
      {f.state && !f.state.ok && (
        <span role="alert" className="mt-1 text-[11px]" style={{ color: "var(--status-critical)" }}>
          {f.state.message}
        </span>
      )}
    </form>
  );
}

/** The pencil beside a time: correct it, with a reason; the original is kept. */
function Pencil({ t, field, label, value, allowed }: { t: HubTaskFull; field: string; label: string; value: string | null; allowed: boolean }) {
  if (!allowed) return null;
  return (
    <FormDrawer small label={<span aria-label={`Correct ${label.toLowerCase()}`}>✎</span>} title={`Correct: ${label}`} subtitle="The original stays in the history, with who changed it and why." action={correctHubTime.bind(null, t.id)} submit="Correct it">
      <input type="hidden" name="field" value={field} />
      <F label={`${label} (UK time)`}>
        <input name="value" type="datetime-local" required defaultValue={localInput(value)} className={input} style={inputStyle} />
      </F>
      <F label="Why it is being corrected">
        <input name="reason" required className={input} style={inputStyle} placeholder="e.g. accepted by phone before the hub was opened" />
      </F>
    </FormDrawer>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-[12px]" style={muted}>
        {k}
      </dt>
      <dd className="min-w-0 text-[13px] break-words">{children ?? <span style={{ color: "var(--text-muted)" }}>—</span>}</dd>
    </div>
  );
}

const NOTE_KIND = { action: { label: "Action taken", tone: "blue" }, response: { label: "Responded", tone: "green" }, note: { label: "Note", tone: "grey" }, follow_up: { label: "Follow-up", tone: "amber" } } as const;

export function HubTaskView({ t, meId, can }: { t: HubTaskFull; meId: string; can: Can }) {
  const now = useNow(1000);
  const owner = t.owner?.id === meId;
  const closed = ["completed", "unsuccessful", "cancelled"].includes(t.status);
  const waiting = WAITING.includes(t.status as never);
  const office = t.officeHours;
  const warn = clocksFor(new Date(t.receivedAt), t.priority as HubPriority, office, t.policy);
  const p = t.policy[t.priority as HubPriority];
  const clockBox = (label: string, span: string, due: string | null, doneAt: string | null, warnAt: Date | null) => {
    const late = !!due && (doneAt ? new Date(doneAt) > new Date(due) : !!now && now > new Date(due));
    const warning = !late && !doneAt && !!now && !!warnAt && now >= warnAt;
    const tone = doneAt ? (late ? "amber" : "green") : late ? "red" : warning ? "amber" : "blue";
    return (
      <div className="rounded-md border px-3 py-2" style={{ borderColor: TONE[tone].fg, background: TONE[tone].bg }}>
        <p className="text-[10px] font-semibold tracking-wide uppercase" style={muted}>
          {label} · within {span}
        </p>
        <p className="tnum text-[13px] font-semibold">
          {doneAt ? `${late ? "⚠ Late" : "✓ Done"} ${ukDateTimeOf(doneAt)}` : due ? (now ? (now > new Date(due) ? `⏰ ${spanWords(now.getTime() - new Date(due).getTime())} over` : `${spanWords(new Date(due).getTime() - now.getTime())} left`) : "") : "—"}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-[12px]" style={muted}>
        <Link href="/hub" className="underline underline-offset-2">
          Performance hub
        </Link>{" "}
        / {t.ref}
      </nav>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px]" style={muted}>
              {t.ref} · {sourceLabel(t.source)}
              {t.mailbox ? ` · ${t.mailbox}` : ""} · {departmentLabel(t.department)}
              {t.test ? " · test inbox" : ""}
            </p>
            <h1 className="text-[22px] font-semibold tracking-tight">{t.subject}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <PriorityBadge priority={t.priority} />
              <StatusBadge status={t.status} outcome={t.outcome} withinSla={t.withinSla} />
              <CategoryChip category={t.category} note={t.categoryNote} review={t.needsReview} />
              {t.handoverNeededAt && <span className="text-[11px] font-bold" style={{ color: TONE.amber.fg }}>⇄ Owner off shift — needs handover</span>}
              {t.breaches > 0 && <span className="text-[11px] font-bold" style={{ color: TONE.red.fg }}>⏰ {t.breaches} SLA breach{t.breaches === 1 ? "" : "es"}</span>}
            </div>
          </div>
          <div className="text-right">
            <Owner name={t.owner?.name ?? null} me={owner} />
            {!t.owner && t.suggestedOwner && (
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Suggested: {t.suggestedOwner}
              </p>
            )}
            {now && (
              <div className="mt-1">
                <ClockBadge t={t} now={now} office={office} policy={t.policy} compact />
              </div>
            )}
          </div>
        </div>

        {!closed && (
          <div className="grid gap-2 sm:grid-cols-3">
            {clockBox("Accept", spanText(p.accept), t.ackDueAt, t.acceptedAt, warn.ackWarnAt)}
            {clockBox("Action", spanText(p.action), t.actionDueAt, t.firstActionAt, warn.actionWarnAt)}
            {waiting ? (
              <div className="rounded-md border px-3 py-2" style={{ borderColor: TONE.amber.fg, background: TONE.amber.bg }}>
                <p className="text-[10px] font-semibold tracking-wide uppercase" style={muted}>
                  On hold · waiting on {t.waitingFor}
                </p>
                <p className="tnum text-[13px] font-semibold">⏸ Follow up {t.followUpAt ? ukDateTimeOf(t.followUpAt) : "—"}</p>
              </div>
            ) : (
              clockBox("Next update", spanText(p.update), t.updateDueAt, null, null)
            )}
          </div>
        )}

        {/* What can be done, by whom. */}
        <div className="flex flex-wrap items-center gap-2">
          {t.status === "unassigned" && can.work && <OneClick action={acceptHubTask.bind(null, t.id)} label="Accept / take ownership" tone="primary" />}
          {!closed && (owner || (can.work && t.status !== "unassigned")) && (
            <FormDrawer label={owner ? "Record action" : "Add a note"} title={owner ? "Record what has been done" : "Add a note"} subtitle={owner ? "Recording an action or a response starts the update clock again." : `${t.owner?.name ?? "The owner"} owns this; your note is added to its record.`} action={recordHubNote.bind(null, t.id)} submit="Save">
              {owner ? (
                <F label="What is it?">
                  <select name="kind" defaultValue="action" className={input} style={inputStyle}>
                    <option value="action">Action taken</option>
                    <option value="response">Responded to the sender (phone, message)</option>
                    <option value="note">Progress note</option>
                  </select>
                </F>
              ) : (
                <input type="hidden" name="kind" value="note" />
              )}
              <F label="What was done">
                <textarea name="text" required rows={4} className={`${input} h-auto py-2`} style={inputStyle} />
              </F>
              {owner && (
                <div className="grid grid-cols-2 gap-3">
                  <F label="Next action (optional)">
                    <input name="nextAction" defaultValue={t.nextAction ?? ""} className={input} style={inputStyle} />
                  </F>
                  <F label="By when">
                    <input name="nextActionAt" type="datetime-local" defaultValue={localInput(t.nextActionAt)} className={input} style={inputStyle} />
                  </F>
                </div>
              )}
              <F label="Evidence (optional — PDF, JPEG or PNG)">
                <input name="evidence" type="file" accept="application/pdf,image/jpeg,image/png" className="block w-full text-[12px]" />
              </F>
            </FormDrawer>
          )}
          {owner && !closed && !waiting && (
            <FormDrawer label="Put on hold" title="Waiting on someone" subtitle="The update clock stops until the follow-up time. All four are needed." action={setHubWaiting.bind(null, t.id)} submit="Put on hold" tone="plain">
              <F label="Waiting for">
                <select name="status" defaultValue="awaiting_information" className={input} style={inputStyle}>
                  {(["awaiting_information", "awaiting_client", "awaiting_officer"] as const).map((s) => (
                    <option key={s} value={s}>
                      {statusOf(s).label}
                    </option>
                  ))}
                </select>
              </F>
              <F label="Why">
                <input name="reason" required className={input} style={inputStyle} />
              </F>
              <F label="Who it is waiting on (person or organisation)">
                <input name="waitingFor" required className={input} style={inputStyle} />
              </F>
              <F label="Next follow-up">
                <input name="followUpAt" type="datetime-local" required className={input} style={inputStyle} />
              </F>
              <F label="Evidence of the last follow-up">
                <textarea name="evidence" required rows={3} placeholder="e.g. Emailed Priya at 11:52 asking for the event times" className={`${input} h-auto py-2`} style={inputStyle} />
              </F>
            </FormDrawer>
          )}
          {owner && waiting && (
            <FormDrawer label="Record follow-up" title="Followed up" subtitle="What was done to chase it, and when to chase next." action={recordHubFollowUp.bind(null, t.id)} submit="Record" tone="plain">
              <F label="What was done">
                <textarea name="evidence" required rows={3} className={`${input} h-auto py-2`} style={inputStyle} />
              </F>
              <F label="Next follow-up">
                <input name="followUpAt" type="datetime-local" required className={input} style={inputStyle} />
              </F>
            </FormDrawer>
          )}
          {(owner || can.supervise) && (waiting || t.status === "escalated") && <OneClick action={resumeHubTask.bind(null, t.id)} label="Back in progress" />}
          {(owner || can.supervise) && !closed && t.status !== "unassigned" && t.status !== "escalated" && (
            <FormDrawer label="Escalate" title="Escalate" subtitle="The Shift Supervisor and the department's manager are told at once." action={escalateHubTask.bind(null, t.id)} submit="Escalate" tone="danger">
              <F label="Why">
                <textarea name="note" required rows={3} className={`${input} h-auto py-2`} style={inputStyle} />
              </F>
            </FormDrawer>
          )}
          {owner && !closed && (
            <FormDrawer label="Next action" title="Next action" subtitle="What happens next, and by when — shown on the list." action={setHubNextAction.bind(null, t.id)} submit="Set" tone="plain">
              <F label="Next action">
                <input name="nextAction" required defaultValue={t.nextAction ?? ""} className={input} style={inputStyle} />
              </F>
              <F label="By when">
                <input name="nextActionAt" type="datetime-local" required defaultValue={localInput(t.nextActionAt)} className={input} style={inputStyle} />
              </F>
            </FormDrawer>
          )}
          {!closed && (owner || can.supervise) && (
            <FormDrawer label={owner ? "Hand over" : t.owner ? "Reassign" : "Assign"} title={owner ? "Hand over" : "Reassign"} subtitle={owner ? "At the end of your shift: the next person owns it from now, and your note goes with it." : "The new owner is told; the move is kept in the history."} action={reassignHubTask.bind(null, t.id)} submit={owner ? "Hand over" : "Reassign"} tone="plain">
              <F label="To">
                <select name="toUserId" required defaultValue="" className={input} style={inputStyle}>
                  <option value="" disabled>
                    Choose
                  </option>
                  {t.staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.onShift ? " — on shift now" : ""}
                    </option>
                  ))}
                </select>
              </F>
              <F label={owner ? "Handover note — where it has got to" : "Why"}>
                <textarea name="reason" required rows={3} className={`${input} h-auto py-2`} style={inputStyle} />
              </F>
            </FormDrawer>
          )}
          {!closed && (owner || (can.supervise && (t.status === "unassigned" || !!t.owner))) && <CloseDrawer t={t} />}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <Card title="Sorting" subtitle={t.ai.model === "rules" ? "Sorted by the portal's rules — no AI key is set yet." : `Read by ${t.ai.model}.`}>
            <div className="space-y-3 text-[13px]">
              {t.summary && <p>{t.summary}</p>}
              {t.requiredAction && (
                <p>
                  <span className="font-semibold">Required action: </span>
                  {t.requiredAction}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-[12px]" style={muted}>
                <span>
                  First sorted as {t.ai.category ? categoryLabel(t.ai.category) : "—"}, {t.ai.priority ? priorityOf(t.ai.priority).label : "—"}
                  {t.ai.confidence !== null ? ` · confidence ${Math.round(t.ai.confidence * 100)}%` : ""}
                </span>
                {t.ai.reviewedBy && <span>· checked by {t.ai.reviewedBy}</span>}
              </div>
              {t.ai.reasons && <p className="text-[12px]" style={muted}>{t.ai.reasons}</p>}
              {can.work && !closed && (
                <div className="flex flex-wrap items-center gap-2">
                  {t.needsReview && <OneClick action={confirmHubSorting.bind(null, t.id)} label="✓ Sorting is right" tone="primary" />}
                  <CategoryDrawer t={t} />
                  <FormDrawer label="Change priority" title="Change priority" subtitle="The original is kept, with your name and reason. The clocks follow the new priority." action={changeHubPriority.bind(null, t.id)} submit="Change" tone="plain">
                    <F label="Priority">
                      <select name="priority" defaultValue={t.priority} className={input} style={inputStyle}>
                        {PRIORITIES.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </F>
                    <F label="Reason (required)">
                      <input name="reason" required className={input} style={inputStyle} />
                    </F>
                  </FormDrawer>
                  <FormDrawer label="Move department" title="Move to another department" subtitle="It goes to their list, unassigned, with your reason." action={moveHubDepartment.bind(null, t.id)} submit="Move" tone="plain">
                    <F label="Department">
                      <select name="department" defaultValue="" className={input} style={inputStyle}>
                        <option value="" disabled>
                          Choose
                        </option>
                        {DEPARTMENTS.filter((d) => d.id !== t.department).map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </F>
                    <F label="Why">
                      <input name="reason" required className={input} style={inputStyle} />
                    </F>
                  </FormDrawer>
                </div>
              )}
            </div>
          </Card>

          <Card title={t.emails.length > 1 ? `Email thread · ${t.emails.length}` : t.emails.length ? "The email" : "What was logged"} subtitle={t.emails.length ? "Kept exactly as it arrived." : undefined}>
            {t.emails.length === 0 ? (
              <div className="space-y-1 text-[13px]">
                <p style={muted}>
                  {sourceLabel(t.source)}
                  {t.senderName ? ` · ${t.senderName}` : ""}
                  {t.senderAddress ? ` · ${t.senderAddress}` : ""}
                </p>
                <p className="whitespace-pre-wrap">{t.summary}</p>
              </div>
            ) : (
              <ol className="space-y-4">
                {t.emails.map((e) => (
                  <li key={e.id} className="rounded-md border p-3" style={{ borderColor: "var(--hairline)" }}>
                    <div className="flex flex-wrap items-start justify-between gap-2 text-[12px]">
                      <div className="min-w-0" style={muted}>
                        <p>
                          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                            {e.from}
                          </span>
                        </p>
                        <p>To {e.to}</p>
                        {e.cc && <p>Cc {e.cc}</p>}
                      </div>
                      <div className="text-right">
                        <p className="tnum">{ukDateTimeOf(e.at)}</p>
                        {e.webLink && (
                          <a href={e.webLink} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: "var(--brand-royal)" }}>
                            Open in Outlook
                          </a>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-[13px] font-semibold">{e.subject}</p>
                    <div className="mt-1 max-h-[28rem] overflow-y-auto text-[13px] leading-relaxed whitespace-pre-wrap">{e.body}</div>
                    {e.attachments.length > 0 && (
                      <p className="mt-2 text-[12px]" style={muted}>
                        📎 {e.attachments.map((a) => `${a.name} (${Math.max(1, Math.round(a.size / 1024))} KB)`).join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Progress" subtitle="Actions, responses and notes, oldest first. A correction keeps the earlier version.">
            {t.notes.filter((n) => !n.superseded).length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                Nothing recorded yet.
              </p>
            ) : (
              <ol className="space-y-3">
                {t.notes
                  .filter((n) => !n.superseded)
                  .map((n) => {
                    const k = NOTE_KIND[n.kind as keyof typeof NOTE_KIND];
                    return (
                      <li key={n.id} className="border-l-2 pl-3" style={{ borderColor: TONE[k.tone].fg }}>
                        <p className="text-[11px]" style={muted}>
                          <span className="font-semibold" style={{ color: TONE[k.tone].fg }}>
                            {k.label}
                          </span>{" "}
                          · {n.by} · {ukDateTimeOf(n.at)}
                          {n.edited ? " · corrected" : ""}
                        </p>
                        <p className="text-[13px] whitespace-pre-wrap">{n.text}</p>
                        {n.files.length > 0 && (
                          <p className="text-[12px]">
                            {n.files.map((f) => (
                              <a key={f.id} href={`/hub/files/${f.id}`} target="_blank" rel="noreferrer" className="mr-2 underline underline-offset-2" style={{ color: "var(--brand-royal)" }}>
                                📎 {f.fileName}
                              </a>
                            ))}
                          </p>
                        )}
                        {n.byMe && !closed && (
                          <FormDrawer small label="Correct" title="Correct your note" subtitle="The earlier version is kept in the history." action={editHubNote.bind(null, n.id, t.id)} submit="Save correction">
                            <F label="Note">
                              <textarea name="text" required rows={4} defaultValue={n.text} className={`${input} h-auto py-2`} style={inputStyle} />
                            </F>
                          </FormDrawer>
                        )}
                      </li>
                    );
                  })}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Details">
            <dl className="grid grid-cols-[minmax(7.5rem,auto)_1fr] gap-x-3 gap-y-1.5">
              <Row k="Received">
                {ukDateTimeOf(t.receivedAt)} <Pencil t={t} field="receivedAt" label="Received" value={t.receivedAt} allowed={can.supervise} />
              </Row>
              <Row k="From">{t.senderName || t.senderAddress ? `${t.senderName ?? ""}${t.senderName && t.senderAddress ? " · " : ""}${t.senderAddress ?? ""}` : null}</Row>
              <Row k="Client">{t.client}</Row>
              <Row k="Site">{t.site}</Row>
              <Row k="Officer">{t.person ? <Link href={`/officers/${t.person.id}`} className="underline underline-offset-2">{t.person.name}</Link> : null}</Row>
              <Row k="Accepted">
                {t.acceptedAt ? ukDateTimeOf(t.acceptedAt) : null} {t.acceptedAt && <Pencil t={t} field="acceptedAt" label="Accepted" value={t.acceptedAt} allowed={can.supervise} />}
              </Row>
              <Row k="First action">
                {t.firstActionAt ? ukDateTimeOf(t.firstActionAt) : null} {t.firstActionAt && <Pencil t={t} field="firstActionAt" label="First action" value={t.firstActionAt} allowed={can.supervise} />}
              </Row>
              <Row k="First response">
                {t.firstResponseAt ? ukDateTimeOf(t.firstResponseAt) : null} {t.firstResponseAt && <Pencil t={t} field="firstResponseAt" label="First response" value={t.firstResponseAt} allowed={can.supervise} />}
              </Row>
              <Row k="Next action">
                {t.nextAction ? `${t.nextAction}${t.nextActionAt ? ` · ${ukDateTimeOf(t.nextActionAt)}` : ""}` : null} {t.nextActionAt && <Pencil t={t} field="nextActionAt" label="Next action" value={t.nextActionAt} allowed={owner || can.supervise} />}
              </Row>
              {waiting && (
                <>
                  <Row k="Waiting">
                    {t.waitingReason} — on {t.waitingFor}
                  </Row>
                  <Row k="Follow up">
                    {t.followUpAt ? ukDateTimeOf(t.followUpAt) : null} <Pencil t={t} field="followUpAt" label="Next follow-up" value={t.followUpAt} allowed={owner || can.supervise} />
                  </Row>
                  <Row k="Last follow-up">{t.followUpEvidence}</Row>
                </>
              )}
              {t.status === "escalated" && <Row k="Escalated">{t.escalationNote}</Row>}
              {closed && (
                <>
                  <Row k="Completed">
                    {t.completedAt ? ukDateTimeOf(t.completedAt) : null} {t.completedAt && <Pencil t={t} field="completedAt" label="Completed" value={t.completedAt} allowed={can.supervise} />}
                  </Row>
                  <Row k="Outcome">{t.outcome ? outcomeOf(t.outcome)?.label : null}</Row>
                  <Row k="Reason">{t.outcomeReason}</Row>
                  <Row k="Corrective action">{t.correctiveAction}</Row>
                  <Row k="Closed by">{t.completedBy}</Row>
                </>
              )}
              <Row k="Created by">{t.createdBy ?? (t.source === "outlook" ? "Outlook" : null)}</Row>
              <Row k="Last updated by">{t.updatedBy}</Row>
            </dl>
          </Card>

          <Card title="Evidence" action={can.work && !closed ? <EvidenceUpload taskId={t.id} /> : undefined}>
            {t.files.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                None.
              </p>
            ) : (
              <ul className="space-y-1.5 text-[13px]">
                {t.files.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
                    {f.removed ? (
                      <span style={{ color: "var(--text-muted)" }}>
                        <s>{f.name}</s> — removed by {f.removed.by}: {f.removed.reason}
                      </span>
                    ) : (
                      <a href={`/hub/files/${f.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: "var(--brand-royal)" }}>
                        📎 {f.name}
                      </a>
                    )}
                    <span className="text-[11px]" style={muted}>
                      {f.by} · {ukDateTimeOf(f.at)}
                      {!f.removed && (f.byMe || can.supervise) && !closed && (
                        <>
                          {" "}
                          <FormDrawer small label="Remove" title="Remove evidence" subtitle="It stays in the history as removed, with your reason." action={removeHubFile.bind(null, f.id, t.id)} submit="Remove" tone="danger">
                            <F label="Why">
                              <input name="reason" required className={input} style={inputStyle} />
                            </F>
                          </FormDrawer>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Ownership">
            {t.ownership.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                Nobody has taken it yet.
              </p>
            ) : (
              <ol className="space-y-1.5 text-[12px]">
                {t.ownership.map((o, i) => (
                  <li key={i}>
                    <span className="font-semibold">{o.kind === "accept" ? `${o.to} accepted` : o.kind === "handover" ? `${o.from ?? "—"} handed over to ${o.to}` : `${o.by} reassigned to ${o.to}${o.from ? ` from ${o.from}` : ""}`}</span>
                    <span style={muted}> · {ukDateTimeOf(o.at)}</span>
                    {o.reason && <p style={muted}>“{o.reason}”</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {(t.sla.length > 0 || t.changes.length > 0) && (
            <Card title="SLA and corrections">
              <ul className="space-y-1.5 text-[12px]">
                {t.sla.map((s, i) => (
                  <li key={`s${i}`}>
                    <span className="font-semibold" style={{ color: s.kind === "breach" ? TONE.red.fg : TONE.amber.fg }}>
                      {s.kind === "breach" ? "⏰ Breach" : "⚠ Warning"}
                    </span>{" "}
                    — {s.clock === "accept" ? "no owner" : s.clock === "action" ? "no action recorded" : "no update"} by {ukDateTimeOf(s.dueAt)}
                  </li>
                ))}
                {t.changes.map((c, i) => (
                  <li key={`c${i}`}>
                    <span className="font-semibold">✎ {c.field}</span> — {c.from ?? "blank"} → {c.to} · {c.by}, {ukDateTimeOf(c.at)}
                    {c.reason ? <span style={muted}> · “{c.reason}”</span> : null}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Audit history" subtitle="Every action, with who and exactly when. Cannot be edited.">
            <details>
              <summary className="cursor-pointer text-[12px]" style={{ color: "var(--brand-royal)" }}>
                Show all {t.history.length} entries
              </summary>
              <ol className="mt-2 space-y-2 text-[12px]">
                {t.history.map((h) => (
                  <li key={h.id}>
                    <p className="tnum" style={muted}>
                      {new Date(h.at).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "medium" })} · {h.by}
                    </p>
                    <p>{h.detail}</p>
                  </li>
                ))}
              </ol>
            </details>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CategoryDrawer({ t }: { t: HubTaskFull }) {
  const [cat, setCat] = useState<string>(t.category);
  return (
    <FormDrawer label="Correct category" title="Correct the category" subtitle="Every correction is kept, so the sorting can be improved." action={changeHubCategory.bind(null, t.id)} submit="Correct" tone="plain">
      <F label="Category">
        <select name="category" value={cat} onChange={(e) => setCat(e.target.value)} className={input} style={inputStyle}>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </F>
      {cat === "other" && (
        <F label="What is it? (required for Other)">
          <input name="categoryNote" required defaultValue={t.categoryNote ?? ""} className={input} style={inputStyle} />
        </F>
      )}
      <F label="Reason (optional)">
        <input name="reason" className={input} style={inputStyle} />
      </F>
    </FormDrawer>
  );
}

function CloseDrawer({ t }: { t: HubTaskFull }) {
  const [outcome, setOutcome] = useState("successful");
  const o = outcomeOf(outcome);
  const late = t.breaches > 0;
  return (
    <FormDrawer label="Close task" title={`Close ${t.ref}`} subtitle="Choose the outcome. Unsuccessful, cancelled or dropped — or anything that went over its time — needs the reason and the corrective action." action={closeHubTask.bind(null, t.id)} submit="Close task" tone="plain">
      <F label="Outcome">
        <select name="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)} className={input} style={inputStyle}>
          {OUTCOMES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </F>
      {(o?.explain || late) && (
        <p className="text-[12px]" style={{ color: TONE.red.fg }}>
          {late ? `This went over its time (${t.breaches} breach${t.breaches === 1 ? "" : "es"}), so both are needed.` : "Both are needed for this outcome."}
        </p>
      )}
      <F label={`Reason${o?.explain || late ? " (required)" : " (optional)"}`}>
        <textarea name="reason" rows={2} required={o?.explain || late} className={`${input} h-auto py-2`} style={inputStyle} />
      </F>
      <F label={`Corrective action${o?.explain || late ? " (required)" : " (optional)"}`}>
        <textarea name="corrective" rows={2} required={o?.explain || late} placeholder="What stops it happening again" className={`${input} h-auto py-2`} style={inputStyle} />
      </F>
    </FormDrawer>
  );
}

function EvidenceUpload({ taskId }: { taskId: string }) {
  return (
    <FormDrawer small label="+ Add" title="Add evidence" subtitle="PDF, JPEG or PNG, up to 10 MB." action={addHubFile.bind(null, taskId)} submit="Add">
      <F label="File">
        <input name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className="block w-full text-[12px]" />
      </F>
    </FormDrawer>
  );
}
