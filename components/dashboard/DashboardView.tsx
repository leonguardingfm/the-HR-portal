import { PageHeader } from "@/components/ui/PageHeader";
import { UncoveredPanel } from "@/components/live/UncoveredPanel";
import { ROLE_LABELS } from "@/lib/labels";
import type { LiveRow, PresenceRow } from "@/lib/db/queries";
import type { ClockRow } from "@/lib/db/screening";
import type { UncoveredShift } from "@/lib/db/uncovered";
import type { EventRecord } from "@/lib/core/types";
import type { Role } from "@/lib/types";
import { ActiveNow } from "./ActiveNow";
import { ActivityFeed } from "./ActivityFeed";
import { DutyPanel } from "./DutyPanel";
import { TaskSummary, type TaskSummaryRow } from "./TaskSummary";
import { VettingClockBoard } from "./VettingClockBoard";

/**
 * The landing dashboard: direct, and every number on it real.
 *
 * It answers the day's questions for the person looking and nothing else
 * (Control, 25 September 2026: "keep the dashboard direct"). Control and the
 * operations manager lead with the shifts nobody is on and the duty checks;
 * vetting with the screening clock; everyone with their own tasks and who is
 * working. Analysis belongs on the Department board, not here.
 */
export function DashboardView({
  liveRows,
  uncovered,
  events,
  presence,
  clockFiles,
  tasks,
  role,
  name,
  userId,
}: {
  liveRows: LiveRow[];
  uncovered: UncoveredShift[];
  events: EventRecord[];
  presence: PresenceRow[];
  clockFiles: ClockRow[];
  tasks: { rows: TaskSummaryRow[]; total: number; department: string };
  role: Role;
  name: string;
  userId: string;
}) {
  const operational = role === "control" || role === "operations_manager";
  const oversight = role === "top_management" || role === "auditor";
  const vetting = role === "vetting_admin" || role === "vetting_controller" || role === "recruitment_manager";
  // Who is working on what is for management, not the teams themselves (25 September 2026).
  const manages = oversight || role === "operations_manager" || role === "recruitment_manager" || role === "admin_manager";

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" description={`${name}, working as ${ROLE_LABELS[role]}.`} />

      {(operational || oversight) && <UncoveredPanel rows={uncovered} />}
      {(operational || oversight) && <DutyPanel rows={liveRows} />}
      {(vetting || oversight) && <VettingClockBoard files={clockFiles} />}

      <div className={manages ? "grid grid-cols-1 gap-5 xl:grid-cols-2" : ""}>
        <TaskSummary rows={tasks.rows} total={tasks.total} department={tasks.department} />
        {manages && <ActiveNow rows={presence} youUserId={userId} />}
      </div>

      {oversight && <ActivityFeed events={events} />}
    </div>
  );
}
