"use client";

import { useState } from "react";
import { Drawer } from "@/components/scheduling/Drawer";
import { Result, input, inputStyle } from "@/components/scheduling/RotaForms";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { useFormAction } from "@/components/ui/useFormAction";
import { bookInterview, cancelInterview, sendApplicationForm, sendWelcomePack, updateCandidateDetails, withdrawApplicationLink } from "@/lib/actions/candidates";
import type { ActionResult } from "@/lib/actions/types";
import { APPLICATION_STEPS, HISTORY_KINDS, type ApplicationDraft } from "@/lib/core/application";
import { formatDate, formatTime } from "@/lib/format";
import type { Severity } from "@/lib/types";

export interface ApplicationState {
  state: "none" | "sent" | "opened" | "submitted" | "expired";
  sentAt: string | null;
  openedAt: string | null;
  submittedAt: string | null;
  expiresAt: string | null;
  reminders: number;
  stepsDone: number;
}

export interface EmailRow {
  id: string;
  to: string;
  subject: string;
  body: string;
  status: "sent" | "failed" | "not_configured";
  createdAt: string;
}

const STATE: Record<ApplicationState["state"], { label: string; severity: Severity }> = {
  none: { label: "Not sent", severity: "neutral" },
  sent: { label: "Sent — not opened yet", severity: "warning" },
  opened: { label: "In progress", severity: "warning" },
  submitted: { label: "Received", severity: "good" },
  expired: { label: "Link expired", severity: "serious" },
};

const linkIn = (body: string) => body.match(/https?:\/\/\S+/)?.[0] ?? null;

/**
 * The application form: sent to the candidate by email, filled in and
 * documents uploaded by them. Recruitment sees where it has got to, sends it
 * again, or withdraws the link — and every email that went, or could not go.
 */
export function ApplicationPanel({ candidacyId, app, emails, denied, hasEmail }: { candidacyId: string; app: ApplicationState; emails: EmailRow[]; denied: string | null; hasEmail: boolean }) {
  const send = useFormAction(sendApplicationForm.bind(null, candidacyId));
  const withdraw = useFormAction(withdrawApplicationLink.bind(null, candidacyId));
  const s = STATE[app.state];
  return (
    <Card title="Application form" subtitle="Sent to the candidate by email. They fill it in and upload their own documents; it lands in their screening file." action={<StatusPill severity={s.severity} label={s.label} />}>
      <div className="space-y-3 text-[13px]">
        {app.state !== "none" && (
          <p style={{ color: "var(--text-secondary)" }}>
            {app.sentAt && `Sent ${formatDate(app.sentAt)} ${formatTime(app.sentAt)}`}
            {app.openedAt && ` · opened ${formatDate(app.openedAt)}`}
            {app.state === "opened" && ` · ${app.stepsDone} of ${APPLICATION_STEPS.length - 1} steps done`}
            {app.reminders > 0 && ` · reminded ${app.reminders}×`}
            {app.submittedAt && ` · received ${formatDate(app.submittedAt)} ${formatTime(app.submittedAt)}`}
            {app.expiresAt && app.state !== "submitted" && ` · link works until ${formatDate(app.expiresAt)}`}
          </p>
        )}
        {!denied && app.state !== "submitted" && (
          <div className="flex flex-wrap items-center gap-2">
            <form {...send.form}>
              <button type="submit" disabled={send.pending || !hasEmail} title={hasEmail ? undefined : "Add their email address first"} className="h-9 rounded-md px-3 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--series-1)" }}>
                {send.pending ? "Sending…" : app.state === "none" ? "Send the application form" : "Send a new link"}
              </button>
            </form>
            {(app.state === "sent" || app.state === "opened") && (
              <form {...withdraw.form}>
                <button type="submit" disabled={withdraw.pending} className="h-9 rounded-md border px-3 text-[13px]" style={{ borderColor: "var(--hairline)" }}>
                  Withdraw the link
                </button>
              </form>
            )}
            {!hasEmail && <span style={{ color: "var(--status-serious)" }}>Add their email address to send it.</span>}
          </div>
        )}
        <Result state={send.state ?? withdraw.state} />
        {emails.length > 0 && (
          <div>
            <p className="text-[12px] font-semibold">Emails</p>
            <ul className="mt-1 divide-y" style={{ borderColor: "var(--hairline)" }}>
              {emails.map((e) => {
                const link = linkIn(e.body);
                return (
                  <li key={e.id} className="py-2" style={{ borderColor: "var(--hairline)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{e.subject}</span>
                      <StatusPill severity={e.status === "sent" ? "good" : e.status === "failed" ? "critical" : "warning"} label={e.status === "sent" ? "Sent" : e.status === "failed" ? "Failed" : "Not sent — email not set up"} />
                    </div>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      To {e.to} · {formatDate(e.createdAt)} {formatTime(e.createdAt)}
                    </p>
                    {e.status !== "sent" && link && <CopyLink link={link} />}
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px]" style={{ color: "var(--text-secondary)" }}>
                        Show the email
                      </summary>
                      <pre className="mt-1 text-[12px] whitespace-pre-wrap" style={{ fontFamily: "inherit", color: "var(--text-secondary)" }}>
                        {e.body}
                      </pre>
                    </details>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

export interface PackState {
  state: "none" | "sent" | "opened" | "signed" | "expired";
  sentAt: string | null;
  openedAt: string | null;
  signed: string | null;
  expiresAt: string | null;
  reminders: number;
}

const PACK: Record<PackState["state"], { label: string; severity: Severity }> = {
  none: { label: "Not sent", severity: "neutral" },
  sent: { label: "Sent — not opened yet", severity: "warning" },
  opened: { label: "Opened — not signed", severity: "warning" },
  signed: { label: "Signed", severity: "good" },
  expired: { label: "Link expired", severity: "serious" },
};

/**
 * The welcome pack, by email link after the conditional offer. The candidate
 * reads and signs online; each part they accept ticks itself off the
 * onboarding checklist below.
 */
export function WelcomePackPanel({ candidacyId, pack, ready, denied, hasEmail }: { candidacyId: string; pack: PackState; ready: string | null; denied: string | null; hasEmail: boolean }) {
  const send = useFormAction(sendWelcomePack.bind(null, candidacyId));
  const withdraw = useFormAction(withdrawApplicationLink.bind(null, candidacyId));
  const s = PACK[pack.state];
  return (
    <Card title="Welcome pack" subtitle="Contract, confidentiality, restrictive covenant and handbook — signed online by the candidate." action={<StatusPill severity={s.severity} label={s.label} />}>
      <div className="space-y-3 text-[13px]">
        {pack.state !== "none" && (
          <p style={{ color: "var(--text-secondary)" }}>
            {pack.sentAt && `Sent ${formatDate(pack.sentAt)} ${formatTime(pack.sentAt)}`}
            {pack.openedAt && ` · opened ${formatDate(pack.openedAt)}`}
            {pack.reminders > 0 && ` · reminded ${pack.reminders}×`}
            {pack.signed && ` · signed ${pack.signed}`}
            {pack.expiresAt && pack.state !== "signed" && ` · link works until ${formatDate(pack.expiresAt)}`}
          </p>
        )}
        {!denied && pack.state !== "signed" && (
          ready ? (
            <p style={{ color: "var(--text-secondary)" }}>{ready}</p>
          ) : (
            <div className="space-y-2">
              <form {...send.form} className="space-y-2">
                <label className="block text-[12px] font-medium">
                  Their contract and pack documents to read (optional — PDF, JPEG or PNG)
                  <input name="attachment" type="file" multiple accept="application/pdf,image/jpeg,image/png" className="mt-1 block w-full text-[12px]" />
                </label>
                <button type="submit" disabled={send.pending || !hasEmail} title={hasEmail ? undefined : "Add their email address first"} className="h-9 rounded-md px-3 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--series-1)" }}>
                  {send.pending ? "Sending…" : pack.state === "none" ? "Send the welcome pack" : "Send a new link"}
                </button>
              </form>
              {(pack.state === "sent" || pack.state === "opened") && (
                <form {...withdraw.form}>
                  <input type="hidden" name="purpose" value="welcome_pack" />
                  <button type="submit" disabled={withdraw.pending} className="h-9 rounded-md border px-3 text-[13px]" style={{ borderColor: "var(--hairline)" }}>
                    Withdraw the link
                  </button>
                </form>
              )}
            </div>
          )
        )}
        <Result state={send.state ?? withdraw.state} />
      </div>
    </Card>
  );
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
      <code className="max-w-full truncate rounded px-1.5 py-0.5" style={{ background: "var(--wash-neutral)" }}>
        {link}
      </code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(link);
          setCopied(true);
        }}
        className="h-7 rounded-md border px-2.5"
        style={{ borderColor: "var(--hairline)" }}
      >
        {copied ? "Copied" : "Copy the link"}
      </button>
    </div>
  );
}

/** What the candidate sent: their addresses, history, right to work and next of kin. */
export function ApplicationSummary({ d, signed }: { d: ApplicationDraft & { signedName?: string; signedAt?: string; signedIp?: string }; signed: string | null }) {
  const kind = (k: string) => HISTORY_KINDS.find((x) => x.id === k)?.label ?? k;
  return (
    <Card title="What they sent" subtitle={signed ? `E-signed ${signed}. Their history is the stated timeline on their screening file.` : undefined}>
      <div className="space-y-3 text-[13px]">
        <div>
          <p className="text-[12px] font-semibold">Addresses</p>
          <ul className="mt-1 space-y-0.5" style={{ color: "var(--text-secondary)" }}>
            {(d.addresses ?? []).map((a, i) => (
              <li key={i}>
                {a.address}, {a.postcode} — {a.from} to {a.to || "now"}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[12px] font-semibold">History</p>
          <ul className="mt-1 space-y-1">
            {(d.history ?? []).map((h, i) => (
              <li key={i}>
                <strong>{h.organisation || kind(h.kind)}</strong>
                {h.role && ` · ${h.role}`} <span style={{ color: "var(--text-secondary)" }}>· {h.from} to {h.current ? "now" : h.to}</span>
                {h.contactName && (
                  <span className="block text-[12px]" style={{ color: "var(--text-muted)" }}>
                    Contact given: {h.contactName} {h.contactPhone} {h.contactEmail}
                    {h.current && h.kind === "employment" ? ` · may contact now: ${h.mayContact ? "yes" : "not yet"}` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <p>
          <span className="text-[12px] font-semibold">Right to work: </span>
          {d.rightToWork?.route === "share_code" ? `share code ${d.rightToWork.shareCode}` : d.rightToWork?.route === "british_irish" ? "British or Irish citizen" : "—"}
        </p>
        <p>
          <span className="text-[12px] font-semibold">Next of kin: </span>
          {d.nextOfKin?.name ? `${d.nextOfKin.name} (${d.nextOfKin.relation}) · ${d.nextOfKin.phone}` : "—"}
        </p>
      </div>
    </Card>
  );
}

/** Correct the candidate's details. The duplicate check runs again on the correction. */
export function EditDetails({ candidacyId, person, denied }: { candidacyId: string; person: { fullName: string; email: string | null; phone: string | null; dateOfBirth: string | null; nationalInsurance: string | null; address: string | null; postcode: string | null }; denied: string | null }) {
  const [open, setOpen] = useState(false);
  const save = useFormAction(
    async (prev: ActionResult | null, data: FormData) => {
      const r = await updateCandidateDetails(candidacyId, prev, data);
      if (r.ok) setOpen(false);
      return r;
    },
    { resetOnSuccess: false },
  );
  if (denied) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[12px] underline" style={{ color: "var(--series-1)" }}>
        Edit details
      </button>
      {open && (
        <Drawer title={`Edit ${person.fullName}`} subtitle="Corrections are logged, and checked against everyone else so a duplicate is not made." onClose={() => setOpen(false)}>
          <form {...save.form} className="space-y-3">
            {(
              [
                ["fullName", "Full name", person.fullName, "text"],
                ["email", "Email", person.email, "email"],
                ["phone", "Phone", person.phone, "tel"],
                ["dateOfBirth", "Date of birth", person.dateOfBirth, "date"],
                ["nationalInsurance", "National Insurance number", person.nationalInsurance, "text"],
                ["address", "Address", person.address, "text"],
                ["postcode", "Postcode", person.postcode, "text"],
              ] as const
            ).map(([name, label, value, type]) => (
              <label key={name} className="block text-[12px] font-medium">
                {label}
                <input name={name} type={type} defaultValue={value ?? ""} className={`${input} mt-1`} style={inputStyle} />
              </label>
            ))}
            <button type="submit" disabled={save.pending} className="h-10 w-full rounded-md text-[13px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--series-1)" }}>
              {save.pending ? "Saving…" : "Save"}
            </button>
            <Result state={save.state} />
          </form>
        </Drawer>
      )}
    </>
  );
}

export interface BookingRow {
  id: string;
  stage: "first" | "second" | "additional";
  startsAt: string;
  minutes: number;
  place: string;
  interviewer: string | null;
  status: "booked" | "held" | "cancelled" | "no_show";
  cancelledReason: string | null;
}

const STAGE_LABEL = { first: "First interview", second: "Second interview", additional: "Additional interview" } as const;

/** Book an interview: the candidate is emailed the invitation, and reminded the day before. */
export function InterviewDiary({ candidacyId, bookings, interviewers, denied }: { candidacyId: string; bookings: BookingRow[]; interviewers: { id: string; name: string }[]; denied: string | null }) {
  const book = useFormAction(bookInterview.bind(null, candidacyId));
  const [open, setOpen] = useState(false);
  const upcoming = bookings.filter((b) => b.status === "booked");
  return (
    <div className="space-y-3">
      {bookings.length > 0 && (
        <ul className="divide-y text-[13px]" style={{ borderColor: "var(--hairline)" }}>
          {bookings.map((b) => (
            <BookingItem key={b.id} b={b} denied={denied} />
          ))}
        </ul>
      )}
      {!denied && !open && (
        <button type="button" onClick={() => setOpen(true)} className="h-9 rounded-md border px-3 text-[13px] font-medium" style={{ borderColor: "var(--series-1)", color: "var(--series-1)" }}>
          {upcoming.length ? "Book another interview" : "Book an interview"}
        </button>
      )}
      {open && (
        <form {...book.form} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2" style={{ borderColor: "var(--hairline)" }}>
          <label className="text-[12px] font-medium">
            Which interview
            <select name="stage" className={`${input} mt-1`} style={inputStyle}>
              <option value="first">First interview</option>
              <option value="second">Second interview</option>
              <option value="additional">Additional (client) interview</option>
            </select>
          </label>
          <label className="text-[12px] font-medium">
            With
            <select name="interviewerUserId" className={`${input} mt-1`} style={inputStyle}>
              <option value="">Not decided</option>
              {interviewers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] font-medium">
            Date
            <input type="date" name="date" required className={`${input} mt-1`} style={inputStyle} />
          </label>
          <label className="text-[12px] font-medium">
            Time
            <input type="time" name="time" required className={`${input} mt-1`} style={inputStyle} />
          </label>
          <label className="text-[12px] font-medium sm:col-span-2">
            Where
            <input name="place" required placeholder="The office address, “Phone”, or a video link" className={`${input} mt-1`} style={inputStyle} />
          </label>
          <label className="text-[12px] font-medium">
            How long
            <select name="minutes" defaultValue="30" className={`${input} mt-1`} style={inputStyle}>
              {[15, 30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={book.pending} className="h-9 flex-1 rounded-md text-[13px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--series-1)" }}>
              {book.pending ? "Booking…" : "Book and email them"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-md border px-3 text-[13px]" style={{ borderColor: "var(--hairline)" }}>
              Cancel
            </button>
          </div>
          <div className="sm:col-span-2">
            <Result state={book.state} />
          </div>
        </form>
      )}
    </div>
  );
}

function BookingItem({ b, denied }: { b: BookingRow; denied: string | null }) {
  const cancel = useFormAction(cancelInterview.bind(null, b.id));
  const [why, setWhy] = useState(false);
  const past = new Date(b.startsAt).getTime() < Date.now();
  return (
    <li className="py-2" style={{ borderColor: "var(--hairline)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <strong>{STAGE_LABEL[b.stage]}</strong> · {formatDate(b.startsAt)} {formatTime(b.startsAt)} · {b.minutes} min
        </span>
        <StatusPill
          severity={b.status === "booked" ? (past ? "warning" : "good") : b.status === "held" ? "neutral" : "serious"}
          label={b.status === "booked" ? (past ? "Due — record the outcome" : "Booked") : b.status === "held" ? "Held" : b.status === "no_show" ? "Did not come" : "Cancelled"}
        />
      </div>
      <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {b.place}
        {b.interviewer && ` · with ${b.interviewer}`}
        {b.cancelledReason && ` · ${b.cancelledReason}`}
      </p>
      {b.status === "booked" && !denied && (
        <form {...cancel.form} className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
          {why ? (
            <>
              <input name="reason" required placeholder="Why it is cancelled" className="h-8 min-w-[12rem] flex-1 rounded-md border px-2" style={{ borderColor: "var(--hairline)" }} />
              <button type="submit" className="h-8 rounded-md border px-2.5" style={{ borderColor: "var(--hairline)" }}>
                Cancel it
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setWhy(true)} className="underline" style={{ color: "var(--text-secondary)" }}>
                Cancel or move
              </button>
              {past && (
                <button type="submit" name="noShow" value="1" className="underline" style={{ color: "var(--status-serious)" }}>
                  They did not come
                </button>
              )}
            </>
          )}
          <Result state={cancel.state} />
        </form>
      )}
    </li>
  );
}
