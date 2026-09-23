/**
 * Screening reads.
 *
 * Every file is returned both as its database row and as the core
 * ScreeningFile the BS 7858 rules understand, so a page never re-implements a
 * gate — it asks lib/bs7858.ts and lib/core/screening.ts.
 */

import type { Role } from "@/lib/types";
import { db } from "./client";
import { toCoreScreeningFile } from "./queries";

const CHECK_ORDER = { consent: 0, preliminary: 1, history: 2, criminality: 3, legal: 4, signoff: 5, exception: 6 } as const;

async function userNames(ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter(Boolean))] as string[];
  const users = await db.user.findMany({ where: { id: { in: wanted } }, select: { id: true, displayName: true } });
  return new Map(users.map((u) => [u.id, u.displayName]));
}

/** Every live file, for the Vetting list and the clock board. */
export async function getScreeningFiles() {
  const files = await db.screeningFile.findMany({
    where: { disposedAt: null },
    orderBy: { openedAt: "desc" },
    include: {
      checks: true,
      exceptions: { where: { state: { not: "decided" } }, select: { id: true, kind: true, state: true, raisedById: true } },
      person: {
        include: { candidacies: { orderBy: { stageSince: "desc" }, take: 1, select: { id: true, stage: true } } },
      },
    },
  });
  const names = await userNames(files.flatMap((f) => [f.administratorUserId, f.controllerUserId]));
  return files.map((f) => ({
    row: f,
    core: toCoreScreeningFile(f, f.personId),
    name: f.person.fullName,
    candidacy: f.person.candidacies[0] ?? null,
    administratorName: f.administratorUserId ? (names.get(f.administratorUserId) ?? null) : null,
    controllerName: f.controllerUserId ? (names.get(f.controllerUserId) ?? null) : null,
  }));
}

/** One file, with everything its page and its gates need. */
export async function getScreeningFile(id: string) {
  const f = await db.screeningFile.findUnique({
    where: { id },
    include: {
      checks: true,
      decisions: { orderBy: { decidedAt: "desc" } },
      exceptions: { orderBy: { raisedAt: "desc" }, include: { decision: true } },
      person: {
        include: {
          employment: true,
          candidacies: {
            orderBy: { stageSince: "desc" },
            take: 1,
            include: { interviews: true, onboardingSteps: true, requirement: { include: { client: true } } },
          },
        },
      },
    },
  });
  if (!f) return null;
  f.checks.sort((a, b) => CHECK_ORDER[a.group] - CHECK_ORDER[b.group]);

  const [names, events] = await Promise.all([
    userNames([
      f.administratorUserId,
      f.controllerUserId,
      ...f.checks.map((c) => c.ownerUserId),
      ...f.decisions.map((d) => d.decidedById),
      ...f.exceptions.flatMap((e) => [e.raisedById, e.representationRecordedById]),
    ]),
    db.event.findMany({
      where: { screeningFileId: f.id },
      orderBy: { at: "desc" },
      take: 40,
      include: { actor: { select: { displayName: true } } },
    }),
  ]);

  return {
    row: f,
    core: toCoreScreeningFile(f, f.personId),
    candidacy: f.person.candidacies[0] ?? null,
    names,
    events,
  };
}

/**
 * Candidates far enough along to need a file — an application in — who do not
 * have a live one yet. Screening starts from the application [7.3], so this is
 * the queue that stops a candidate reaching the offer with nothing opened.
 */
export async function getCandidatesNeedingFile() {
  return db.candidacy.findMany({
    where: {
      stage: {
        in: [
          "application_received",
          "application_complete",
          "first_interview",
          "second_interview",
          "additional_interview",
          "conditional_offer",
        ],
      },
      person: { screeningFile: { none: { disposedAt: null } } },
    },
    orderBy: { stageSince: "asc" },
    include: { person: true, requirement: { include: { client: true } } },
  });
}

/**
 * Who could control a file: anyone holding the Screening Controller role who
 * is neither the administrator nor the subject [6.1, 7.5.2b]. The database
 * trigger refuses the rest regardless.
 */
export async function getEligibleControllers(subjectPersonId: string, administratorUserId: string | null) {
  const users = await db.user.findMany({
    where: {
      active: true,
      status: "active",
      personId: { not: subjectPersonId },
      ...(administratorUserId ? { id: { not: administratorUserId } } : {}),
      roles: { some: { role: "vetting_controller" satisfies Role, revokedAt: null } },
    },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });
  return users;
}

export interface ClockRow {
  id: string;
  name: string;
  screeningPeriodYears: number;
  extensionWeeks: number;
  conditionalEmploymentStart: Date;
  unverifiedDays: number;
  gapsOver31Days: number;
  administratorName: string | null;
  outstanding: string;
}

/**
 * Files on the clock: conditional employment has started and the completed
 * file is not yet signed off [7.6]. What is outstanding is read off the
 * history checks rather than kept as a summary somebody has to update.
 */
export async function getClockRows(): Promise<ClockRow[]> {
  const files = await getScreeningFiles();
  return files
    .filter((f) => f.row.conditionalEmploymentStart && !f.row.controllerReview2At)
    .map((f) => {
      const open = f.row.checks.filter(
        (c) => c.group === "history" && c.status !== "verified" && c.status !== "not_applicable",
      );
      return {
        id: f.row.id,
        name: f.name,
        screeningPeriodYears: f.row.screeningPeriodYears,
        extensionWeeks: f.row.extensionWeeks,
        conditionalEmploymentStart: f.row.conditionalEmploymentStart!,
        unverifiedDays: f.row.unverifiedDays,
        gapsOver31Days: f.row.gapsOver31Days,
        administratorName: f.administratorName,
        outstanding: open.length
          ? `${open.length} history check${open.length === 1 ? "" : "s"} open`
          : f.row.status === "controller_review_2"
            ? "With the controller for sign-off"
            : "History verified — ready to submit",
      };
    });
}

/** Everyone who can sit in the controller's seat, for filtering per file. */
export async function getControllers() {
  return db.user.findMany({
    where: { active: true, status: "active", roles: { some: { role: "vetting_controller", revokedAt: null } } },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, personId: true },
  });
}
