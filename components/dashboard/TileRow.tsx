import { StatTile } from "@/components/ui/StatTile";
import { clockState } from "@/lib/bs7858";
import { daysSince } from "@/lib/format";
import {
  candidates,
  complianceRate,
  filesOnClock,
  openRequirements,
  overdueTasks,
  requirements,
} from "@/lib/mock/data";

/**
 * The tile row.
 *
 * Exactly one hero figure per view, and it is the breach-risk count — the only
 * number on the page with a regulatory consequence attached.
 */
export function TileRow() {
  const open = openRequirements();
  const officersStillNeeded = open.reduce(
    (sum, r) => sum + (r.headcountRequired - r.headcountAllocated),
    0,
  );
  const pastStartDate = open.filter((r) => daysSince(r.startDate) > 0).length;

  const onClock = filesOnClock();
  const atRisk = onClock.filter((f) => {
    const clock = clockState(f);
    return clock !== null && clock.fractionUsed >= 0.75;
  });
  const critical = onClock.filter((f) => {
    const clock = clockState(f);
    return clock !== null && clock.fractionUsed >= 0.9;
  });

  const inPipeline = candidates.filter(
    (c) =>
      c.stage !== "confirmed_employment" &&
      c.stage !== "withdrawn" &&
      c.stage !== "onboarding_complete",
  ).length;

  const overdue = overdueTasks().length;
  const compliance = Math.round(
    (complianceRate.completedInPeriod / complianceRate.due) * 100,
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <div className="sm:col-span-2 xl:col-span-2">
        <StatTile
          hero
          label="Files at risk of breaching the screening deadline"
          value={atRisk.length}
          detail={`${critical.length} past 90% of the allowed period · clause 7.6`}
          severity={critical.length > 0 ? "critical" : atRisk.length > 0 ? "serious" : "good"}
          href="/vetting"
        />
      </div>
      <StatTile
        label="Open requirements"
        value={open.length}
        detail={`${officersStillNeeded} officers still needed`}
        severity={open.some((r) => daysSince(r.releasedToSourcingAt ?? r.receivedAt) > 30) ? "serious" : "warning"}
        href="/requirements"
      />
      <StatTile
        label="Past the client start date"
        value={pastStartDate}
        detail="Cover promised but not yet delivered"
        severity={pastStartDate >= 3 ? "critical" : pastStartDate >= 1 ? "serious" : "good"}
        href="/requirements"
      />
      <StatTile
        label="Candidates in pipeline"
        value={inPipeline}
        detail={`${requirements.length} live requirements`}
        href="/candidates"
      />
      <StatTile
        label="Overdue tasks"
        value={overdue}
        detail="Across every owner"
        severity={overdue > 25 ? "critical" : overdue > 10 ? "serious" : "warning"}
        href="/tasks"
      />
      <div className="sm:col-span-1 lg:col-span-2 xl:col-span-3">
        <StatTile
          label="Screening completed within the period allowed (12 months rolling)"
          value={`${compliance}%`}
          detail={`${complianceRate.completedInPeriod} of ${complianceRate.due} files · anything under 100% is a compliance failure, not a performance dip`}
          severity={compliance === 100 ? "good" : "critical"}
          href="/reports"
        />
      </div>
      <div className="sm:col-span-1 lg:col-span-1 xl:col-span-3">
        <StatTile
          label="In conditional employment with screening incomplete"
          value={onClock.length}
          detail="On site with five-year history verification still running, inside the 12-week window. A persistently high number means screening is the constraint on growth."
          href="/vetting"
        />
      </div>
    </div>
  );
}
