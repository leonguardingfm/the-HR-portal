"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { useFormAction } from "@/components/ui/useFormAction";
import { Result, WeeklyHoursForm, field, inputStyle } from "@/components/scheduling/RotaForms";
import { keepOffSite, liftSiteExclusion } from "@/lib/actions/officers";
import { dayLabel } from "@/lib/core/rota";
import type { OfficerProfile } from "@/lib/db/officer-profile";
import { formatDate, formatTime } from "@/lib/format";

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;

/**
 * An officer's own page, for Control: how to reach them, whether they can
 * work, where they are, how reliable they have been, what they have said
 * about their days, which sites they know and which they are kept off.
 */
export function OfficerProfileView({ p, sites, excludeDenied, hoursDenied }: { p: OfficerProfile; sites: { id: string; name: string }[]; excludeDenied: string | null; hoursDenied: string | null }) {
  const { person, officer, record } = p;
  const d = officer?.deployability;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const standing = p.exclusions.filter((x) => !x.liftedAt);

  return (
    <div className="space-y-5">
      <PageHeader
        title={person.fullName}
        description={[
          person.employment?.pin ? `PIN ${person.employment.pin}` : "No PIN — no employment record",
          person.employment?.controlTeam ? `Control ${person.employment.controlTeam === "alpha" ? "Alpha" : person.employment.controlTeam === "bravo" ? "Bravo" : person.employment.controlTeam}` : null,
          person.employment?.startedAt ? `started ${formatDate(new Date(person.employment.startedAt).toISOString())}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <Link href="/officers" className="text-[12px] underline" style={{ color: "var(--text-secondary)" }}>
            All officers
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Reach them" subtitle="Their own numbers, and who to call if something happens to them.">
          <dl className="space-y-2 text-[13px]">
            <Row label="Phone">{person.phone ? <a href={tel(person.phone)} className="font-medium underline" style={{ color: "var(--accent-text)" }}>{person.phone}</a> : "Not recorded"}</Row>
            <Row label="Email">{person.email ?? "Not recorded"}</Row>
            <Row label="Next of kin">
              {person.nextOfKinName ?? "Not recorded"}
              {person.nextOfKinPhone && (
                <>
                  {" · "}
                  <a href={tel(person.nextOfKinPhone)} className="underline">
                    {person.nextOfKinPhone}
                  </a>
                </>
              )}
            </Row>
            <Row label="Portal">
              {person.user ? (
                <>
                  Has an account{person.user._count.pushSubscriptions ? ` · alerts on ${person.user._count.pushSubscriptions} device${person.user._count.pushSubscriptions === 1 ? "" : "s"}` : " · alerts not turned on"}
                </>
              ) : (
                "No account — Control records their checks and rings them"
              )}
            </Row>
          </dl>
        </Card>

        <Card title="Can they work?" subtitle="From the screening file, licence, right to work and employment — the same check the rota makes.">
          {d ? (
            <div className="space-y-2 text-[13px]">
              <StatusPill severity={d.deployable ? (d.warnings.length ? "warning" : "good") : "critical"} label={d.deployable ? (d.warnings.length ? "Deployable — watch" : "Deployable") : "Blocked"} wrap />
              {[...d.blockers, ...d.warnings].map((b) => (
                <p key={b.label} style={{ color: d.blockers.includes(b) ? "var(--critical-text)" : "var(--text-secondary)" }}>
                  {b.label}
                </p>
              ))}
              {officer?.licence && <p style={{ color: "var(--text-secondary)" }}>SIA licence {officer.licence.number}, expires {formatDate(new Date(officer.licence.expiresAt).toISOString())}</p>}
              <div className="pt-2">
                <p className="text-[12px] font-medium">
                  {person.employment
                    ? `Weekly hours: ${officer?.hoursThisWeek ?? 0}h of ${person.employment.weeklyHours}h this week`
                    : `${officer?.hoursThisWeek ?? 0}h on the rota this week — no agreed hours without an employment record`}
                </p>
                {person.employment && !hoursDenied && (
                  <div className="mt-1">
                    <WeeklyHoursForm personId={person.id} hours={person.employment.weeklyHours} />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Not in the officer pool — not employed or deployed.
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`Shifts ahead · ${p.ahead.length}`} subtitle="On now and the next two weeks, published and drafts.">
          {p.ahead.length === 0 ? (
            <p className="py-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
              Nothing on the rota.
            </p>
          ) : (
            <ul className="divide-y text-[13px]" style={{ borderColor: "var(--hairline)" }}>
              {p.ahead.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2" style={{ borderColor: "var(--hairline)" }}>
                  <span>
                    <strong>{s.when}</strong> · {s.where}
                  </span>
                  {s.now ? <StatusPill severity={s.bookedOn ? "good" : "serious"} label={s.bookedOn ? `On now · booked on ${s.bookedOn}` : "On now · not booked on"} /> : s.state === "amended" ? <Tag>Changed</Tag> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Their record · last ${record.days} days`} subtitle="From the duty checks — what happened, not what anyone remembers.">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
            <Stat label="Shifts worked" value={record.worked} />
            <Stat label="Booked on on time" value={pct(record.onTime, record.bookedOn)} warn={record.bookedOn > 0 && record.onTime / record.bookedOn < 0.9} />
            <Stat label="Late book-on alerts" value={record.lateBookOns} warn={record.lateBookOns > 0} />
            <Stat label="Missed check calls" value={record.missedCalls} warn={record.missedCalls > 0} />
            <Stat label="Came off shifts" value={record.cameOff} warn={record.cameOff > 2} />
            <Stat label="No-shows" value={record.noShows} warn={record.noShows > 0} />
            <Stat label="Said running late" value={record.runningLate} />
            <Stat label="Selfies away from site" value={`${record.selfiesAway} of ${record.selfies}`} warn={record.selfiesAway > 0} />
            <Stat label="Incidents reported" value={record.incidents} />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="What they said about their days" subtitle="From their portal, the next four weeks. Days not listed, they have said nothing about.">
          {p.availability.length === 0 ? (
            <p className="py-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
              Nothing said yet.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {p.availability.map((a) => (
                <li key={a.date} title={a.note ?? undefined}>
                  <StatusPill severity={a.kind === "available" ? "good" : "critical"} label={`${dayLabel(a.date)}: ${a.kind === "available" ? "free" : "not free"}`} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Sites they know" subtitle={`Shifts worked at each, last ${record.days} days.`}>
          {p.knows.length === 0 ? (
            <p className="py-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
              None yet.
            </p>
          ) : (
            <ul className="space-y-1 text-[13px]">
              {p.knows.map((k) => (
                <li key={k.site} className="flex justify-between gap-2">
                  <span>{k.site}</span>
                  <span style={{ color: "var(--text-secondary)" }}>{k.count}×</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={`Kept off sites · ${standing.length}`} subtitle="The client does not want them there, or we have taken them off it. The rota refuses them there on every path while it stands.">
        <ExclusionForms personId={person.id} sites={sites} exclusions={p.exclusions} denied={excludeDenied} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Recent shifts" subtitle="How they booked on, and the check calls made.">
          {p.recent.length === 0 ? (
            <p className="py-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
              None yet.
            </p>
          ) : (
            <ul className="divide-y text-[13px]" style={{ borderColor: "var(--hairline)" }}>
              {p.recent.map((s) => (
                <li key={s.id} className="py-2" style={{ borderColor: "var(--hairline)" }}>
                  <p>
                    <strong>{s.when}</strong> · {s.where}
                  </p>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {s.bookOn ? `Booked on ${s.bookOn.at}${s.bookOn.late > 15 ? ` (${s.bookOn.late} min late)` : ""}` : "No book-on recorded"}
                    {s.bookOn?.proof && (
                      <>
                        {" · "}
                        <Link href={`/duty/verify/${s.bookOn.proof.code}`} className="underline">
                          selfie{s.bookOn.proof.atSite === false ? " — away from the site" : s.bookOn.proof.atSite ? " at the site" : ""}
                        </Link>
                      </>
                    )}
                    {` · ${s.calls} check call${s.calls === 1 ? "" : "s"}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="In the log" subtitle="The latest entries about them.">
          <ul className="space-y-1.5 text-[12px]">
            {p.events.map((e) => (
              <li key={e.id}>
                <span style={{ color: "var(--text-muted)" }}>
                  {formatDate(e.at)} {formatTime(e.at)} ·{" "}
                </span>
                {e.detail}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <dt style={{ color: "var(--text-secondary)" }}>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number | string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[18px] font-semibold tabular-nums" style={{ color: warn ? "var(--serious-text)" : undefined }}>
        {value}
      </p>
      <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
    </div>
  );
}

function ExclusionForms({ personId, sites, exclusions, denied }: { personId: string; sites: { id: string; name: string }[]; exclusions: OfficerProfile["exclusions"]; denied: string | null }) {
  const add = useFormAction(keepOffSite.bind(null, personId));
  const standing = exclusions.filter((x) => !x.liftedAt);
  const kept = new Set(standing.map((x) => x.site));
  return (
    <div className="space-y-3">
      {standing.length === 0 && (
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          None.
        </p>
      )}
      <ul className="space-y-2">
        {standing.map((x) => (
          <Lift key={x.id} x={x} denied={denied} />
        ))}
      </ul>
      {!denied && (
        <form {...add.form} className="flex flex-wrap items-end gap-2 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
          <label className="text-[12px] font-medium">
            Keep them off
            <select name="siteId" required defaultValue="" className={`${field} mt-1 block min-w-[14rem]`} style={inputStyle}>
              <option value="" disabled>
                Choose a site…
              </option>
              {sites
                .filter((s) => !kept.has(s.name))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="min-w-[14rem] flex-1 text-[12px] font-medium">
            Why
            <input name="reason" required placeholder="e.g. The client asked, 12 Sep" className={`${field} mt-1 block w-full`} style={inputStyle} />
          </label>
          <button type="submit" disabled={add.pending} className="h-9 rounded-md px-3 text-[12px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--status-critical)" }}>
            {add.pending ? "Saving…" : "Keep off this site"}
          </button>
          <div className="w-full">
            <Result state={add.state} />
          </div>
        </form>
      )}
      {exclusions.some((x) => x.liftedAt) && (
        <details className="text-[12px]">
          <summary className="cursor-pointer" style={{ color: "var(--text-secondary)" }}>
            Lifted before
          </summary>
          <ul className="mt-1 space-y-1">
            {exclusions
              .filter((x) => x.liftedAt)
              .map((x) => (
                <li key={x.id} style={{ color: "var(--text-muted)" }}>
                  {x.site} — kept off {formatDate(x.addedAt)} ({x.reason}); lifted {formatDate(x.liftedAt!)} ({x.liftedReason})
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Lift({ x, denied }: { x: OfficerProfile["exclusions"][number]; denied: string | null }) {
  const lift = useFormAction(liftSiteExclusion.bind(null, x.id));
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-md border px-3 py-2 text-[13px]" style={{ borderColor: "var(--status-critical)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <strong>{x.site}</strong> — {x.reason} <span style={{ color: "var(--text-muted)" }}>· since {formatDate(x.addedAt)}</span>
        </span>
        {!denied && !open && (
          <button type="button" onClick={() => setOpen(true)} className="h-7 rounded-md border px-2.5 text-[12px]" style={{ borderColor: "var(--hairline)" }}>
            Lift
          </button>
        )}
      </div>
      {open && (
        <form {...lift.form} className="mt-2 flex flex-wrap items-center gap-2">
          <input name="reason" required autoFocus placeholder="Why it is being lifted" className={`${field} min-w-[14rem] flex-1`} style={inputStyle} />
          <button type="submit" disabled={lift.pending} className="h-9 rounded-md border px-3 text-[12px] font-medium" style={{ borderColor: "var(--hairline)" }}>
            {lift.pending ? "Lifting…" : "Lift"}
          </button>
          <Result state={lift.state} />
        </form>
      )}
    </li>
  );
}
