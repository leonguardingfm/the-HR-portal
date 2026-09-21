"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { useNow } from "@/components/ui/useNow";
import { attendance, checkCallStatus } from "@/lib/core/ops";
import { formatShiftWindow } from "@/lib/format";
import type { LiveRow } from "@/lib/db/queries";

/**
 * The operational summary on the dashboard.
 *
 * Deliberately only the exceptions: a dashboard that lists every post on shift
 * is the live board, and there is one of those. What belongs here is the answer
 * to "is anything wrong right now", with a route to the detail.
 */
export function LiveStrip({ rows: input }: { rows: LiveRow[] }) {
  const now = useNow(30_000);

  if (!now) {
    return (
      <Card title="On shift now" subtitle="Reading the current shift picture…">
        <p className="py-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Loading.
        </p>
      </Card>
    );
  }

  const rows = input.map((r) => ({
    ...r,
    att: attendance(r.assignment, r.bookOn, now),
    call: checkCallStatus(r.assignment, r.post, r.calls, r.bookOn, r.attempts, now),
  }));

  const onPost = rows.filter((r) => r.att.state === "on_post").length;
  const exceptions = rows.filter(
    (r) => r.att.state === "late" || r.att.state === "no_show" || r.call.escalation > 0,
  );

  return (
    <Card
      title="On shift now"
      subtitle="Exceptions only. The full picture is on the live board."
      action={
        <div className="flex items-center gap-2">
          <Tag>
            <span className="tnum tabular-nums">{onPost}</span> on post
          </Tag>
          <Link href="/live" className="text-[12px] underline" style={{ color: "var(--text-secondary)" }}>
            Live board
          </Link>
        </div>
      }
    >
      {exceptions.length === 0 ? (
        <p className="py-4 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Every post on now has booked on and is in contact.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {exceptions.map((r) => {
            const attBad = r.att.state === "late" || r.att.state === "no_show";
            const status = attBad ? r.att : r.call;
            return (
              <li key={r.assignment.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{r.personName}</p>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {r.siteName} — {r.post.name} ·{" "}
                    <span className="tnum tabular-nums">
                      {formatShiftWindow(r.assignment.startsAt, r.assignment.endsAt)}
                    </span>
                  </p>
                </div>
                <StatusPill severity={status.severity} label={status.label} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
