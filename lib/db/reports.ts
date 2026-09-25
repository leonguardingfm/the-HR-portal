/**
 * The Department board — management's view across the teams, every number
 * read from the records (25 September 2026). Replaces the sample charts.
 */

import type { RecruitmentStage } from "@/lib/types";
import { RECRUITMENT_STAGE_LABELS } from "@/lib/labels";
import type { Role } from "@/lib/types";
import { db } from "./client";

const PIPELINE: RecruitmentStage[] = [
  "sourcing", "shortlisted", "invited", "application_received", "application_complete", "first_interview",
  "second_interview", "conditional_offer", "welcome_pack", "signed_docs_complete", "onboarding_complete", "deployed", "confirmed_employment",
];

export async function getDepartmentBoard(scope: { all: boolean; roles: Role[]; perPerson: boolean } = { all: true, roles: [], perPerson: true }, now = new Date()) {
  // A department manager's board holds their own department's work only.
  const mine = scope.all ? {} : { OR: [{ ownerRole: { in: scope.roles } }, { ownerRole: null, owner: { roles: { some: { role: { in: scope.roles }, revokedAt: null } } } }] };
  const [candidacies, sla, items] = await Promise.all([
    db.candidacy.findMany({ where: { stage: { not: "withdrawn" } }, select: { stage: true, stageSince: true } }),
    db.setting.findUnique({ where: { key: "sla.stageDays" } }),
    db.workItem.findMany({
      where: { state: { in: ["open", "blocked"] }, AND: [{ OR: [{ ownerRole: { not: null } }, { owner: { department: { not: "officer" } } }] }, mine] },
      select: { dueAt: true, state: true, ownerRole: true, owner: { select: { displayName: true } } },
    }),
  ]);
  const targets = (sla ? JSON.parse(sla.value) : {}) as Record<string, number>;
  const at = (s: RecruitmentStage) => PIPELINE.indexOf(s);

  // How many have got at least this far: the pipeline as a funnel.
  const funnel = PIPELINE.filter((s) => s !== "additional_interview").map((s) => ({
    stage: RECRUITMENT_STAGE_LABELS[s].replace(/ \(.*\)$/, ""),
    count: candidacies.filter((c) => at(c.stage) >= at(s)).length,
  }));

  // How long the people in each stage have been there, against its target.
  const inStage = PIPELINE.slice(0, 11)
    .map((s) => {
      const here = candidacies.filter((c) => c.stage === s);
      const avg = here.length ? here.reduce((n, c) => n + (now.getTime() - c.stageSince.getTime()) / 86_400_000, 0) / here.length : 0;
      return { stage: RECRUITMENT_STAGE_LABELS[s].replace(/ \(.*\)$/, ""), actual: Math.round(avg * 10) / 10, sla: targets[s] ?? 0, n: here.length };
    })
    .filter((x) => x.n > 0);

  // Open work by who has it — named for the Managing Director; for a
  // department manager, the team's work taken and still in the pool.
  const byOwner = new Map<string, { owner: string; onTrack: number; overdue: number }>();
  for (const w of items) {
    const owner = !scope.perPerson
      ? w.owner && w.ownerRole
        ? "Taken by someone in the team"
        : w.ownerRole
          ? "In the team's pool — nobody on it yet"
          : "Named to someone in the team"
      : (w.owner?.displayName ?? `${(w.ownerRole ?? "unassigned").replace(/_/g, " ")} (nobody yet)`);
    const row = byOwner.get(owner) ?? { owner, onTrack: 0, overdue: 0 };
    if (w.state !== "blocked" && w.dueAt < now) row.overdue++;
    else row.onTrack++;
    byOwner.set(owner, row);
  }
  const workload = [...byOwner.values()].sort((a, b) => b.overdue + b.onTrack - (a.overdue + a.onTrack)).slice(0, 12);

  return { funnel, inStage, workload };
}
