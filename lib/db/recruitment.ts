/**
 * Recruitment reads.
 *
 * The pipeline and one candidate, straight from the database. The interviews
 * a candidate needs depend on the client behind their requirement, so that is
 * read with them rather than assumed.
 */

import { onlineChecksOnFile } from "@/lib/core/screening";
import type { InterviewStage, RecruitmentStage } from "@/lib/types";
import { db } from "./client";
import { toCoreScreeningFile } from "./queries";

export interface PipelineRow {
  id: string;
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: RecruitmentStage;
  stageSince: Date;
  source: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  requirement: { reference: string; client: string; site: string } | null;
  requiresAdditional: boolean;
  interviews: { stage: InterviewStage; outcome: "progress" | "hold" | "reject" }[];
  vettingStatus: string | null;
}

export async function getPipeline(): Promise<PipelineRow[]> {
  const rows = await db.candidacy.findMany({
    orderBy: { stageSince: "asc" },
    include: {
      person: { include: { screeningFile: { orderBy: { openedAt: "desc" }, take: 1 } } },
      requirement: { include: { client: true, site: true } },
      interviews: true,
    },
  });
  const ownerIds = [...new Set(rows.map((r) => r.ownerUserId).filter(Boolean))] as string[];
  const owners = new Map(
    (await db.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, displayName: true } })).map(
      (u) => [u.id, u.displayName],
    ),
  );

  return rows.map((r) => ({
    id: r.id,
    personId: r.personId,
    name: r.person.fullName,
    email: r.person.email,
    phone: r.person.phone,
    stage: r.stage as RecruitmentStage,
    stageSince: r.stageSince,
    source: r.source,
    ownerUserId: r.ownerUserId,
    ownerName: r.ownerUserId ? (owners.get(r.ownerUserId) ?? null) : null,
    requirement: r.requirement
      ? { reference: r.requirement.reference, client: r.requirement.client.name, site: r.requirement.site.name }
      : null,
    requiresAdditional: r.requirement?.client.requiresAdditionalInterview ?? false,
    interviews: r.interviews.map((i) => ({ stage: i.stage as InterviewStage, outcome: i.outcome })),
    vettingStatus: r.person.screeningFile[0]?.status ?? null,
  }));
}

export async function getCandidacy(id: string) {
  const c = await db.candidacy.findUnique({
    where: { id },
    include: {
      person: {
        include: {
          screeningFile: {
            where: { disposedAt: null },
            orderBy: { openedAt: "desc" },
            take: 1,
            include: { checks: true },
          },
          employment: true,
          licences: { orderBy: { expiresAt: "desc" }, take: 1 },
        },
      },
      requirement: { include: { client: true, site: true } },
      interviews: { orderBy: { heldAt: "asc" } },
      onboardingSteps: { include: { doneBy: { select: { displayName: true } } } },
    },
  });
  if (!c) return null;

  const userIds = [
    c.ownerUserId,
    ...c.interviews.map((i) => i.interviewerUserId),
  ].filter(Boolean) as string[];
  const [users, events] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } }),
    db.event.findMany({
      where: { personId: c.personId, department: "recruitment" },
      orderBy: { at: "desc" },
      take: 30,
      include: { actor: { select: { displayName: true } } },
    }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.displayName]));

  return {
    ...c,
    stage: c.stage as RecruitmentStage,
    ownerName: c.ownerUserId ? (names.get(c.ownerUserId) ?? null) : null,
    requiresAdditional: c.requirement?.client.requiresAdditionalInterview ?? false,
    interviews: c.interviews.map((i) => ({
      ...i,
      stage: i.stage as InterviewStage,
      interviewerName: i.interviewerUserId ? (names.get(i.interviewerUserId) ?? null) : null,
    })),
    vettingStatus: c.person.screeningFile[0]?.status ?? null,
    screeningFileId: c.person.screeningFile[0]?.id ?? null,
    screening: c.person.screeningFile[0] ? toCoreScreeningFile(c.person.screeningFile[0], c.personId) : null,
    events,
  };
}

/** Open requirements a new candidate can be put forward for. */
export async function getOpenRequirements() {
  return db.requirement.findMany({
    where: { status: { in: ["received", "pool_check", "released_to_sourcing"] } },
    orderBy: { startDate: "asc" },
    include: { client: true, site: true },
  });
}

/** Everyone from conditional offer to onboarding complete, for the Onboarding board. */
export async function getOnboardingBoard() {
  const rows = await db.candidacy.findMany({
    where: { stage: { in: ["conditional_offer", "welcome_pack", "signed_docs_complete", "onboarding_complete"] } },
    orderBy: { stageSince: "asc" },
    include: {
      person: {
        include: {
          screeningFile: { where: { disposedAt: null }, orderBy: { openedAt: "desc" }, take: 1, include: { checks: true } },
          employment: true,
        },
      },
      requirement: { include: { client: true } },
      onboardingSteps: true,
    },
  });
  const ownerIds = [...new Set(rows.map((r) => r.ownerUserId).filter(Boolean))] as string[];
  const owners = new Map(
    (await db.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, displayName: true } })).map(
      (u) => [u.id, u.displayName],
    ),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.person.fullName,
    stage: r.stage as RecruitmentStage,
    stageSince: r.stageSince,
    client: r.requirement?.client.name ?? null,
    ownerName: r.ownerUserId ? (owners.get(r.ownerUserId) ?? null) : null,
    pin: r.person.employment?.pin ?? null,
    vettingStatus: r.person.screeningFile[0]?.status ?? null,
    onlineChecks: onlineChecksOnFile(
      r.person.screeningFile[0] ? toCoreScreeningFile(r.person.screeningFile[0], r.personId) : null,
    ),
    steps: r.onboardingSteps.map((s) => ({ step: s.step, doneAt: s.doneAt })),
  }));
}
