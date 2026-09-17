import { Card } from "@/components/ui/Card";
import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { StageSlaChart } from "@/components/charts/StageSlaChart";
import { WorkloadChart } from "@/components/charts/WorkloadChart";
import { funnel, stageCycleTimes, workload } from "@/lib/mock/data";

export default function ReportsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="KPIs, delay analysis, source effectiveness and audit extracts. The monthly compliance pack keeps a fixed shape, because it is also the pack handed to an auditor or insurer."
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Pipeline funnel" subtitle="Where candidates are lost between stages.">
          <FunnelChart data={funnel} />
        </Card>
        <Card
          title="Median days in stage"
          subtitle="Against the agreed service level — whether the constraint is Control, HR, the candidate or reference turnaround."
        >
          <StageSlaChart data={stageCycleTimes} />
        </Card>
      </div>

      <Card
        title="Workload by owner"
        subtitle="For balancing work, not for measuring people — a distinction worth stating when the portal is introduced."
      >
        <WorkloadChart data={workload} />
      </Card>

      <ModuleOutline
        note="Audit extracts matter as much as the KPIs: every file in conditional employment with its deadline, every extension granted and who approved it, every risk acceptance, and every record due for disposal."
        items={[
          {
            label: "Monthly compliance pack",
            detail: "Completion within the period allowed, files in conditional employment, extensions used, statutory declarations used, risk acceptances, unverified-period exposure, controller sign-off coverage, disposals on schedule.",
            clause: "7.6, 7.7i, 11",
            phase: 2,
          },
          {
            label: "Speed measures",
            detail: "Time to fill, time to deployable, time to confirmed, Control reaction time, HR reaction time, and reference turnaround by employer — which identifies the employers who never reply, so we go straight to the documentary route next time.",
            phase: 2,
          },
          {
            label: "Quality and effort measures",
            detail: "Application completion rate, chasers per candidate, document rejection rate, first-time-right controller reviews, and duplicates prevented — the last quantifies a benefit that is otherwise invisible.",
            phase: 2,
          },
          {
            label: "Source effectiveness",
            detail: "Time and cost per hire from previous enquirers, existing Indeed applications and new Indeed adverts, plus the internal cover rate.",
            phase: 2,
          },
          {
            label: "Forecast screening demand",
            detail: "Pipeline times expected conversion against current vetting capacity, so screening capacity is planned rather than discovered.",
            phase: 4,
          },
        ]}
      />
    </div>
  );
}
