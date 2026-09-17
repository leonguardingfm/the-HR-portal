"use client";

import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { FunnelChart } from "@/components/charts/FunnelChart";
import { StageSlaChart } from "@/components/charts/StageSlaChart";
import { WorkloadChart } from "@/components/charts/WorkloadChart";
import { useRole } from "@/components/layout/RoleContext";
import { ROLE_LABELS } from "@/lib/labels";
import { funnel, stageCycleTimes, workload } from "@/lib/mock/data";
import { ExceptionsQueue } from "./ExceptionsQueue";
import { RequirementBoard } from "./RequirementBoard";
import { TaskDigest } from "./TaskDigest";
import { TileRow } from "./TileRow";
import { VettingClockBoard } from "./VettingClockBoard";

/**
 * The landing dashboard.
 *
 * Same page for everyone, different emphasis by role: Control leads with the
 * order book, Recruitment with its own queue, Vetting with the clock, and
 * management sees the lot. Anything that does not answer one of the four
 * dashboard questions in docs/proposal/04 belongs in Reports instead.
 */
export function DashboardView() {
  const { role } = useRole();

  const seesClock = role !== "control" && role !== "recruitment";
  const seesRequirements = true;
  const seesPeople = role === "recruitment_manager" || role === "top_management" || role === "auditor";
  const seesFlow = role !== "control";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description={`Outstanding cover, screening deadlines, delays and workload. Showing the ${ROLE_LABELS[role]} view.`}
      />

      <TileRow />

      {seesClock && <VettingClockBoard />}

      {seesRequirements && <RequirementBoard />}

      <div className="grid gap-5 xl:grid-cols-2">
        <TaskDigest limit={7} />
        <ExceptionsQueue />
      </div>

      {seesFlow && (
        <div className="grid gap-5 xl:grid-cols-2">
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
            Control sees requirements, allocation and whether an officer is
            deployable. Screening file contents — identity evidence, financial
            findings and criminal record outcomes — are restricted to the vetting
            team, top management and audit, because BS&nbsp;7858 restricts that
            information to those who need it to make a recruitment decision
            (clauses 6.1 and 7.2). If Control has a practical need for more, that
            is a design decision to take deliberately rather than by default.
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
