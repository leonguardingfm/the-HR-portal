/**
 * The Department board — management's view across the teams, every number
 * read from the records (25 September 2026). Replaces the sample charts.
 */

import type { RecruitmentStage } from "@/lib/types";
import { CLOSED, DEPARTMENT_ROLES, departmentLabel, type HubDepartment } from "@/lib/core/hub";
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
  // The Performance hub's open tasks too — for the Control Room, most of the work.
  const hubDepts = (Object.keys(DEPARTMENT_ROLES) as HubDepartment[]).filter((d) => scope.all || DEPARTMENT_ROLES[d].some((r) => scope.roles.includes(r as Role)));
  const [candidacies, sla, items, hubTasks] = await Promise.all([
    db.candidacy.findMany({ where: { stage: { not: "withdrawn" } }, select: { stage: true, stageSince: true } }),
    db.setting.findUnique({ where: { key: "sla.stageDays" } }),
    db.workItem.findMany({
      where: { state: { in: ["open", "blocked"] }, AND: [{ OR: [{ ownerRole: { not: null } }, { owner: { department: { not: "officer" } } }] }, mine] },
      select: { dueAt: true, state: true, ownerRole: true, owner: { select: { displayName: true } } },
    }),
    hubDepts.length
      ? db.hubTask.findMany({
          where: { status: { notIn: CLOSED }, department: { in: hubDepts }, OR: [{ mailboxId: null }, { mailbox: { mode: { not: "shadow" } } }] },
          select: { department: true, status: true, ackDueAt: true, actionDueAt: true, updateDueAt: true, firstActionAt: true, followUpAt: true, owner: { select: { displayName: true } } },
        })
      : Promise.resolve([]),
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

  // Open work by who has it — by name for the Managing Director and for a
  // department's head (their own department only); otherwise the team's work,
  // taken and still in the pool.
  const byOwner = new Map<string, { owner: string; onTrack: number; overdue: number }>();
  const count = (owner: string, late: boolean) => {
    const row = byOwner.get(owner) ?? { owner, onTrack: 0, overdue: 0 };
    if (late) row.overdue++;
    else row.onTrack++;
    byOwner.set(owner, row);
  };
  for (const w of items) {
    const owner = !scope.perPerson
      ? w.owner && w.ownerRole
        ? "Taken by someone in the team"
        : w.ownerRole
          ? "In the team's pool — nobody on it yet"
          : "Named to someone in the team"
      : (w.owner?.displayName ?? (scope.all ? `${(w.ownerRole ?? "unassigned").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())} — nobody yet` : "Portal — nobody yet"));
    count(owner, w.state !== "blocked" && w.dueAt < now);
  }
  for (const t of hubTasks) {
    const waitingUntil = ["awaiting_information", "awaiting_client", "awaiting_officer"].includes(t.status) && t.followUpAt && now < t.followUpAt;
    const late = t.status === "unassigned" ? now > t.ackDueAt : !t.firstActionAt ? now > t.actionDueAt : !waitingUntil && !!t.updateDueAt && now > t.updateDueAt;
    const owner = t.owner ? (scope.perPerson ? t.owner.displayName : "Taken by someone in the team") : scope.all ? `Hub, ${departmentLabel(t.department)} — nobody yet` : "Hub — nobody yet";
    count(owner, late);
  }
  const workload = [...byOwner.values()].sort((a, b) => b.overdue + b.onTrack - (a.overdue + a.onTrack)).slice(0, 12);

  return { funnel, inStage, workload };
}
