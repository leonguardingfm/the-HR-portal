/**
 * The officer pool, from the database.
 *
 * Everyone Control could roster: employed and not a leaver, or deployed on a
 * candidacy. Deployability is not stored anywhere — it is evaluated here from
 * the screening file, the licence, right to work and employment, through the
 * same getDeployabilityInputs the Scheduling publish check uses, so the pool
 * and the rota can never disagree about who may work.
 */

import { addDays, hoursWithin, mondayOf, ukDate, ukInstant } from "@/lib/core/rota";
import { clockState } from "@/lib/bs7858";
import { evaluateDeployability, type Deployability } from "@/lib/core/deployability";
import type { ControlId, RecruitmentStage, ScreeningPeriodYears, Severity, VettingStatus } from "@/lib/types";
import { db } from "./client";
import { getDeployabilityInputs } from "./queries";

export interface OfficerRow {
  personId: string;
  /** Exactly as on the SIA badge where a licence is recorded; otherwise the person's name. */
  name: string;
  fullName: string;
  pin: string | null;
  controlTeam: ControlId | null;
  employment: "conditional" | "confirmed" | "suspended" | null;
  startedAt: Date | null;
  licence: { number: string; expiresAt: Date } | null;
  rightToWorkExpiry: Date | null;
  screening: {
    fileId: string;
    status: VettingStatus;
    clock: { daysRemaining: number; severity: Severity; expired: boolean } | null;
  } | null;
  candidacy: { id: string; stage: RecruitmentStage } | null;
  deployability: Deployability;
  onShiftNow: { site: string; post: string; endsAt: Date } | null;
  nextShift: { site: string; post: string; startsAt: Date } | null;
  /** Their agreed weekly hours; null without an employment record. */
  weeklyHours: number | null;
  /** Hours on the rota this week, Monday to Sunday, drafts included. */
  hoursThisWeek: number;
}

export async function getOfficerPool(now = new Date()): Promise<OfficerRow[]> {
  const inputs = await getDeployabilityInputs();
  const ids = [...inputs.keys()];
  const monday = mondayOf(ukDate(now));
  const weekFrom = ukInstant(monday, "00:00");
  const weekTo = ukInstant(addDays(monday, 7), "00:00");
  const people = await db.person.findMany({
    where: { id: { in: ids } },
    include: {
      employment: true,
      licences: { orderBy: { expiresAt: "desc" }, take: 1 },
      documents: { where: { typeId: { in: ["right_to_work", "visa"] } } },
      screeningFile: { where: { disposedAt: null }, orderBy: { openedAt: "desc" }, take: 1 },
      candidacies: { orderBy: { stageSince: "desc" }, take: 1, select: { id: true, stage: true } },
      assignments: {
        where: { state: { in: ["published", "amended"] }, endsAt: { gt: now } },
        orderBy: { startsAt: "asc" },
        take: 2,
        include: { post: { include: { site: true } } },
      },
    },
  });
  const thisWeek = await db.assignment.findMany({
    where: { personId: { in: ids }, state: { not: "cancelled" }, startsAt: { lt: weekTo }, endsAt: { gt: weekFrom } },
    select: { personId: true, startsAt: true, endsAt: true },
  });

  return people.map((p) => {
    const known = inputs.get(p.id)!;
    const file = p.screeningFile[0];
    const clock = file
      ? clockState(
          {
            conditionalEmploymentStart: file.conditionalEmploymentStart?.toISOString() ?? null,
            screeningPeriodYears: file.screeningPeriodYears as ScreeningPeriodYears,
            extensionWeeks: file.extensionWeeks as 0 | 4,
          },
          now,
        )
      : null;
    const current = p.assignments.find((a) => a.startsAt <= now);
    const next = p.assignments.find((a) => a.startsAt > now);
    const rtw = p.documents
      .map((d) => d.expiresAt)
      .filter(Boolean)
      .sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;
    const state = p.employment?.state;

    return {
      personId: p.id,
      name: known.personName,
      fullName: p.fullName,
      pin: p.employment?.pin ?? null,
      controlTeam: (p.employment?.controlTeam as ControlId | null) ?? null,
      employment: state === "conditional" || state === "confirmed" || state === "suspended" ? state : null,
      startedAt: p.employment?.startedAt ?? null,
      licence: p.licences[0] ? { number: p.licences[0].number, expiresAt: p.licences[0].expiresAt } : null,
      rightToWorkExpiry: rtw,
      screening: file
        ? {
            fileId: file.id,
            status: file.status as VettingStatus,
            clock:
              clock && !file.controllerReview2At
                ? { daysRemaining: clock.daysRemaining, severity: clock.severity, expired: clock.expired }
                : null,
          }
        : null,
      candidacy: p.candidacies[0] ? { id: p.candidacies[0].id, stage: p.candidacies[0].stage as RecruitmentStage } : null,
      deployability: evaluateDeployability(known.input, now),
      onShiftNow: current ? { site: current.post.site.name, post: current.post.name, endsAt: current.endsAt } : null,
      nextShift: next ? { site: next.post.site.name, post: next.post.name, startsAt: next.startsAt } : null,
      weeklyHours: p.employment && p.employment.state !== "ended" ? p.employment.weeklyHours : null,
      hoursThisWeek: hoursWithin(thisWeek.filter((a) => a.personId === p.id), weekFrom, weekTo),
    };
  });
}
