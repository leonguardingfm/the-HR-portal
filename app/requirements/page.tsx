import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { requireSession } from "@/lib/auth/server";
import { canDo } from "@/lib/auth/permissions";
import { CLOSED_STATUSES, STAGE_LABELS, atRisk } from "@/lib/core/requirements";
import { getRequirements } from "@/lib/db/requirements";
import { formatDate, formatDays } from "@/lib/format";
import { CONTROL_LABELS } from "@/lib/labels";
import type { ControlId } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/**
 * Client requirements — Track A.
 *
 * Everything a client has asked us to cover: where each one is in the pool
 * check, the handover to HR, and allocation, with headcount counted from the
 * officers actually allocated.
 */
export default async function RequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const session = await requireSession();
  const { show } = await searchParams;
  const rows = await getRequirements();
  const now = new Date();

  const open = rows.filter((r) => !CLOSED_STATUSES.includes(r.status));
  const closed = rows.filter((r) => CLOSED_STATUSES.includes(r.status));
  const awaitingPool = open.filter((r) => r.status === "received" || r.status === "pool_check");
  const withHr = open.filter((r) => r.status === "released_to_sourcing");
  const risky = open.filter((r) => atRisk({ status: r.status, startDate: r.startDate, hc: r.hc }, now));
  const listed = show === "closed" ? closed : open;
  const canRaise = canDo(session.activeRole, "requirement.raise");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Client requirements"
        description="What clients have asked us to cover. Control checks the pool first; only what the pool cannot cover goes to HR, and that handover is timestamped."
        action={
          canRaise ? (
            <Link
              href="/requirements/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-[12px] font-medium text-white"
              style={{ background: "var(--series-1)" }}
            >
              <span aria-hidden>+</span> Raise requirement
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open" value={open.length} detail={`${open.reduce((n, r) => n + r.hc.remaining, 0)} places still to fill`} />
        <StatTile
          label="Awaiting the pool check"
          value={awaitingPool.length}
          detail="Control's, due within a working day"
          severity={awaitingPool.length > 0 ? "warning" : "good"}
        />
        <StatTile label="With HR for sourcing" value={withHr.length} detail="Released by Control" />
        <StatTile
          label="Starting within 7 days, not covered"
          value={risky.length}
          detail="These become uncovered posts"
          severity={risky.length > 0 ? "critical" : "good"}
          hero={risky.length > 0}
        />
      </div>

      <Card
        title={show === "closed" ? "Closed" : "Open requirements"}
        subtitle={show === "closed" ? "Covered internally, filled or cancelled." : "Soonest start first."}
        action={
          <nav aria-label="Show" className="flex gap-1">
            {[
              { href: "/requirements", label: `Open ${open.length}`, on: show !== "closed" },
              { href: "/requirements?show=closed", label: `Closed ${closed.length}`, on: show === "closed" },
            ].map((t) => (
              <Link
                key={t.href}
                href={t.href}
                aria-current={t.on ? "true" : undefined}
                className="rounded-md px-2.5 py-1 text-[12px]"
                style={{ background: t.on ? "var(--wash)" : "transparent", fontWeight: t.on ? 600 : 400 }}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        }
      >
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                {["Requirement", "Client and site", "Post", "From", "Headcount", "Stage", "Control"].map((h) => (
                  <th key={h} className="border-b px-5 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listed.map((r) => {
                const days = Math.ceil((r.startDate.getTime() - now.getTime()) / DAY);
                const risk = atRisk({ status: r.status, startDate: r.startDate, hc: r.hc }, now);
                return (
                  <tr key={r.id} className="group align-top hover:bg-[var(--wash)]">
                    <td className="border-b px-5 py-2.5">
                      <Link href={`/requirements/${r.id}`} className="tnum font-medium underline-offset-2 group-hover:underline">
                        {r.reference}
                      </Link>
                    </td>
                    <td className="border-b px-5 py-2.5">
                      {r.client.name}
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {r.site.name}
                      </p>
                    </td>
                    <td className="border-b px-5 py-2.5">
                      {r.post}
                      {r.shiftPattern && (
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {r.shiftPattern}
                        </p>
                      )}
                    </td>
                    <td className="border-b px-5 py-2.5">
                      <span className="tnum">{formatDate(r.startDate)}</span>
                      {risk ? (
                        <p className="mt-1">
                          <StatusPill severity="critical" label={days <= 0 ? "Started, not covered" : `${formatDays(days)} away`} />
                        </p>
                      ) : null}
                    </td>
                    <td className="border-b px-5 py-2.5">
                      <span className="tnum font-medium">
                        {r.hc.allocated} of {r.hc.required}
                      </span>
                      <div className="mt-1 h-1 w-16 overflow-hidden rounded-full" style={{ background: "var(--gridline)" }} aria-hidden>
                        <div className="h-full rounded-full" style={{ width: `${(r.hc.allocated / r.hc.required) * 100}%`, background: "var(--series-1)" }} />
                      </div>
                      {r.inRecruitment > 0 && (
                        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {r.inRecruitment} in recruitment
                        </p>
                      )}
                    </td>
                    <td className="border-b px-5 py-2.5">
                      <Tag>{STAGE_LABELS[r.status]}</Tag>
                    </td>
                    <td className="border-b px-5 py-2.5" style={{ color: "var(--text-secondary)" }}>
                      {r.controlTeam ? CONTROL_LABELS[r.controlTeam as ControlId].name : "—"}
                    </td>
                  </tr>
                );
              })}
              {listed.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                    Nothing here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ModuleOutline
        subtitle="Still to come. Raising, the pool check, release to HR and part-filled headcount are built above."
        items={[
          {
            label: "Export in the legacy Sourcing Sheet layout",
            detail: "One click, exact column order — so the spreadsheet can be retired without anyone losing the view they are used to.",
            phase: 2,
          },
        ]}
      />
    </div>
  );
}
