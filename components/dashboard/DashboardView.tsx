import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { StageSlaChart } from "@/components/charts/StageSlaChart";
import { WorkloadChart } from "@/components/charts/WorkloadChart";
import { ROLE_LABELS } from "@/lib/labels";
import { funnel, stageCycleTimes, workload } from "@/lib/mock/data";
import type { DashboardCounts, LiveRow, PresenceRow } from "@/lib/db/queries";
import type { ClockRow } from "@/lib/db/screening";
import type { EventRecord } from "@/lib/core/types";
import type { Role } from "@/lib/types";
import { ActiveNow } from "./ActiveNow";
import { ActivityFeed } from "./ActivityFeed";
import { DepartmentKpis } from "./DepartmentKpis";
import { ExceptionsQueue } from "./ExceptionsQueue";
import { LiveStrip } from "./LiveStrip";
import { RequirementBoard } from "./RequirementBoard";
import { TaskDigest } from "./TaskDigest";
import { TileRow } from "./TileRow";
import { VettingClockBoard } from "./VettingClockBoard";

/**
 * The landing dashboard.
 *
 * Same page for everyone, different order by role: Control and the operations
 * manager lead with what is happening on site right now, Recruitment with its
 * own queue, Vetting with the clock, and management sees the lot. The test it
 * has to pass is the one in docs/platform/01 §1 — who is working, where,
 * whether they are allowed to be there, whether they turned up, and what is
 * overdue, without asking anyone.
 *
 * Anything that is analysis rather than an answer belongs in Insight instead.
 */
export function DashboardView({
  liveRows,
  events,
  counts,
  presence,
  clockFiles,
  role,
  name,
  userId,
}: {
  liveRows: LiveRow[];
  events: EventRecord[];
  counts: DashboardCounts;
  presence: PresenceRow[];
  clockFiles: ClockRow[];
  role: Role;
  name: string;
  userId: string;
}) {

  const operational = role === "control" || role === "operations_manager";
  const management =
    role === "recruitment_manager" ||
    role === "top_management" ||
    role === "auditor" ||
    role === "operations_manager";

  const seesClock = role !== "control" && role !== "recruitment" && role !== "operations_manager";
  const seesLive = operational || management;
  const seesFlow = role !== "control" && role !== "operations_manager";
  const seesPeople = role === "recruitment_manager" || role === "top_management" || role === "auditor";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description={`Cover on site now, screening deadlines, delays and workload. ${name ? `${name}, working as ` : "Showing the "}${ROLE_LABELS[role]}${name ? "." : " view."}`}
      />

      {/* Operational roles open on what is happening, not on the funnel. */}
      {operational && seesLive && <LiveStrip rows={liveRows} />}

      <TileRow />

      {seesClock && <VettingClockBoard files={clockFiles} />}

      {!operational && seesLive && <LiveStrip rows={liveRows} />}

      <RequirementBoard />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <TaskDigest limit={7} />
        <ExceptionsQueue />
      </div>

      {management && <DepartmentKpis counts={counts} />}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ActiveNow rows={presence} youUserId={userId} />
        <ActivityFeed events={events} />
      </div>

      {seesFlow && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card
            title="Pipeline funnel"
            subtitle="Where candidates are lost between one stage and the next."
          >
            <FunnelChart data={funnel} />
          </Card>
          <Card
            title="Median days in stage"
            subtitle="Against the agreed internal service level — the delay diagnosis view."
          >
            <StageSlaChart data={stageCycleTimes} />
          </Card>
        </div>
      )}

      {seesPeople && (
        <Card
          title="Workload by owner"
          subtitle="Open tasks and files per person, split by whether they are inside their service level."
        >
          <WorkloadChart data={workload} />
        </Card>
      )}

      {role === "control" && (
        <Card title="Why you are not seeing candidate detail">
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Control sees requirements, allocation, the live board and whether an
            officer is deployable. Screening file contents — identity evidence,
            financial findings and criminal record outcomes — are restricted to
            the vetting team, top management and audit, because BS&nbsp;7858
            restricts that information to those who need it to make a
            recruitment decision (clauses 6.1 and 7.2). If Control has a
            practical need for more, that is a design decision to take
            deliberately rather than by default.
          </p>
        </Card>
      )}

      {role === "operations_manager" && (
        <Card title="What this role owns">
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            The live board, the inspection programme, incidents and the welfare
            escalation ladder — step 3 on that ladder is this role by name, which
            is why it exists in the permission model rather than being folded
            into Control. Screening file contents are restricted here too: this
            role sees whether an officer is deployable, not why.
          </p>
        </Card>
      )}

      {role === "recruitment" && (
        <Card title="Why vetting shows only as a status">
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Recruitment sees whether a screening file is clear, blocked or
            overdue, and the category of what is outstanding — not the evidence
            itself. That split is deliberate: the standard asks for separation of
            duties between interviewing, screening and the decision to employ
            (clause 6.1), and restricts criminal record information to those who
            need it for the recruitment decision.
          </p>
        </Card>
      )}
    </div>
  );
}
