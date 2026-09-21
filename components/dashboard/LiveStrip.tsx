"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { useNow } from "@/components/ui/useNow";
import { attendance, checkCallStatus } from "@/lib/core/ops";
import { formatShiftWindow } from "@/lib/format";
import {
  bookOnFor,
  checkCalls,
  contactAttempts,
  liveAssignments,
  personName,
  postById,
  siteNameForPost,
} from "@/lib/mock/ops";

/**
 * The operational summary on the dashboard.
 *
 * Deliberately only the exceptions: a dashboard that lists every post on shift
 * is the live board, and there is one of those. What belongs here is the answer
 * to "is anything wrong right now", with a route to the detail.
 */
export function LiveStrip() {
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

  const rows = liveAssignments(now).map((assignment) => {
    const post = postById(assignment.postId);
    const bookOn = bookOnFor(assignment.id);
    return {
      assignment,
      post,
      att: attendance(assignment, bookOn, now),
      call: checkCallStatus(assignment, post, checkCalls, bookOn, contactAttempts, now),
    };
  });

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
          {exceptions.map(({ assignment, post, att, call }) => {
            const attBad = att.state === "late" || att.state === "no_show";
            const status = attBad ? att : call;
            return (
              <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{personName(assignment.personId)}</p>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {siteNameForPost(post.id)} — {post.name} ·{" "}
                    <span className="tnum tabular-nums">
                      {formatShiftWindow(assignment.startsAt, assignment.endsAt)}
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
