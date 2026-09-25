"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Drawer } from "@/components/scheduling/Drawer";
import { Result, input, inputStyle } from "@/components/scheduling/RotaForms";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { useFormAction } from "@/components/ui/useFormAction";
import { addTraining, raiseLeaveFor, recordLeaver, updateContract, updateEmployeeContact, updateNextOfKin, updatePayroll, uploadEmployeeDocument } from "@/lib/actions/employees";
import type { ActionResult } from "@/lib/actions/types";
import { CONTRACT_TYPES, EMPLOYEE_DOCUMENT_TYPES, LEAVER_REASONS, contractLabel, expiryState, leaverLabel } from "@/lib/core/employees";
import { dayLabel } from "@/lib/core/rota";
import type { Employee } from "@/lib/db/employees";
import { formatDate } from "@/lib/format";
import type { Severity } from "@/lib/types";

type Props = {
  e: Employee;
  today: string;
  editDenied: string | null;
  payrollDenied: string | null;
  leaverDenied: string | null;
  officerHref: string | null;
};

const muted = { color: "var(--text-secondary)" } as const;
const save = "h-10 w-full rounded-md text-[13px] font-semibold text-white disabled:opacity-60";
const linkBtn = "text-[12px] underline underline-offset-2";

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1.5 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt style={muted}>{k}</dt>
          <dd className="min-w-0 break-words">{v ?? <span style={{ color: "var(--text-muted)" }}>—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A labelled field for the drawers. */
function F({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[12px] font-medium">
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

/** "Edit" beside a card title, opening the card's form in a drawer; closes itself on success. */
function EditDrawer({
  label,
  title,
  subtitle,
  denied,
  action,
  children,
  submit = "Save",
  danger = false,
}: {
  label: string;
  title: string;
  subtitle: string;
  denied: string | null;
  action: (prev: ActionResult | null, data: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submit?: string;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const f = useFormAction(
    async (prev: ActionResult | null, data: FormData) => {
      const r = await action(prev, data);
      if (r.ok) setOpen(false);
      return r;
    },
    { resetOnSuccess: false },
  );
  if (denied) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={linkBtn} style={{ color: danger ? "var(--critical-text)" : "var(--accent-text)" }}>
        {label}
      </button>
      {open && (
        <Drawer title={title} subtitle={subtitle} onClose={() => setOpen(false)}>
          <form {...f.form} className="space-y-3">
            {children}
            <button type="submit" disabled={f.pending} className={save} style={{ background: danger ? "var(--status-critical)" : "var(--series-1)" }}>
              {f.pending ? "Saving…" : submit}
            </button>
            <Result state={f.state} />
          </form>
        </Drawer>
      )}
    </>
  );
}

const STATE: Record<string, { label: string; severity: Severity }> = {
  conditional: { label: "Conditional", severity: "warning" },
  confirmed: { label: "Confirmed", severity: "good" },
  suspended: { label: "Suspended", severity: "critical" },
  ended: { label: "Left", severity: "neutral" },
};

const DECISION: Record<string, { label: string; severity: Severity }> = {
  pending: { label: "Waiting for Administration", severity: "warning" },
  approved: { label: "Approved", severity: "good" },
  rejected: { label: "Not approved", severity: "critical" },
  cancelled: { label: "Withdrawn", severity: "neutral" },
};

const EXPIRY: Record<"ok" | "soon" | "expired", { label: string; severity: Severity }> = {
  ok: { label: "In date", severity: "good" },
  soon: { label: "Runs out soon", severity: "warning" },
  expired: { label: "Expired", severity: "critical" },
};

export function EmployeeRecord({ e, today, editDenied, payrollDenied, leaverDenied, officerHref }: Props) {
  const p = e.person;
  const job = e.employment;
  const left = job.state === "ended";
  const bind = (fn: (id: string, prev: ActionResult | null, fd: FormData) => Promise<ActionResult>) => fn.bind(null, p.id);
  const leaveLeft = e.leave.entitlement ? e.leave.entitlement.hours - e.leave.taken - e.leave.pending : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{p.fullName}</h1>
          <p className="mt-1 text-[13px]" style={muted}>
            PIN {job.pin}
            {job.jobTitle ? ` · ${job.jobTitle}` : ""} · started {formatDate(job.startedAt)}
            {p.portal ? ` · portal ${p.portal.active ? "on" : "off"}` : " · no portal account"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill severity={STATE[job.state].severity} label={STATE[job.state].label} />
          {officerHref && (
            <Link href={officerHref} className={linkBtn} style={{ color: "var(--accent-text)" }}>
              Duties &amp; rota profile
            </Link>
          )}
        </div>
      </header>

      {left && (
        <Card title="Left the company">
          <div>
            <Rows
              rows={[
                ["Last working day", job.lastWorkingDay ? dayLabel(job.lastWorkingDay) : null],
                ["Why", leaverLabel(job.leaverReason)],
                ["Note", job.leaverNote],
                ["Recorded by", job.leaverRecordedBy],
                ["Portal", p.portal ? (p.portal.active ? "Still on — ends after the last working day" : "Access ended") : "No account"],
                ["Kit still out", e.equipment.length ? `${e.equipment.length} item${e.equipment.length === 1 ? "" : "s"} — return tasks are with Admin` : "Nothing"],
              ]}
            />
            <p className="mt-3 text-[12px]" style={muted}>
              The record is kept for seven years from the last working day, then disposed of [11.3].
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Contact details"
          action={
            <EditDrawer label="Edit" title="Contact details" subtitle="Changes are logged and checked so no duplicate record is made." denied={editDenied} action={bind(updateEmployeeContact)}>
              <F label="Phone">
                <input name="phone" type="tel" defaultValue={p.phone ?? ""} className={input} style={inputStyle} />
              </F>
              <F label="Email">
                <input name="email" type="email" defaultValue={p.email ?? ""} className={input} style={inputStyle} />
              </F>
              <F label="Address">
                <input name="address" defaultValue={p.address ?? ""} className={input} style={inputStyle} />
              </F>
              <F label="Postcode">
                <input name="postcode" defaultValue={p.postcode ?? ""} className={input} style={inputStyle} />
              </F>
            </EditDrawer>
          }
        >
          <div>
            <Rows
              rows={[
                ["Phone", p.phone ? <a href={`tel:${p.phone}`} className="underline underline-offset-2">{p.phone}</a> : null],
                ["Email", p.email],
                ["Address", [p.address, p.postcode].filter(Boolean).join(", ") || null],
                ["Date of birth", p.dateOfBirth ? formatDate(p.dateOfBirth) : null],
              ]}
            />
          </div>
        </Card>

        <Card
          title="Next of kin"
          subtitle="Who Control rings if something happens on shift."
          action={
            <EditDrawer label={p.nextOfKinName ? "Edit" : "Add"} title="Next of kin" subtitle="Who to call in an emergency." denied={editDenied} action={bind(updateNextOfKin)}>
              <F label="Name">
                <input name="name" required defaultValue={p.nextOfKinName ?? ""} className={input} style={inputStyle} />
              </F>
              <F label="Relationship">
                <input name="relation" defaultValue={p.nextOfKinRelation ?? ""} placeholder="e.g. partner, mother" className={input} style={inputStyle} />
              </F>
              <F label="Phone">
                <input name="phone" type="tel" required defaultValue={p.nextOfKinPhone ?? ""} className={input} style={inputStyle} />
              </F>
            </EditDrawer>
          }
        >
          <div>
            {p.nextOfKinName ? (
              <Rows
                rows={[
                  ["Name", p.nextOfKinName],
                  ["Relationship", p.nextOfKinRelation],
                  ["Phone", p.nextOfKinPhone ? <a href={`tel:${p.nextOfKinPhone}`} className="underline underline-offset-2">{p.nextOfKinPhone}</a> : null],
                ]}
              />
            ) : (
              <StatusPill severity="warning" label="Not given yet" />
            )}
          </div>
        </Card>

        <Card
          title="Contract"
          action={
            <EditDrawer label="Edit" title="Contract" subtitle="The terms they are employed on. Upload the signed copy under Documents." denied={editDenied} action={bind(updateContract)}>
              <F label="Job title">
                <input name="jobTitle" defaultValue={job.jobTitle ?? ""} placeholder="e.g. Security Officer" className={input} style={inputStyle} />
              </F>
              <F label="Type of contract">
                <select name="contractType" defaultValue={job.contractType ?? ""} className={input} style={inputStyle}>
                  <option value="">Not set</option>
                  {CONTRACT_TYPES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </F>
              <div className="grid grid-cols-2 gap-3">
                <F label="Start date">
                  <input name="startedAt" type="date" required defaultValue={job.startedAt} className={input} style={inputStyle} />
                </F>
                <F label="Notice (weeks)">
                  <input name="noticeWeeks" type="number" min={0} max={26} defaultValue={job.noticeWeeks ?? ""} className={input} style={inputStyle} />
                </F>
              </div>
              <F label="Contract signed on">
                <input name="contractSignedAt" type="date" defaultValue={job.contractSignedAt ?? ""} className={input} style={inputStyle} />
              </F>
              {!payrollDenied && (
                <F label="Hourly rate (£)">
                  <input name="payRate" inputMode="decimal" defaultValue={job.payRatePence ? (job.payRatePence / 100).toFixed(2) : ""} placeholder="12.60" className={input} style={inputStyle} />
                </F>
              )}
            </EditDrawer>
          }
        >
          <div>
            <Rows
              rows={[
                ["Job title", job.jobTitle],
                ["Type", contractLabel(job.contractType)],
                ["Started", formatDate(job.startedAt)],
                ["Weekly hours", `Up to ${job.weeklyHours} a week on the rota`],
                ["Notice", job.noticeWeeks !== null ? `${job.noticeWeeks} week${job.noticeWeeks === 1 ? "" : "s"}` : null],
                ["Signed", job.contractSignedAt ? formatDate(job.contractSignedAt) : <StatusPill severity="warning" label="No signed contract recorded" />],
                ...(!payrollDenied ? ([["Hourly rate", job.payRatePence ? `£${(job.payRatePence / 100).toFixed(2)}` : null]] as [string, ReactNode][]) : []),
              ]}
            />
          </div>
        </Card>

        {!payrollDenied && (
          <Card
            title="Payroll"
            subtitle="Seen only by HR and Admin managers and Finance."
            action={
              <EditDrawer label="Edit" title="Payroll" subtitle="Used for the payroll export only." denied={payrollDenied} action={bind(updatePayroll)}>
                <F label="Payroll reference">
                  <input name="payrollRef" defaultValue={p.payrollRef ?? ""} className={input} style={inputStyle} />
                </F>
                <F label="National Insurance number">
                  <input name="nationalInsurance" defaultValue={p.nationalInsurance ?? ""} placeholder="QQ123456C" className={input} style={inputStyle} />
                </F>
              </EditDrawer>
            }
          >
            <div>
              <Rows
                rows={[
                  ["Payroll reference", p.payrollRef],
                  ["NI number", p.nationalInsurance],
                ]}
              />
            </div>
          </Card>
        )}

        <Card
          title="Leave"
          subtitle="Officers ask from their portal; either way Administration decides and the rota follows."
          action={
            !left ? (
              <EditDrawer label="Ask on their behalf" title={`Leave for ${p.fullName}`} subtitle="Goes to Administration to decide, like a request from their portal." denied={editDenied} action={bind(raiseLeaveFor)} submit="Send to Administration">
                <div className="grid grid-cols-2 gap-3">
                  <F label="First day">
                    <input name="from" type="date" required min={today} className={input} style={inputStyle} />
                  </F>
                  <F label="Last day">
                    <input name="to" type="date" required min={today} className={input} style={inputStyle} />
                  </F>
                </div>
                <F label="Note (optional)">
                  <input name="note" maxLength={300} className={input} style={inputStyle} />
                </F>
              </EditDrawer>
            ) : null
          }
        >
          <div className="space-y-3">
            <p className="text-[13px]">
              {e.leave.entitlement ? (
                <>
                  <strong>{leaveLeft} hours left</strong>
                  <span style={muted}>
                    {" "}
                    of {e.leave.entitlement.hours} · {e.leave.taken} taken{e.leave.pending ? ` · ${e.leave.pending} waiting` : ""}
                  </span>
                </>
              ) : (
                <span style={muted}>No entitlement set for this leave year — Administration sets it.</span>
              )}
            </p>
            {e.leave.requests.length > 0 && (
              <ul className="divide-y text-[13px]" style={{ borderColor: "var(--hairline)" }}>
                {e.leave.requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2" style={{ borderColor: "var(--hairline)" }}>
                    <span>
                      {r.from === r.to ? dayLabel(r.from) : `${dayLabel(r.from)} – ${dayLabel(r.to)}`} · {r.hours}h
                      {r.shiftsAffected ? <span style={muted}> · {r.shiftsAffected} shift{r.shiftsAffected === 1 ? "" : "s"} then</span> : null}
                    </span>
                    <StatusPill severity={DECISION[r.decision].severity} label={DECISION[r.decision].label} />
                  </li>
                ))}
              </ul>
            )}
            <Link href="/admin/people" className={linkBtn} style={{ color: "var(--accent-text)" }}>
              Decide requests in Administration
            </Link>
          </div>
        </Card>

        <Card
          title="Training"
          action={
            <EditDrawer label="Add training" title="Add training" subtitle="With the certificate if there is one. Expiry dates show on the record and in the list." denied={editDenied} action={bind(addTraining)} submit="Add">
              <F label="Course">
                <input name="course" required placeholder="e.g. Emergency First Aid at Work" className={input} style={inputStyle} />
              </F>
              <F label="Provider (optional)">
                <input name="provider" className={input} style={inputStyle} />
              </F>
              <div className="grid grid-cols-2 gap-3">
                <F label="Done on">
                  <input name="completedOn" type="date" required max={today} className={input} style={inputStyle} />
                </F>
                <F label="Runs out (optional)">
                  <input name="expiresOn" type="date" className={input} style={inputStyle} />
                </F>
              </div>
              <F label="Certificate (optional — PDF, JPEG or PNG)">
                <input name="certificate" type="file" accept="application/pdf,image/jpeg,image/png" className="block w-full text-[12px]" />
              </F>
            </EditDrawer>
          }
        >
          <div>
            {e.training.length === 0 ? (
              <p className="text-[13px]" style={muted}>
                None recorded.
              </p>
            ) : (
              <ul className="divide-y text-[13px]" style={{ borderColor: "var(--hairline)" }}>
                {e.training.map((t) => {
                  const st = expiryState(t.expiresOn, today);
                  return (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2" style={{ borderColor: "var(--hairline)" }}>
                      <span className="min-w-0">
                        <span className="font-medium">{t.course}</span>
                        <span style={muted}>
                          {t.provider ? ` · ${t.provider}` : ""} · {formatDate(t.completedOn)}
                          {t.expiresOn ? ` → ${formatDate(t.expiresOn)}` : ""}
                        </span>
                        {t.documentId && (
                          <>
                            {" · "}
                            <a href={`/documents/${t.documentId}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                              certificate
                            </a>
                          </>
                        )}
                      </span>
                      {st && <StatusPill severity={EXPIRY[st].severity} label={EXPIRY[st].label} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        <Card
          title="Documents"
          subtitle="Screening documents stay on the screening file."
          action={
            <EditDrawer label="Upload" title="Upload a document" subtitle="PDF, JPEG or PNG, up to 10 MB. Every view is logged." denied={editDenied} action={bind(uploadEmployeeDocument)} submit="Upload">
              <F label="What it is">
                <select name="typeId" required className={input} style={inputStyle}>
                  {EMPLOYEE_DOCUMENT_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </F>
              <F label="File">
                <input name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className="block w-full text-[12px]" />
              </F>
              <F label="Runs out (if it does)">
                <input name="expiresAt" type="date" className={input} style={inputStyle} />
              </F>
              <F label="Note (optional)">
                <input name="note" className={input} style={inputStyle} />
              </F>
            </EditDrawer>
          }
        >
          <div>
            {e.documents.length === 0 ? (
              <p className="text-[13px]" style={muted}>
                None yet.
              </p>
            ) : (
              <ul className="divide-y text-[13px]" style={{ borderColor: "var(--hairline)" }}>
                {e.documents.map((d) => {
                  const st = expiryState(d.expiresAt, today);
                  return (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2" style={{ borderColor: "var(--hairline)" }}>
                      <span className="min-w-0">
                        {d.hasCopy ? (
                          <a href={`/documents/${d.id}`} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                            {d.label}
                          </a>
                        ) : (
                          <span className="font-medium">{d.label}</span>
                        )}
                        <span style={muted}>
                          {d.suppliedAt ? ` · ${formatDate(d.suppliedAt)}` : ""}
                          {d.expiresAt ? ` · runs out ${formatDate(d.expiresAt)}` : ""}
                        </span>
                      </span>
                      {st && st !== "ok" && <StatusPill severity={EXPIRY[st].severity} label={EXPIRY[st].label} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        {e.equipment.length > 0 && (
          <Card title="Kit issued" subtitle="Still out with them.">
            <ul className="divide-y text-[13px]" style={{ borderColor: "var(--hairline)" }}>
              {e.equipment.map((x) => (
                <li key={x.id} className="py-2" style={{ borderColor: "var(--hairline)" }}>
                  {x.item}
                  {x.size ? ` (${x.size})` : ""}
                  {x.quantity > 1 ? ` ×${x.quantity}` : ""}
                  <span style={muted}> · issued {formatDate(x.issuedAt)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {!left && !leaverDenied && (
        <Card title="Leaving" subtitle="When someone hands in their notice, or their employment ends for any reason.">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-[12px]" style={muted}>
              Recording a leaver takes them off every shift after their last day (those go on Control&apos;s cover list), withdraws their offers and availability, frees any post they are regular on, and raises the kit return, final pay and exit interview tasks. Their portal closes after the last day.
            </p>
            <EditDrawer label="Record a leaver" title={`${p.fullName} is leaving`} subtitle="This cannot be undone from here — rehiring starts a new employment." denied={leaverDenied} action={bind(recordLeaver)} submit="Record leaver" danger>
              <F label="Last working day">
                <input name="lastWorkingDay" type="date" required min={job.startedAt} className={input} style={inputStyle} />
              </F>
              <F label="Why they are leaving">
                <select name="reason" required className={input} style={inputStyle}>
                  {LEAVER_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </F>
              <F label="Note">
                <textarea name="note" rows={3} maxLength={600} className={`${input} h-auto py-2`} style={inputStyle} placeholder="Required for 'Other'. Anything the next reader needs." />
              </F>
              {e.equipment.length > 0 && (
                <p className="text-[12px]" style={muted}>
                  {e.equipment.length} item{e.equipment.length === 1 ? "" : "s"} of kit will become return tasks for Admin.
                </p>
              )}
            </EditDrawer>
          </div>
        </Card>
      )}

      {e.emails.length > 0 && (
        <Card title="Emails sent">
          <ul className="divide-y text-[13px]" style={{ borderColor: "var(--hairline)" }}>
            {e.emails.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2" style={{ borderColor: "var(--hairline)" }}>
                <span>{m.subject}</span>
                <span style={muted}>
                  {formatDate(m.createdAt)} · {m.status === "sent" ? "sent" : m.status === "failed" ? "failed" : "not sent — email not set up"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
