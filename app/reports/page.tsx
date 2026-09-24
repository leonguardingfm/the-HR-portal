import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActiveNow } from "@/components/dashboard/ActiveNow";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { StageSlaChart } from "@/components/charts/StageSlaChart";
import { WorkloadChart } from "@/components/charts/WorkloadChart";
import { requireSession } from "@/lib/auth/server";
import { getPresence } from "@/lib/db/queries";
import { getDepartmentBoard } from "@/lib/db/reports";

export const dynamic = "force-dynamic";

/**
 * The Department board: management's view across the teams — who is working
 * on what, where the pipeline stands, how long people wait in each stage, and
 * whose desk the open work is on. Every number from the records.
 */
export default async function ReportsPage() {
  const session = await requireSession();
  const [presence, board] = await Promise.all([getPresence(), getDepartmentBoard()]);
  return (
    <div className="space-y-5">
      <PageHeader title="Department board" description="Who is working on what, and where each team's work stands — read from the records, not compiled." />

      <ActiveNow rows={presence} youUserId={session.userId} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Recruitment pipeline" subtitle="How many candidates have reached each stage. Withdrawn candidates are left out.">
          <FunnelChart data={board.funnel} />
        </Card>
        <Card title="Days in stage now" subtitle="The average wait of the candidates in each stage today, against its target.">
          {board.inStage.length ? <StageSlaChart data={board.inStage} /> : <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>Nobody in the pipeline.</p>}
        </Card>
      </div>

      <Card title="Open work by who has it" subtitle="For balancing the work, not for measuring people. Work still in a department's pool is shown as such.">
        <WorkloadChart data={board.workload} />
      </Card>
    </div>
  );
}
