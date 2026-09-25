import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessPath } from "@/components/layout/nav";
import { ActionButton } from "@/components/ui/ActionButton";
import { Card } from "@/components/ui/Card";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import {
  CancelForm,
  PoolCheckForm,
  ReleaseForm,
  RemoveAllocationForm,
} from "@/components/requirements/RequirementForms";
import { allocateFromPool, allocateRecruited, markFilled } from "@/lib/actions/requirements";
import { requireSession } from "@/lib/auth/server";
import { canDo } from "@/lib/auth/permissions";
import { deniedReason } from "@/lib/auth/ui";
import { expirySeverity } from "@/lib/core/deployability";
import { CLOSED_STATUSES, STAGE_LABELS, atRisk, fillProblem } from "@/lib/core/requirements";
import { db } from "@/lib/db/client";
import { getOfficerPool } from "@/lib/db/officers";
import { getRequirement } from "@/lib/db/requirements";
import { formatDate, formatDays, formatTime } from "@/lib/format";
import { CONTROL_LABELS, RECRUITMENT_STAGE_LABELS } from "@/lib/labels";
import type { ControlId } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const READY = ["onboarding_complete", "deployed"];

/**
 * One client requirement, worked through Track A: the pool check first, then
 * the handover to HR for whatever the pool cannot cover, allocation from
 * either, and closing it once every officer is on site.
 */
export default async function RequirementPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const r = await getRequirement(id);
  if (!r) notFound();

  const now = new Date();
  const role = session.activeRole;
  const denied = deniedReason(role, "requirement.manage");
  const closed = CLOSED_STATUSES.includes(r.status);
  const released = Boolean(r.releasedToSourcingAt);
  const risk = atRisk({ status: r.status, startDate: r.startDate, hc: r.hc }, now);

  // The pool: officers who can be deployed today, not already on this one.
  const allocatedHere = new Set(r.live.map((a) => a.personId));
  const pool = closed || r.hc.remaining === 0 ? [] : (await getOfficerPool(now)).filter((o) => o.deployability.deployable && !allocatedHere.has(o.personId));
  const elsewhere = await db.requirementAllocation.findMany({
    where: {
      releasedAt: null,
      personId: { in: pool.map((o) => o.personId) },
      requirement: { id: { not: r.id }, status: { in: ["received", "pool_check", "released_to_sourcing", "allocated", "covered_internally"] } },
    },
    include: { requirement: { select: { reference: true, startDate: true } } },
  });
  const alsoOn = (personId: string) => elsewhere.filter((a) => a.personId === personId);
  const sameTeamFirst = [...pool].sort(
    (a, b) => Number(b.controlTeam === r.controlTeam) - Number(a.controlTeam === r.controlTeam) || a.name.localeCompare(b.name),
  );

  const handoverDays =
    r.releasedToSourcingAt ? Math.round(((r.releasedToSourcingAt.getTime() - r.receivedAt.getTime()) / DAY) * 10) / 10 : null;
  const steps = [
    { label: "A1 Received", at: r.receivedAt, done: true },
    { label: "A2 Pool check", at: r.poolCheckedAt, done: Boolean(r.poolCheckedAt) || r.live.length > 0 },
    released
      ? { label: "A3b Released to HR", at: r.releasedToSourcingAt, done: true }
      : { label: "A3a Covered internally", at: r.status === "covered_internally" ? r.closedAt : null, done: r.status === "covered_internally" },
    { label: "A4 Allocated", at: null, done: r.hc.remaining === 0 },
    { label: "A5 Filled", at: r.status === "filled" ? r.closedAt : null, done: r.status === "filled" },
  ];
  const fill = fillProblem({ status: r.status, hc: r.hc });
  const canSeeCandidates = canAccessPath(role, "/candidates");

  return (
    <div className="space-y-5">
      <nav className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/requirements" className="hover:underline">
          Client requirements
        </Link>{" "}
        / {r.reference}
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">
            <span className="tnum">{r.reference}</span> — {r.client.name}, {r.site.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
            <Tag>{STAGE_LABELS[r.status]}</Tag>
            <span className="tnum font-medium" style={{ color: "var(--text-primary)" }}>
              {r.hc.allocated} of {r.hc.required} allocated
            </span>
            · {r.post} · from {formatDate(r.startDate)}
            {risk && <StatusPill severity="critical" label="Starting soon, not covered" />}
          </p>
          {r.status === "cancelled" && r.cancelledReason && (
            <p className="mt-1 text-[13px]" style={{ color: "var(--critical-text)" }}>
              Cancelled: {r.cancelledReason}
            </p>
          )}
        </div>
      </header>

      <Card>
        <ol className="flex flex-wrap gap-x-6 gap-y-3 pt-5">
          {steps.map((s) => (
            <li key={s.label} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-semibold"
                style={s.done ? { background: "var(--series-1)", color: "#fff" } : { boxShadow: "0 0 0 1.5px var(--baseline) inset" }}
              >
                {s.done ? "✓" : ""}
              </span>
              <div>
                <p className="text-[12px] font-medium">{s.label}</p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {s.at ? `${formatDate(s.at)} ${formatTime(s.at)}` : s.done ? "Done" : "—"}
                </p>
              </div>
            </li>
          ))}
        </ol>
        {handoverDays !== null && (
          <p className="mt-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
            The pool check took <strong>{handoverDays} day{handoverDays === 1 ? "" : "s"}</strong> before the handover to HR — the figure that says whether a delay sat with Control or with HR.
          </p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <Card
            title="Allocated officers"
            subtitle={r.hc.allocated === 0 ? "Nobody allocated yet." : `${r.hc.fromPool} from the pool, ${r.hc.recruited} recruited through HR.`}
          >
            {r.allocations.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                {r.hc.remaining} place{r.hc.remaining === 1 ? "" : "s"} to fill.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                {r.allocations.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 first:pt-0" style={{ opacity: a.releasedAt ? 0.55 : 1 }}>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium" style={{ textDecoration: a.releasedAt ? "line-through" : undefined }}>
                        {a.person.licences[0]?.nameOnBadge ?? a.person.fullName}
                        {a.person.employment?.pin && (
                          <span className="tnum ml-1.5 text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>
                            PIN {a.person.employment.pin}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {a.source === "pool" ? "From the pool" : "Recruited for this requirement"} · allocated by {r.names.get(a.allocatedById) ?? "—"}{" "}
                        {formatDate(a.allocatedAt)}
                        {a.releasedAt && ` · taken off ${formatDate(a.releasedAt)}: ${a.releasedReason}`}
                      </p>
                    </div>
                    {/* Covered internally still allows it: an officer who drops out
                        after cover was arranged reopens the requirement. */}
                    {!a.releasedAt && r.status !== "filled" && r.status !== "cancelled" && !denied && (
                      <RemoveAllocationForm allocationId={a.id} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {!closed && r.hc.remaining > 0 && (
            <Card
              title="Pool check"
              subtitle="Officers who can be deployed today, your Control team first. Confirm availability with them before allocating — the platform does not hold availability yet."
            >
              {sameTeamFirst.length === 0 ? (
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  Nobody in the pool can be deployed today.
                </p>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                  {sameTeamFirst.map((o) => (
                    <li key={o.personId} className="flex flex-wrap items-start justify-between gap-3 py-2.5 first:pt-0">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium">
                          {o.name}
                          {o.pin && (
                            <span className="tnum ml-1.5 text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>
                              PIN {o.pin}
                            </span>
                          )}
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {o.controlTeam ? CONTROL_LABELS[o.controlTeam].name : "No Control team"}
                          {o.licence && ` · licence to ${formatDate(o.licence.expiresAt)}`}
                          {o.onShiftNow ? ` · on shift at ${o.onShiftNow.site}` : o.nextShift ? ` · next shift ${formatDate(o.nextShift.startsAt)}` : " · nothing rostered"}
                        </p>
                        {alsoOn(o.personId).map((a) => (
                          <p key={a.id} className="text-[11px]" style={{ color: "var(--serious-text)" }}>
                            Also allocated to {a.requirement.reference}, from {formatDate(a.requirement.startDate)}
                          </p>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        {o.licence && (
                          <StatusPill severity={expirySeverity(o.licence.expiresAt.toISOString(), now)} label="SIA" />
                        )}
                        <ActionButton
                          action={allocateFromPool}
                          label="Allocate"
                          fields={{ requirementId: r.id, personId: o.personId }}
                          denied={denied}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!denied && (
                <div className="mt-4 space-y-4 border-t pt-4" style={{ borderColor: "var(--hairline)" }}>
                  <div>
                    <p className="mb-1.5 text-[12px] font-semibold">What the pool check found</p>
                    <PoolCheckForm requirementId={r.id} current={r.poolCheckNote} />
                  </div>
                  {!released && (
                    <div>
                      <p className="mb-1.5 text-[12px] font-semibold">Release to HR (A3b)</p>
                      <p className="mb-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        Hands the {r.hc.remaining} place{r.hc.remaining === 1 ? "" : "s"} the pool cannot cover to Recruitment, timestamped. Recruitment gets a sourcing task.
                      </p>
                      <ReleaseForm requirementId={r.id} remaining={r.hc.remaining} />
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {released && (
            <Card
              title="With HR"
              subtitle={`Released ${formatDate(r.releasedToSourcingAt!)} — ${r.releaseNote ?? "no note"}`}
              action={
                canDo(role, "candidacy.create") && !closed ? (
                  <Link href={`/candidates/new?requirement=${r.id}`} className="text-[12px]" style={{ color: "var(--accent-text)" }}>
                    + Add a candidate for it
                  </Link>
                ) : null
              }
            >
              {r.candidacies.length === 0 ? (
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  No candidates put forward yet.
                </p>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                  {r.candidacies.map((c) => {
                    const ready = READY.includes(c.stage) && !allocatedHere.has(c.personId);
                    return (
                      <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5 first:pt-0">
                        <div className="min-w-0">
                          {canSeeCandidates ? (
                            <Link href={`/candidates/${c.id}`} className="text-[13px] font-medium hover:underline">
                              {c.person.fullName}
                            </Link>
                          ) : (
                            <p className="text-[13px] font-medium">{c.person.fullName}</p>
                          )}
                          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                            {RECRUITMENT_STAGE_LABELS[c.stage]} · {formatDays(Math.floor((now.getTime() - c.stageSince.getTime()) / DAY))} in stage
                          </p>
                        </div>
                        {ready && !closed && r.hc.remaining > 0 && (
                          <ActionButton
                            action={allocateRecruited}
                            label="Allocate"
                            fields={{ requirementId: r.id, candidacyId: c.id }}
                            denied={denied}
                            variant="primary"
                          />
                        )}
                        {allocatedHere.has(c.personId) && <StatusPill severity="good" label="Allocated" />}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
                A candidate becomes allocatable once their onboarding is complete (A4).
              </p>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="Details">
            <dl className="space-y-3 text-[13px]">
              {[
                ["Post", r.post],
                ["Shift pattern", r.shiftPattern],
                ["Cover from", formatDate(r.startDate)],
                ["Control team", r.controlTeam ? CONTROL_LABELS[r.controlTeam as ControlId].name : null],
                ["Screening period", `${r.client.screeningPeriodYears} years (client contract)`],
                ["Client interview", r.client.requiresAdditionalInterview ? "Yes — the client interviews too" : "No"],
                ["Raised by", r.ownerUserId ? r.names.get(r.ownerUserId) : null],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {k}
                  </dt>
                  <dd>{v ?? <span style={{ color: "var(--text-muted)" }}>—</span>}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {!closed && !denied && (
            <Card title="Close it">
              <div className="space-y-3">
                <div>
                  <ActionButton action={markFilled} label="Mark filled (A5)" fields={{ requirementId: r.id }} denied={fill} variant="primary" />
                  <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {fill ?? "Every place is allocated. Mark it filled once the officers are on site."}
                  </p>
                </div>
                <CancelForm requirementId={r.id} />
              </div>
            </Card>
          )}

          <Card title="History" subtitle="Everything done on this requirement, newest first.">
            {r.events.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                Nothing recorded yet.
              </p>
            ) : (
              <ol className="space-y-2.5">
                {r.events.map((e) => (
                  <li key={e.id} className="flex gap-3 text-[12px]">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full" style={{ background: "var(--series-1)" }} />
                    <div className="min-w-0">
                      <p>{e.detail ?? e.type}</p>
                      <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {formatDate(e.at)} {formatTime(e.at)}
                        {e.actor ? ` · ${e.actor.displayName}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
