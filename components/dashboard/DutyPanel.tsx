"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { CallTimeline, DutyFlow, relative, useDuty, type DutyRow } from "@/components/duty/DutyShared";
import { escalationAction } from "@/lib/core/ops";
import type { LiveRow } from "@/lib/db/queries";
import { formatTime } from "@/lib/format";
import type { Severity } from "@/lib/types";

const RANK: Record<Severity, number> = { critical: 0, serious: 1, warning: 2, good: 3, neutral: 4 };

/**
 * The duty checks on the dashboard: the flow, and one list of what needs doing
 * now across all three — unconfirmed chase-ups, officers not on site, missed
 * check calls — worst first, each with its next step and a way to it.
 */
export function DutyPanel({ rows }: { rows: LiveRow[] }) {
  const { now, duty, counts } = useDuty(rows);
  if (!now || !counts) {
    return (
      <Card title="Duty checks" subtitle="Reading the shifts on now and ahead…">
        <p className="py-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Loading.
        </p>
      </Card>
    );
  }

  type Item = { d: DutyRow; severity: Severity; what: string; next: string; href: string };
  const items: Item[] = [];
  for (const d of duty) {
    if (d.s.stage === "alert") {
      items.push({ d, severity: d.s.call.severity, what: d.s.call.label, next: escalationAction(d.s.call.escalation) ?? "", href: "/duty/check-calls" });
    } else if (d.s.stage === "no_show" || d.s.stage === "late") {
      items.push({ d, severity: d.s.attendance.severity, what: d.s.attendance.label, next: d.s.stage === "no_show" ? "Ring them; if they are not coming, take them off and find cover" : "Ring them to confirm they are on the way", href: "/duty/book-ons" });
    } else if (["urgent", "no_answer", "due"].includes(d.s.chase.state) && new Date(d.assignment.startsAt) > now) {
      items.push({ d, severity: d.s.chase.severity, what: `Chase-up: ${d.s.chase.label.toLowerCase()}`, next: `Starts ${relative(new Date(d.assignment.startsAt), now)} — confirm they will be there`, href: "/duty/chase-ups" });
    } else if (d.s.stage === "awaiting_book_on" && new Date(d.assignment.startsAt) <= now) {
      items.push({ d, severity: "warning", what: d.s.attendance.label, next: "Book them on when they ring in from site", href: "/duty/book-ons" });
    }
  }
  items.sort((a, b) => RANK[a.severity] - RANK[b.severity]);

  const onDuty = duty.filter((d) => d.s.schedule && d.s.stage === "on_duty").slice(0, 4);

  return (
    <Card
      title="Duty checks"
      subtitle="Duty confirmed → chase-up two hours before → book-on at site → hourly check calls → alert when one is missed."
      action={
        <Link href="/live" className="text-[12px] underline" style={{ color: "var(--text-secondary)" }}>
          Live board
        </Link>
      }
    >
      <div className="space-y-4">
        <DutyFlow counts={counts} />
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          Done by the officers themselves, in their portal: <strong style={{ color: "var(--text-primary)" }}>{counts.bookOn.byOfficer} of {counts.bookOn.bookedOn}</strong> book-ons ·{" "}
          <strong style={{ color: "var(--text-primary)" }}>{counts.calls.byOfficer} of {counts.calls.made}</strong> check calls. The rest were recorded by Control when the officer rang in.
        </p>

        <div>
          <h3 className="text-[12px] font-semibold">Needs action now · {items.length}</h3>
          {items.length === 0 ? (
            <p className="py-3 text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Every duty is in hand: chase-ups confirmed, everyone due on site booked on, and every call on time.
            </p>
          ) : (
            <ul className="mt-2 divide-y rounded-md border" style={{ borderColor: "var(--hairline)" }}>
              {items.slice(0, 8).map((it) => (
                <li key={it.d.assignment.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5" style={{ borderColor: "var(--hairline)" }}>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">
                      {it.d.personName}{" "}
                      <span className="font-normal" style={{ color: "var(--text-secondary)" }}>
                        · {it.d.post.name}, {it.d.siteName} · {formatTime(it.d.assignment.startsAt)}–{formatTime(it.d.assignment.endsAt)}
                      </span>
                    </p>
                    <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {it.next}
                    </p>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <StatusPill severity={it.severity} label={it.what} wrap />
                    <Link href={it.href} className="inline-flex h-7 items-center rounded-md border px-2.5 text-[12px] font-medium" style={{ borderColor: "var(--hairline)" }}>
                      Open
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {items.length > 8 && (
            <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
              And {items.length - 8} more on the duty pages.
            </p>
          )}
        </div>

        {onDuty.length > 0 && (
          <div>
            <h3 className="text-[12px] font-semibold">Check calls on duty now</h3>
            <ul className="mt-2 space-y-2">
              {onDuty.map((d) => (
                <li key={d.assignment.id} className="grid gap-1 md:grid-cols-[14rem_1fr] md:items-center">
                  <p className="text-[12px]">
                    <span className="font-semibold">{d.personName}</span>
                    <span style={{ color: "var(--text-secondary)" }}> · {d.post.name}</span>
                  </p>
                  <CallTimeline slots={d.s.schedule!.slots} now={now} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
