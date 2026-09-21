"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { formatShiftWindow, formatTime } from "@/lib/format";
import {
  CHANNEL_EVIDENCE,
  ESCALATION_LADDER,
  OPS_RULES,
  attendance,
  checkCallStatus,
  escalationAction,
} from "@/lib/core/ops";
import {
  bookOnFor,
  checkCalls,
  incidents,
  liveAssignments,
  personName,
  personPin,
  postById,
  siteNameForPost,
} from "@/lib/mock/ops";
import type { Severity } from "@/lib/types";

/**
 * The board Control watches.
 *
 * Every post whose shift is on now or starts within six hours, with two
 * independent questions answered per row: did the officer turn up, and have we
 * heard from them since. They are separate columns because they fail
 * separately — an officer can book on and then go quiet.
 *
 * The rows are ordered by what needs doing rather than by site, so the top of
 * the board is the work. A board sorted alphabetically is a report.
 */

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  serious: 1,
  warning: 2,
  good: 3,
  neutral: 4,
};

export function LiveBoard() {
  // Gated on mount so the clock is the browser's, not the build's.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    return (
      <div>
        <PageHeader title="Live board" description="Loading the current shift picture…" />
      </div>
    );
  }

  const rows = liveAssignments(now)
    .map((assignment) => {
      const post = postById(assignment.postId);
      const bookOn = bookOnFor(assignment.id);
      const att = attendance(assignment, bookOn, now);
      const call = checkCallStatus(assignment, post, checkCalls, bookOn, now);
      const worst = SEVERITY_RANK[att.severity] <= SEVERITY_RANK[call.severity] ? att.severity : call.severity;
      return { assignment, post, bookOn, att, call, worst };
    })
    .sort((a, b) => {
      const bySeverity = SEVERITY_RANK[a.worst] - SEVERITY_RANK[b.worst];
      if (bySeverity !== 0) return bySeverity;
      return new Date(a.assignment.startsAt).getTime() - new Date(b.assignment.startsAt).getTime();
    });

  const onPost = rows.filter((r) => r.att.state === "on_post").length;
  const awaiting = rows.filter((r) => r.att.state === "awaiting_book_on").length;
  const attendanceProblems = rows.filter((r) => r.att.state === "late" || r.att.state === "no_show");
  const callProblems = rows.filter((r) => r.call.escalation > 0);
  const welfare = rows.filter((r) => r.call.state === "welfare");
  const openIncidents = incidents.filter((i) => !i.clientNotified && i.severity !== "log_only");

  /** Anything with a named next action, worst first. This is the work. */
  const actions = [
    ...attendanceProblems.map((r) => ({
      key: `att-${r.assignment.id}`,
      severity: r.att.severity,
      what: r.att.state === "no_show" ? "No show" : "Late book-on",
      who: personName(r.assignment.personId),
      where: `${siteNameForPost(r.post.id)} — ${r.post.name}`,
      action:
        r.att.state === "no_show"
          ? "Ring the officer, then find cover. Client notification if cover will be late."
          : "Ring the officer to confirm they are on their way.",
      step: r.att.state === "no_show" ? 2 : 1,
    })),
    ...callProblems.map((r) => ({
      key: `call-${r.assignment.id}`,
      severity: r.call.severity,
      what:
        r.call.state === "welfare"
          ? "No contact — welfare check"
          : r.call.state === "no_contact"
            ? "Cannot reach the officer"
            : "Check call overdue",
      who: personName(r.assignment.personId),
      where: `${siteNameForPost(r.post.id)} — ${r.post.name}${r.post.loneWorking ? " (lone working)" : ""}`,
      action: escalationAction(r.call.escalation) ?? "Try the officer.",
      step: r.call.escalation,
    })),
    ...openIncidents.map((i) => ({
      key: `inc-${i.id}`,
      severity: "warning" as Severity,
      what: "Incident awaiting client notification",
      who: i.reportedBy,
      where: i.summary,
      action: "Notify the client contact and record the time it was done.",
      step: 1,
    })),
  ].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Live board"
        description="Every post on now or starting within six hours. Turning up and staying in contact are tracked separately, because they fail separately."
        action={
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            As at {formatTime(now.toISOString())} · refreshes every 30s
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Officers on post" value={onPost} detail={`of ${rows.length} shifts in the window`} />
        <StatTile label="Awaiting book-on" value={awaiting} detail={`Grace period ${OPS_RULES.bookOnGraceMinutes} min`} severity={awaiting > 0 ? "warning" : "good"} />
        <StatTile
          label="Late or no show"
          value={attendanceProblems.length}
          detail={`No show after ${OPS_RULES.bookOnNoShowMinutes} min`}
          severity={attendanceProblems.some((r) => r.att.state === "no_show") ? "critical" : attendanceProblems.length > 0 ? "serious" : "good"}
          hero={attendanceProblems.length > 0}
        />
        <StatTile
          label="Check calls outstanding"
          value={callProblems.length}
          detail={
            welfare.length > 0
              ? `${welfare.length} at the welfare step — attend site`
              : `Hourly; escalation starts at ${OPS_RULES.checkCallIntervalMinutes} min`
          }
          severity={callProblems.some((r) => r.call.escalation >= 2) ? "critical" : callProblems.length > 0 ? "serious" : "good"}
        />
        <StatTile label="Incidents open" value={openIncidents.length} detail="Awaiting client notification" severity={openIncidents.length > 0 ? "warning" : "good"} />
      </div>

      <Card
        title="Needs a call now"
        subtitle="Ordered by severity, with the next step named. An overdue item with no named next person becomes nobody's job."
      >
        {actions.length === 0 ? (
          <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Nothing outstanding. Every post on now has booked on and is in contact.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {actions.map((a) => (
              <li key={a.key} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">
                    {a.what} — {a.who}
                  </p>
                  <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {a.where}
                  </p>
                  <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--text-primary)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Step {a.step}: </span>
                    {a.action}
                  </p>
                </div>
                <StatusPill severity={a.severity} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="All posts in the window"
        subtitle="Attendance and contact as two separate columns. Evidence shows how the record was made, which is what decides what it is worth."
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-left">
                <th className="px-1 pb-2 font-medium">Post</th>
                <th className="px-1 pb-2 font-medium">Officer</th>
                <th className="px-1 pb-2 font-medium">Shift</th>
                <th className="px-1 pb-2 font-medium">Attendance</th>
                <th className="px-1 pb-2 font-medium">Check call</th>
                <th className="px-1 pb-2 font-medium">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ assignment, post, bookOn, att, call }) => {
                const pin = personPin(assignment.personId);
                const evidence = bookOn ? CHANNEL_EVIDENCE[bookOn.channel] : null;
                return (
                  <tr key={assignment.id} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
                    <td className="px-1 py-2.5">
                      <p className="font-medium">{post.name}</p>
                      <p style={{ color: "var(--text-secondary)" }}>{siteNameForPost(post.id)}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {post.loneWorking && <Tag>Lone working</Tag>}
                        {assignment.state === "amended" && <Tag>Amended</Tag>}
                      </div>
                    </td>
                    <td className="px-1 py-2.5">
                      <p className="font-medium">{personName(assignment.personId)}</p>
                      {pin && (
                        <p className="tnum tabular-nums" style={{ color: "var(--text-muted)" }}>
                          PIN {pin}
                        </p>
                      )}
                    </td>
                    <td className="tnum px-1 py-2.5 tabular-nums whitespace-nowrap">
                      {formatShiftWindow(assignment.startsAt, assignment.endsAt)}
                    </td>
                    <td className="px-1 py-2.5">
                      <StatusPill severity={att.severity} label={att.label} />
                    </td>
                    <td className="px-1 py-2.5">
                      <StatusPill severity={call.severity} label={call.label} />
                    </td>
                    <td className="px-1 py-2.5">
                      {evidence ? (
                        <>
                          <p>{evidence.label}</p>
                          <p
                            style={{
                              color:
                                evidence.strength === "weak"
                                  ? "var(--status-warning)"
                                  : "var(--text-muted)",
                            }}
                          >
                            {evidence.strength} evidence
                          </p>
                        </>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Incidents" subtitle="Reported from site. Severity decides whether the client is notified and how fast.">
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {incidents.map((i) => (
              <li key={i.id} className="py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-medium">{i.reportedBy}</p>
                  <StatusPill
                    severity={i.severity === "serious" ? "critical" : i.severity === "notable" ? "warning" : "neutral"}
                    label={i.severity === "log_only" ? "Log only" : i.severity === "notable" ? "Notable" : "Serious"}
                  />
                </div>
                <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                  {i.summary}
                </p>
                <p className="mt-1 text-[11px]" style={{ color: i.clientNotified ? "var(--text-muted)" : "var(--status-warning)" }}>
                  {formatTime(i.at)} · {i.clientNotified ? "Client notified" : "Client not yet notified"}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="The escalation ladder"
          subtitle="Proposed. A missed call on a lone-working post is a welfare question before it is an administrative one."
        >
          <ol className="space-y-2.5">
            {ESCALATION_LADDER.map((l) => (
              <li key={l.step} className="flex gap-3">
                <span
                  className="tnum mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
                  style={{ background: "var(--wash)", color: "var(--text-primary)" }}
                >
                  {l.step}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px]">{l.action}</p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {l.owner}
                    {l.afterMinutes > 0
                      ? ` · ${l.afterMinutes} min past the hour, still no contact`
                      : " · as soon as the hour passes"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            The hour and the three steps are the confirmed process. The two
            intervals between the steps are <strong>assumed</strong> — the
            process says &ldquo;further measures&rdquo; without naming a time,
            and the one worth agreeing deliberately is how long without contact
            before someone sets off for site. All of it lives in
            lib/core/ops.ts and becomes an Admin setting, so changing it is not
            a release.
          </p>
        </Card>
      </div>
    </div>
  );
}
