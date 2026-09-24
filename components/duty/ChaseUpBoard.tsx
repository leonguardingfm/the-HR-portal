"use client";

import { useState } from "react";
import type { ActionResult } from "@/lib/actions/types";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { CHANNEL_LABELS, OFF_REASON_LABELS, dayLabel, mondayOf, type AskChannel } from "@/lib/core/rota";
import type { RotaCoverNeed } from "@/lib/db/rota";
import type { LiveRow } from "@/lib/db/queries";
import { formatTime } from "@/lib/format";
import { ChaseUpForm } from "./DutyForms";
import { DutyFlow, Notice, OfficerCell, Pill, Section, relative, useDuty, type DutyRow } from "./DutyShared";

const OUTCOME = { confirmed: "Confirmed", no_answer: "No answer", cannot_attend: "Cannot attend" } as const;

/** What has been tried so far, oldest first. The chase is the record that it was made. */
function Tries({ r }: { r: LiveRow }) {
  if (r.chaseUps.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {r.chaseUps.map((c, i) => (
        <li key={i} className="text-[11px]" style={{ color: c.outcome === "confirmed" ? "var(--status-good)" : "var(--text-muted)" }}>
          {OUTCOME[c.outcome]} · {formatTime(c.at)}
          {c.channel ? ` · ${CHANNEL_LABELS[c.channel as AskChannel].toLowerCase()} · ${c.by}` : " · by the officer, in their portal"}
          {c.note && ` — “${c.note}”`}
        </li>
      ))}
    </ul>
  );
}

/**
 * Chase-ups: two hours before each shift, Control makes sure the officer knows
 * about it and will be on site. The list is the work: who to ring now, who is
 * coming up and when, and who has already confirmed.
 */
export function ChaseUpBoard({ rows, coverNeeds, denied }: { rows: LiveRow[]; coverNeeds: RotaCoverNeed[]; denied: string | null }) {
  const { now, duty, counts } = useDuty(rows);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  if (!now || !counts) return <PageHeader title="Chase-ups" description="Reading the shifts ahead…" />;

  const ahead = duty.filter((d) => new Date(d.assignment.startsAt) > now);
  const byStart = (a: DutyRow, b: DutyRow) => new Date(a.assignment.startsAt).getTime() - new Date(b.assignment.startsAt).getTime();
  const toChase = ahead.filter((d) => ["due", "no_answer", "urgent", "cannot_attend"].includes(d.s.chase.state)).sort(byStart);
  const comingUp = ahead.filter((d) => d.s.chase.state === "not_due").sort(byStart);
  const confirmed = ahead.filter((d) => d.s.chase.state === "confirmed").sort(byStart);
  const fromChase = coverNeeds.filter((c) => new Date(c.endsAt) > now);

  const row = (d: DutyRow, extra?: React.ReactNode) => (
    <li key={d.assignment.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.4fr)]" style={{ borderColor: "var(--hairline)" }}>
      <OfficerCell r={d} now={now} />
      <div>
        <Pill severity={d.s.chase.severity} label={d.s.chase.label} />
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {d.s.chase.state === "not_due"
            ? `Chase-up at ${formatTime(d.s.chase.dueAt)} (${relative(d.s.chase.dueAt, now)})`
            : d.s.chase.state === "confirmed"
              ? `Next: book-on at ${formatTime(d.assignment.startsAt)}`
              : `Starts ${relative(new Date(d.assignment.startsAt), now)}`}
        </p>
        <Tries r={d} />
        {extra}
      </div>
      <div>{d.s.chase.state !== "confirmed" ? <ChaseUpForm onResult={setNotice} assignmentId={d.assignment.id} denied={denied} /> : null}</div>
    </li>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Chase-ups"
        description="Two hours before every shift, make sure the officer knows about it and will be on site. Officers can confirm in their own portal; ring the rest. Confirmed moves them to the book-on; no answer, try again — it turns red an hour before the start; can't make it takes them off and puts the shift on the cover list."
      />
      <DutyFlow counts={counts} current="chase" />
      <Notice result={notice} onClear={() => setNotice(null)} />

      <Section title="Chase now" count={toChase.length} meaning="Inside the two hours and not yet confirmed — the soonest first" tone={toChase.some((d) => d.s.chase.state === "urgent") ? "critical" : "serious"}>
        {toChase.map((d) => row(d))}
      </Section>

      {fromChase.length > 0 && (
        <Section title="Came off — cover needed" count={fromChase.length} meaning="Officers who cannot make a shift. Find cover from the rota" tone="critical">
          {fromChase.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
              <div className="text-[12px]">
                <p className="text-[13px] font-semibold">
                  {c.postName} <span className="font-normal" style={{ color: "var(--text-secondary)" }}>· {c.siteName}</span>
                </p>
                <p style={{ color: "var(--text-secondary)" }}>
                  {dayLabel(c.date)} {c.start}–{c.end} · {c.fromName} off, {OFF_REASON_LABELS[c.reason].toLowerCase()}
                  {c.note && ` — “${c.note}”`}
                </p>
              </div>
              <Link href={`/scheduling?week=${mondayOf(c.date)}&cover=${c.id}`} className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-semibold text-white" style={{ background: "var(--status-critical)" }}>
                Find cover
              </Link>
            </li>
          ))}
        </Section>
      )}

      <Section title="Coming up" count={comingUp.length} meaning="More than two hours away. Each opens for its chase-up at the time shown — or chase early">
        {comingUp.map((d) => row(d))}
      </Section>

      <Section title="Confirmed" count={confirmed.length} meaning="The officer knows and will be there. Next is the book-on" tone="good">
        {confirmed.map((d) => row(d))}
      </Section>
    </div>
  );
}
