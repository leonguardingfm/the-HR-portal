"use client";

import { useState } from "react";
import type { ActionResult } from "@/lib/actions/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { CHECK_CALL_RULE_LABELS } from "@/lib/core/duty";
import { ESCALATION_LADDER, OPS_RULES, escalationAction } from "@/lib/core/ops";
import type { LiveRow } from "@/lib/db/queries";
import { formatTime } from "@/lib/format";
import { AttemptForm, CheckCallForm, LostContactForm, TellClientForm } from "./DutyForms";
import { DispatchForm, VisitCard } from "./WelfareForms";
import type { OpenWelfareVisit } from "@/lib/db/welfare";
import { CallTimeline, DutyFlow, Notice, OfficerCell, OnTheirBehalf, Pill, ProofBadge, Section, SentLate, WhoElseToRing, relative, useDuty } from "./DutyShared";

export interface CheckCallPerms {
  checkCall: string | null;
  attempt: string | null;
  noSignalNotify: string | null;
  noSignalLoss: string | null;
  welfare: string | null;
}

/**
 * Check calls: once booked on, hourly, for the length of the duty. A call
 * missed is missed the moment the hour passes, and the escalation ladder moves
 * on failed attempts to reach the officer (E4). Each officer's calls are laid
 * out in a row — made, made late, missed, and still to come — so the night can
 * be read at a glance.
 */
export function CheckCallBoard({ rows, visits, managers, perms }: { rows: LiveRow[]; visits: OpenWelfareVisit[]; managers: { id: string; name: string; phone: string | null }[]; perms: CheckCallPerms }) {
  const { now, duty, counts } = useDuty(rows);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  if (!now || !counts) return <PageHeader title="Check calls" description="Reading the officers on duty…" />;

  const on = duty.filter((d) => d.bookOn && new Date(d.assignment.endsAt) > now);
  const calling = on.filter((d) => d.post.checkCallsRequired && d.post.mobileSignal);
  const missed = calling.filter((d) => d.s.call.escalation > 0).sort((a, b) => b.s.call.escalation - a.s.call.escalation || b.s.call.minutesOver - a.s.call.minutesOver);
  const fine = calling.filter((d) => d.s.call.escalation === 0).sort((a, b) => (a.s.schedule?.nextDue?.getTime() ?? 0) - (b.s.schedule?.nextDue?.getTime() ?? 0));
  const noSignal = on.filter((d) => d.post.checkCallsRequired && !d.post.mobileSignal);
  const none = on.filter((d) => !d.post.checkCallsRequired);

  const ruleLine = (d: (typeof on)[number]) =>
    `${d.post.checkCallRule ? CHECK_CALL_RULE_LABELS[d.post.checkCallRule] : "Every shift"}${d.post.checkCallRule === "nights_and_weekends" ? ` — this shift: ${d.post.checkCallWhy?.toLowerCase()}` : ""}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Check calls"
        description={`Officers make their own check calls in their portal; this is where Control watches them come in. Once booked on, one is due every ${OPS_RULES.checkCallIntervalMinutes} minutes for the length of the duty. The moment an hour passes without a call it is missed, and the alert goes up; each failed try to reach them moves the escalation a step, ending with someone attending site.`}
      />
      <DutyFlow counts={counts} current="calls" />
      <Notice result={notice} onClear={() => setNotice(null)} />

      {visits.length > 0 && (
        <Section title="Welfare visits — someone on the way" count={visits.length} meaning="Step 3. Mark them arrived, then record what they found" tone={visits.some((v) => !v.arrivedAt && new Date(v.expectedBy).getTime() + 2 * 60_000 < now.getTime()) ? "critical" : "serious"}>
          {visits.map((v) => (
            <VisitCard key={v.id} v={v} now={now} denied={perms.welfare} onResult={setNotice} />
          ))}
        </Section>
      )}

      <Section title="Missed — act now" count={missed.length} meaning="The hour has passed without a call. Try them, and record every try" tone="critical">
        {missed.map((d) => (
          <li key={d.assignment.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)]" style={{ borderColor: "var(--hairline)", background: "var(--wash-critical)" }}>
            <OfficerCell r={d} now={now} />
            <div className="space-y-1.5 text-[12px]">
              <Pill severity={d.s.call.severity} label={d.s.call.label} />
              <p className="font-semibold" style={{ color: "var(--critical-text)" }}>
                Step {d.s.call.escalation} of 3: {escalationAction(d.s.call.escalation)}
              </p>
              <p style={{ color: "var(--text-secondary)" }}>
                {d.s.call.attemptsMade} failed tr{d.s.call.attemptsMade === 1 ? "y" : "ies"} since the call went missing
              </p>
              <WhoElseToRing r={d} />
              {d.s.schedule && <CallTimeline slots={d.s.schedule.slots} now={now} />}
            </div>
            <div className="space-y-2">
              {d.welfare ? (
                <p className="rounded-md px-2.5 py-2 text-[12px] font-medium" style={{ background: "var(--wash-serious)" }}>
                  {d.welfare.attendeeName} {d.welfare.arrivedAt ? `on site since ${formatTime(d.welfare.arrivedAt)}` : `on the way — due by ${formatTime(d.welfare.expectedBy)}`}. See welfare visits above.
                </p>
              ) : (
                d.s.call.escalation === 3 && <DispatchForm assignmentId={d.assignment.id} managers={managers} denied={perms.welfare} onResult={setNotice} />
              )}
              <AttemptForm onResult={setNotice} assignmentId={d.assignment.id} denied={perms.attempt} label="Tried — no answer (next step)" />
              <OnTheirBehalf hasPortal={d.officerHasPortal}>
                <CheckCallForm onResult={setNotice} assignmentId={d.assignment.id} denied={perms.checkCall} />
              </OnTheirBehalf>
            </div>
          </li>
        ))}
      </Section>

      <Section title="In contact" count={fine.length} meaning="Calls made on time. The next one is marked in blue" tone="good">
        {fine.map((d) => (
          <li key={d.assignment.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)]" style={{ borderColor: "var(--hairline)" }}>
            <OfficerCell r={d} now={now} />
            <div className="space-y-1.5 text-[12px]">
              <p style={{ color: "var(--text-secondary)" }}>
                {d.s.schedule?.nextDue ? (
                  <>
                    Next call due <strong style={{ color: "var(--text-primary)" }}>{formatTime(d.s.schedule.nextDue)}</strong> ({relative(d.s.schedule.nextDue, now)}) · {d.s.schedule.done + d.s.schedule.late} made
                  </>
                ) : (
                  "No more calls due before the shift ends"
                )}
              </p>
              {d.s.schedule && <CallTimeline slots={d.s.schedule.slots} now={now} />}
              {d.calls[0] && <ProofBadge proof={d.calls[0].proof} byOfficer={d.calls[0].byOfficer} siteHasLocation={d.site.hasLocation} />}
              {d.calls[0]?.sentLateAt && <SentLate at={d.calls[0].at} sentLateAt={d.calls[0].sentLateAt} />}
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {d.calls.length ? `${d.calls.filter((c) => c.byOfficer).length} of ${d.calls.length} made by the officer in their portal · ` : ""}Check calls: {ruleLine(d)}
              </p>
            </div>
            <div>
              <OnTheirBehalf hasPortal={d.officerHasPortal}>
                <CheckCallForm onResult={setNotice} assignmentId={d.assignment.id} denied={perms.checkCall} />
              </OnTheirBehalf>
            </div>
          </li>
        ))}
      </Section>

      <Section title="No signal — client holding contact" count={noSignal.length} meaning="The officer cannot call from the post; the client holds contact on the site phone (E10)" tone="neutral">
        {noSignal.map((d) => (
          <li key={d.assignment.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)]" style={{ borderColor: "var(--hairline)" }}>
            <OfficerCell r={d} now={now} />
            <div className="text-[12px]">
              <Pill severity={d.s.call.severity} label={d.s.call.label} />
              {d.noSignal?.notifiedAt && (
                <p className="mt-1" style={{ color: "var(--text-secondary)" }}>
                  Client told at {formatTime(d.noSignal.notifiedAt)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              {!d.noSignal?.notifiedAt ? <TellClientForm onResult={setNotice} assignmentId={d.assignment.id} denied={perms.noSignalNotify} /> : !d.noSignal.lossReportedAt && <LostContactForm onResult={setNotice} assignmentId={d.assignment.id} denied={perms.noSignalLoss} />}
              {/* The client cannot reach the officer: straight to step 3. */}
              {d.noSignal?.lossReportedAt && !d.welfare && <DispatchForm assignmentId={d.assignment.id} managers={managers} denied={perms.welfare} onResult={setNotice} />}
            </div>
          </li>
        ))}
      </Section>

      <Section title="No check calls this shift" count={none.length} meaning="On duty, on a post whose calls are not needed on this shift" tone="neutral">
        {none.map((d) => (
          <li key={d.assignment.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,2.6fr)]" style={{ borderColor: "var(--hairline)" }}>
            <OfficerCell r={d} now={now} />
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Check calls: {d.post.checkCallRule ? CHECK_CALL_RULE_LABELS[d.post.checkCallRule] : "Not required"}. This shift: {d.post.checkCallWhy?.toLowerCase() ?? "none needed"}.
            </p>
          </li>
        ))}
      </Section>

      <section className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
        <h2 className="text-[13px] font-semibold">When a call is missed</h2>
        <ol className="mt-2 space-y-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {ESCALATION_LADDER.map((l) => (
            <li key={l.step}>
              <strong style={{ color: "var(--text-primary)" }}>Step {l.step}.</strong> {l.action} — {l.owner}. Moves on when: {l.reached.toLowerCase()}.
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
