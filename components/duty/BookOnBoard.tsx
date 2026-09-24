"use client";

import { useState } from "react";
import type { ActionResult } from "@/lib/actions/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { CHANNEL_EVIDENCE, OPS_RULES } from "@/lib/core/ops";
import type { LiveRow } from "@/lib/db/queries";
import { formatTime } from "@/lib/format";
import { AttemptForm, BookOnForm, NoShowForm, TellClientForm } from "./DutyForms";
import { ByWhom, DutyFlow, Notice, OfficerCell, OnTheirBehalf, Pill, ProofBadge, Section, relative, useDuty, type DutyRow } from "./DutyShared";

export interface BookOnPerms {
  bookOn: string | null;
  attempt: string | null;
  cover: string | null;
  noSignalNotify: string | null;
}

const STRENGTH = { strong: "Strong record", good: "Good record", weak: "Weak record" } as const;

/**
 * Book-ons: the officer is at the site and on duty. The work is whoever should
 * be there and is not; below it, who is due within the hour, and who is on,
 * with when and how — because how a book-on came in decides what it is worth.
 */
export function BookOnBoard({ rows, perms }: { rows: LiveRow[]; perms: BookOnPerms }) {
  const { now, duty, counts } = useDuty(rows);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  if (!now || !counts) return <PageHeader title="Book-ons" description="Reading the shifts on now…" />;

  const start = (d: DutyRow) => new Date(d.assignment.startsAt);
  const rank = { no_show: 0, late: 1, awaiting_book_on: 2 } as Record<string, number>;
  const missing = duty
    .filter((d) => !d.bookOn && start(d) <= now)
    .sort((a, b) => (rank[a.s.stage] ?? 3) - (rank[b.s.stage] ?? 3) || start(a).getTime() - start(b).getTime());
  const dueSoon = duty
    .filter((d) => !d.bookOn && start(d) > now && start(d).getTime() - now.getTime() <= 60 * 60_000)
    .sort((a, b) => start(a).getTime() - start(b).getTime());
  const on = duty.filter((d) => d.bookOn).sort((a, b) => new Date(b.bookOn!.at).getTime() - new Date(a.bookOn!.at).getTime());

  return (
    <div className="space-y-5">
      <PageHeader
        title="Book-ons"
        description={`Officers book on themselves, in their portal, when they arrive; this is where Control watches it happen. Late after ${OPS_RULES.bookOnGraceMinutes} minutes; after ${OPS_RULES.bookOnNoShowMinutes} it is a no-show — ring them, and if they are not coming, take them off and the shift goes on the cover list.`}
      />
      <DutyFlow counts={counts} current="bookon" />
      <Notice result={notice} onClear={() => setNotice(null)} />

      <Section
        title="Should be on site — not booked on"
        count={missing.length}
        meaning="The shift has started. No-shows first"
        tone={missing.some((d) => d.s.stage === "no_show") ? "critical" : "serious"}
      >
        {missing.map((d) => (
          <li key={d.assignment.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.4fr)]" style={{ borderColor: "var(--hairline)" }}>
            <OfficerCell r={d} now={now} />
            <div className="text-[12px]">
              <Pill severity={d.s.attendance.severity} label={d.s.attendance.label} />
              <p className="mt-1" style={{ color: "var(--text-secondary)" }}>
                Chase-up: {d.s.chase.state === "confirmed" ? `confirmed at ${formatTime(d.s.chase.confirmedAt!)}` : d.s.chase.noAnswers ? `no answer ×${d.s.chase.noAnswers}` : "not confirmed"}
              </p>
              {d.runningLate && (
                <p className="font-medium" style={{ color: "var(--status-serious)" }}>
                  Said they are running late — there about {formatTime(d.runningLate.eta)}
                  {d.runningLate.note ? ` (“${d.runningLate.note}”)` : ""}
                </p>
              )}
              {d.attempts.length > 0 && (
                <p style={{ color: "var(--text-muted)" }}>
                  Tried {d.attempts.length}× since — last {formatTime(d.attempts[0].at)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <AttemptForm onResult={setNotice} assignmentId={d.assignment.id} denied={perms.attempt} label="Rang them — no answer" />
              {(d.s.stage === "late" || d.s.stage === "no_show") && <NoShowForm onResult={setNotice} assignmentId={d.assignment.id} denied={perms.cover} />}
              <OnTheirBehalf hasPortal={d.officerHasPortal}>
                <BookOnForm onResult={setNotice} assignmentId={d.assignment.id} denied={perms.bookOn} />
              </OnTheirBehalf>
            </div>
          </li>
        ))}
      </Section>

      <Section title="Due in the next hour" count={dueSoon.length} meaning="Book on when they ring in from site — up to an hour early" tone="neutral">
        {dueSoon.map((d) => (
          <li key={d.assignment.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.4fr)]" style={{ borderColor: "var(--hairline)" }}>
            <OfficerCell r={d} now={now} />
            <div className="text-[12px]">
              <Pill severity={d.s.chase.state === "confirmed" ? "good" : "serious"} label={d.s.chase.state === "confirmed" ? "Chase-up confirmed" : "Not confirmed yet"} />
              <p className="mt-1" style={{ color: "var(--text-secondary)" }}>
                Due on site {relative(start(d), now)}
              </p>
              {d.runningLate && (
                <p className="font-medium" style={{ color: "var(--status-serious)" }}>
                  Running late — there about {formatTime(d.runningLate.eta)}
                  {d.runningLate.note ? ` (“${d.runningLate.note}”)` : ""}
                </p>
              )}
            </div>
            <div>
              <OnTheirBehalf hasPortal={d.officerHasPortal}>
                <BookOnForm onResult={setNotice} assignmentId={d.assignment.id} denied={perms.bookOn} />
              </OnTheirBehalf>
            </div>
          </li>
        ))}
      </Section>

      <Section title="Booked on" count={on.length} meaning="On site and on duty — when, and how the book-on came in" tone="good">
        {on.map((d) => {
          const at = new Date(d.bookOn!.at);
          const late = Math.round((at.getTime() - start(d).getTime()) / 60_000);
          const ev = CHANNEL_EVIDENCE[d.bookOn!.channel];
          return (
            <li key={d.assignment.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.4fr)]" style={{ borderColor: "var(--hairline)" }}>
              <OfficerCell r={d} now={now} />
              <div className="text-[12px]">
                <Pill
                  severity={late > OPS_RULES.bookOnGraceMinutes ? "warning" : "good"}
                  label={late > OPS_RULES.bookOnGraceMinutes ? `Booked on ${formatTime(at)} — ${late} min late` : `Booked on ${formatTime(at)} — on time`}
                />
                <p className="mt-1 flex flex-wrap items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                  <ByWhom byOfficer={d.bookOn!.byOfficer} />
                  {d.bookOn!.proof ? "Selfie in the portal" : `${ev.label} · ${STRENGTH[ev.strength]}`}
                </p>
                <div className="mt-1.5">
                  <ProofBadge proof={d.bookOn!.proof} byOfficer={d.bookOn!.byOfficer} siteHasLocation={d.site.hasLocation} />
                </div>
              </div>
              <div>
                {!d.post.mobileSignal && !d.noSignal?.notifiedAt ? (
                  <div className="space-y-1">
                    <p className="text-[12px] font-medium" style={{ color: "var(--status-serious)" }}>
                      No signal at this post — tell the client they have arrived
                    </p>
                    <TellClientForm onResult={setNotice} assignmentId={d.assignment.id} denied={perms.noSignalNotify} />
                  </div>
                ) : (
                  <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {d.post.mobileSignal ? (d.post.checkCallsRequired ? "Hourly check calls from here — see Check calls." : `No check calls this shift: ${d.post.checkCallWhy?.toLowerCase() ?? "not required"}.`) : "Client told — they hold contact on the site phone."}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </Section>
    </div>
  );
}
