"use client";

import { ActionButton } from "@/components/ui/ActionButton";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { ClauseRef, StatusPill, Tag } from "@/components/ui/StatusPill";
import { formatDate, formatShiftWindow } from "@/lib/format";
import { publishAssignment } from "@/lib/actions/operations";
import type { PublicationCheck, RotaRow } from "@/lib/db/queries";

/**
 * The rota, as a projection of assignments.
 *
 * Two things here are the design rather than the decoration:
 *
 *  1. **A draft cannot be published for someone who is not deployable.** The
 *     check runs on the server, using the same function the compliance register
 *     uses — a rota that enforced something slightly different would be worse
 *     than one that enforced nothing, because it would be trusted.
 *  2. **Shift changes keep their history.** An amendment records what changed,
 *     who changed it and why. An overwrite loses the argument about who agreed
 *     what, which is the argument that actually gets had.
 */
export function RotaBoard({
  rows,
  checks,
  publishDenied,
}: {
  rows: RotaRow[];
  checks: PublicationCheck[];
  publishDenied: string | null;
}) {
  const blocked = checks.filter((c) => !c.allowed);
  const amended = rows.filter((r) => r.assignment.amendments.length > 0);
  const drafts = rows.filter((r) => r.assignment.state === "draft");

  // Grouped by calendar day, which is how a rota is read.
  const byDay = rows.reduce<Record<string, RotaRow[]>>((acc, r) => {
    const key = new Date(r.assignment.startsAt).toDateString();
    (acc[key] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <PageHeader
        title="Scheduling"
        description="The next seven days. A shift cannot be published to someone who is not deployable, and every change keeps its reason and its author."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label="Shifts in the next 7 days"
          value={rows.length}
          detail={`${rows.length - drafts.length} published, ${drafts.length} draft`}
        />
        <StatTile
          label="Drafts blocked"
          value={blocked.length}
          detail="Cannot be published — compliance, not preference"
          severity={blocked.length > 0 ? "critical" : "good"}
          hero={blocked.length > 0}
        />
        <StatTile
          label="Shifts amended"
          value={amended.length}
          detail="Changed since publication, with a reason recorded"
          severity={amended.length > 0 ? "warning" : "good"}
        />
        <StatTile
          label="Posts covered"
          value={new Set(rows.map((r) => r.post.id)).size}
          detail="Distinct posts with cover in the window"
        />
      </div>

      <Card
        title="Publication check"
        subtitle="Run against every draft before it reaches the rota. This is the single choke point that makes compliance real rather than advisory."
      >
        {checks.length === 0 ? (
          <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
            No drafts waiting to be published.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {checks.map((c) => (
              <li key={c.assignmentId} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">
                      {c.personName} — {c.postName}
                    </p>
                    <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {c.siteName} · {formatDate(c.startsAt)} ·{" "}
                      {formatShiftWindow(c.startsAt, c.endsAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <StatusPill
                      severity={c.allowed ? "good" : "critical"}
                      label={c.allowed ? "Can be published" : "Blocked"}
                    />
                    <ActionButton
                      action={publishAssignment.bind(null, c.assignmentId)}
                      label="Publish"
                      variant={c.allowed ? "primary" : "quiet"}
                      denied={publishDenied}
                    />
                  </div>
                </div>
                {!c.allowed && (
                  <ul className="mt-1.5 space-y-1">
                    {c.deployability.blockers.map((b) => (
                      <li key={b.code} className="text-[12px]" style={{ color: "var(--status-critical)" }}>
                        {b.label}
                        {b.clause && (
                          <>
                            {" "}
                            <ClauseRef clause={b.clause} />
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {c.allowed && c.deployability.warnings.length > 0 && (
                  <p className="mt-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {c.deployability.warnings.map((w) => w.label).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="The rota"
        subtitle="Grouped by day. Posts, not sites — a post is what needs an officer and what the client pays for."
      >
        <div className="space-y-5">
          {Object.entries(byDay).map(([day, items]) => (
            <div key={day}>
              <p className="mb-1.5 text-[12px] font-semibold">
                {formatDate(items[0].assignment.startsAt)}
              </p>
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-[12px]">
                  <tbody>
                    {items.map((r) => (
                      <tr
                        key={r.assignment.id}
                        className="border-t align-top"
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        <td className="tnum px-1 py-2 tabular-nums whitespace-nowrap">
                          {formatShiftWindow(r.assignment.startsAt, r.assignment.endsAt)}
                        </td>
                        <td className="px-1 py-2">
                          <p className="font-medium">{r.post.name}</p>
                          <p style={{ color: "var(--text-secondary)" }}>{r.siteName}</p>
                        </td>
                        <td className="px-1 py-2">
                          <p>{r.personName}</p>
                          {r.pin && (
                            <p className="tnum tabular-nums" style={{ color: "var(--text-muted)" }}>
                              PIN {r.pin}
                            </p>
                          )}
                        </td>
                        <td className="px-1 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Tag>
                              {r.assignment.state === "draft"
                                ? "Draft"
                                : r.assignment.state === "amended"
                                  ? "Amended"
                                  : "Published"}
                            </Tag>
                            {r.post.loneWorking && <Tag>Lone working</Tag>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Shift changes"
        subtitle="Every amendment, with its reason and its author. Nothing is overwritten."
      >
        {amended.length === 0 ? (
          <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
            No shifts have been amended in this window.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {amended.flatMap((r) =>
              r.assignment.amendments.map((m, i) => (
                <li key={`${r.assignment.id}-${i}`} className="py-2.5">
                  <p className="text-[13px] font-medium">{m.change}</p>
                  <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {r.post.name} · {r.siteName}
                  </p>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Reason: </span>
                    {m.reason}
                  </p>
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {m.by} · {formatDate(m.at)}
                  </p>
                </li>
              )),
            )}
          </ul>
        )}
      </Card>

      <Card title="What is not built yet">
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          This is the rota as a projection of assignments, reading from the
          database, with the compliance block and the amendment history working.
          Availability, absence, shift patterns that repeat, clash detection and
          last-minute cover are the rest of release R2 — and they need the
          discovery session with Control first. Rostering is the part of this
          platform that looks simple in a specification and is not.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          One clash is already impossible rather than merely checked: the
          database refuses two overlapping shifts for the same person, so a
          double-booking cannot be written at all, by this screen or anything
          else.
        </p>
      </Card>
    </div>
  );
}
