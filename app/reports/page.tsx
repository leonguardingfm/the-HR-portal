import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActiveNow } from "@/components/dashboard/ActiveNow";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { StageSlaChart } from "@/components/charts/StageSlaChart";
import { WorkloadChart } from "@/components/charts/WorkloadChart";
import { requireSession } from "@/lib/auth/server";
import { departmentOfRole, oversightScope } from "@/lib/core/work";
import { getPresence } from "@/lib/db/queries";
import { getDepartmentBoard } from "@/lib/db/reports";

export const dynamic = "force-dynamic";

/**
 * The Department board: who is working on what, where the pipeline stands,
 * how long people wait in each stage, and whose desk the open work is on.
 *
 * The Managing Director sees every department and every person. Every other
 * manager sees their own department only, as team totals (26 September
 * 2026): departments stay separate, and individual figures are the Managing
 * Director's.
 */
export default async function ReportsPage() {
  const session = await requireSession();
  const scope = oversightScope(session.activeRole);
  const dept = departmentOfRole(session.activeRole);
  const [presence, board] = await Promise.all([getPresence(new Date(), scope.all ? null : scope.roles), getDepartmentBoard(scope)]);
  const hr = scope.all || ["recruitment", "vetting"].includes(dept.id);
  return (
    <div className="space-y-5">
      <PageHeader
        title="Department board"
        description={scope.all ? "Every department, and who is working on what — read from the records, not compiled." : `${dept.label}: who is working now and where the team's work stands. Other departments' work is theirs; individual figures are the Managing Director's.`}
      />

      <ActiveNow rows={presence} youUserId={session.userId} />

      {hr && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card title="Recruitment pipeline" subtitle="How many candidates have reached each stage. Withdrawn candidates are left out.">
            <FunnelChart data={board.funnel} />
          </Card>
          <Card title="Days in stage now" subtitle="The average wait of the candidates in each stage today, against its target.">
            {board.inStage.length ? <StageSlaChart data={board.inStage} /> : <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>Nobody in the pipeline.</p>}
          </Card>
        </div>
      )}

      <Card
        title={scope.perPerson ? "Open work by who has it" : `${dept.label}'s open work`}
        subtitle={scope.perPerson ? "For balancing the work, not for measuring people. Work still in a department's pool is shown as such." : "Taken, and still in the team's pool — for balancing the work."}
      >
        <WorkloadChart data={board.workload} />
      </Card>
    </div>
  );
}
