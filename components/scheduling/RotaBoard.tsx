"use client";

import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { ClauseRef, StatusPill, Tag } from "@/components/ui/StatusPill";
import { useNow } from "@/components/ui/useNow";
import { canPublishAssignment } from "@/lib/core/deployability";
import { formatDate, formatShiftWindow } from "@/lib/format";
import {
  assignments,
  deployabilityFor,
  personName,
  personPin,
  postById,
  siteNameForPost,
} from "@/lib/mock/ops";

/**
 * The rota, as a projection of assignments.
 *
 * Two things here are the design rather than the decoration:
 *
 *  1. **A draft cannot be published for someone who is not deployable.** The
 *     check is the same function the compliance register uses, deliberately —
 *     a rota that enforced something slightly different would be worse than
 *     one that enforced nothing, because it would be trusted.
 *  2. **Shift changes keep their history.** An amendment records what changed,
 *     who changed it and why. "Multiple shift changes" in the brief means the
 *     history has to survive, and an overwrite loses the argument about who
 *     agreed what.
 */
export function RotaBoard() {
  const now = useNow();

  if (!now) {
    return <PageHeader title="Scheduling" description="Loading the rota…" />;
  }

  const horizon = now.getTime() + 7 * 86_400_000;
  const upcoming = assignments
    .filter((a) => a.state !== "cancelled")
    .filter((a) => new Date(a.endsAt).getTime() > now.getTime() && new Date(a.startsAt).getTime() < horizon)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const drafts = upcoming
    .filter((a) => a.state === "draft")
    .map((a) => {
      const post = postById(a.postId);
      const d = deployabilityFor(a.personId, post.requiresSiaLicence, now);
      return { assignment: a, post, deployability: d, check: canPublishAssignment(d) };
    });

  const blockedDrafts = drafts.filter((d) => !d.check.allowed);
  const amended = upcoming.filter((a) => a.amendments.length > 0);

  // Grouped by calendar day, which is how a rota is read.
  const byDay = upcoming.reduce<Record<string, typeof upcoming>>((acc, a) => {
    const key = new Date(a.startsAt).toDateString();
    (acc[key] ??= []).push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <PageHeader
        title="Scheduling"
        description="The next seven days. A shift cannot be published to someone who is not deployable, and every change keeps its reason and its author."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Shifts in the next 7 days" value={upcoming.length} detail={`${upcoming.length - drafts.length} published, ${drafts.length} draft`} />
        <StatTile
          label="Drafts blocked"
          value={blockedDrafts.length}
          detail="Cannot be published — compliance, not preference"
          severity={blockedDrafts.length > 0 ? "critical" : "good"}
          hero={blockedDrafts.length > 0}
        />
        <StatTile label="Shifts amended" value={amended.length} detail="Changed since publication, with a reason recorded" severity={amended.length > 0 ? "warning" : "good"} />
        <StatTile label="Posts covered" value={new Set(upcoming.map((a) => a.postId)).size} detail="Distinct posts with cover in the window" />
      </div>

      <Card
        title="Publication check"
        subtitle="Run against every draft before it reaches the rota. This is the single choke point that makes compliance real rather than advisory."
      >
        {drafts.length === 0 ? (
          <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
            No drafts waiting to be published.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {drafts.map(({ assignment, post, deployability, check }) => (
              <li key={assignment.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">
                      {personName(assignment.personId)} — {post.name}
                    </p>
                    <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {siteNameForPost(post.id)} · {formatDate(assignment.startsAt)} ·{" "}
                      {formatShiftWindow(assignment.startsAt, assignment.endsAt)}
                    </p>
                  </div>
                  <StatusPill
                    severity={check.allowed ? "good" : "critical"}
                    label={check.allowed ? "Can be published" : "Blocked"}
                  />
                </div>
                {!check.allowed && (
                  <ul className="mt-1.5 space-y-1">
                    {deployability.blockers.map((b) => (
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
                {check.allowed && deployability.warnings.length > 0 && (
                  <p className="mt-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {deployability.warnings.map((w) => w.label).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="The rota" subtitle="Grouped by day. Posts, not sites — a post is what needs an officer and what the client pays for.">
        <div className="space-y-5">
          {Object.entries(byDay).map(([day, items]) => (
            <div key={day}>
              <p className="mb-1.5 text-[12px] font-semibold">{formatDate(items[0].startsAt)}</p>
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-[12px]">
                  <tbody>
                    {items.map((a) => {
                      const post = postById(a.postId);
                      const pin = personPin(a.personId);
                      return (
                        <tr key={a.id} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
                          <td className="tnum px-1 py-2 tabular-nums whitespace-nowrap">
                            {formatShiftWindow(a.startsAt, a.endsAt)}
                          </td>
                          <td className="px-1 py-2">
                            <p className="font-medium">{post.name}</p>
                            <p style={{ color: "var(--text-secondary)" }}>{siteNameForPost(post.id)}</p>
                          </td>
                          <td className="px-1 py-2">
                            <p>{personName(a.personId)}</p>
                            {pin && (
                              <p className="tnum tabular-nums" style={{ color: "var(--text-muted)" }}>
                                PIN {pin}
                              </p>
                            )}
                          </td>
                          <td className="px-1 py-2">
                            <div className="flex flex-wrap gap-1">
                              <Tag>
                                {a.state === "draft"
                                  ? "Draft"
                                  : a.state === "amended"
                                    ? "Amended"
                                    : "Published"}
                              </Tag>
                              {post.loneWorking && <Tag>Lone working</Tag>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
            {amended.flatMap((a) =>
              a.amendments.map((m, i) => (
                <li key={`${a.id}-${i}`} className="py-2.5">
                  <p className="text-[13px] font-medium">{m.change}</p>
                  <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {postById(a.postId).name} · {siteNameForPost(a.postId)}
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
          This is the rota as a projection of assignments, with the compliance
          block and the amendment history working. Availability, absence, shift
          patterns that repeat, clash detection and last-minute cover are the
          rest of release R2, and they need a discovery session with Control
          first. Rostering is the part of this platform that looks simple in a
          specification and is not — it is where Control&rsquo;s day happens,
          and it should be estimated after that conversation rather than before.
        </p>
      </Card>
    </div>
  );
}
