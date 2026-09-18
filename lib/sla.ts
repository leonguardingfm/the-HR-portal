/**
 * Internal service levels and chaser rhythms.
 *
 * These are OUR numbers, not the standard's — proposed defaults from
 * docs/proposal/03, to be agreed and then edited in Admin without a code
 * change. Kept separate from lib/bs7858.ts so a local preference is never
 * mistaken for a regulatory requirement.
 *
 * All durations are in working days unless the name says otherwise.
 */

import type { RecruitmentStage, Severity, VettingStatus } from "./types";

export const STAGE_SLA_DAYS: Record<RecruitmentStage, number> = {
  sourcing: 1,
  shortlisted: 2,
  invited: 0,
  application_received: 3,
  application_complete: 3,
  initial_interview: 3,
  final_interview: 5,
  conditional_offer: 1,
  welcome_pack: 0,
  signed_docs_complete: 5,
  onboarding_complete: 2,
  deployed: 1,
  confirmed_employment: 0,
  withdrawn: 0,
};

export const VETTING_SLA_DAYS: Partial<Record<VettingStatus, number>> = {
  information_complete: 2,
  preliminary_checks_complete: 3,
  limited_screening_complete: 5,
  controller_review_1: 2,
};

/** Chaser ladders. A sequence cancels itself as soon as the item arrives. */
export const CHASERS = {
  application: { days: [3, 7], escalateAfterDays: 14 },
  documents: { days: [2, 5, 8], escalateAfterDays: 11, maxAttempts: 3 },
  signatures: { days: [2, 5], escalateAfterDays: 10 },
  reference: {
    /** 1st request on day 0, 2nd at 10, documentary route at 20, escalate 30. */
    secondRequestDay: 10,
    documentaryRouteDay: 20,
    escalateDay: 30,
  },
} as const;

/** A task turns amber at 80% of its SLA and red once past it. */
export const TASK_THRESHOLDS = { warning: 0.8 } as const;

export function taskSeverity(
  dueAt: string,
  slaDays: number,
  now: Date = new Date(),
): Severity {
  const due = new Date(dueAt).getTime();
  const nowMs = now.getTime();
  const msPerDay = 86_400_000;
  const daysLate = (nowMs - due) / msPerDay;

  if (daysLate >= slaDays) return "critical"; // twice its SLA
  if (daysLate > 0) return "serious";
  const fractionUsed = 1 + daysLate / Math.max(slaDays, 1);
  if (fractionUsed >= TASK_THRESHOLDS.warning) return "warning";
  return "good";
}

/**
 * Stages that are a resting state rather than a queue.
 *
 * An officer who has been deployed for 80 days is not breaching anything —
 * their screening clock is the thing with a deadline, not their stage. Showing
 * these as overdue trains people to ignore red.
 */
export const RESTING_STAGES: RecruitmentStage[] = [
  "deployed",
  "confirmed_employment",
  "withdrawn",
];

export function isRestingStage(stage: RecruitmentStage): boolean {
  return RESTING_STAGES.includes(stage);
}

/** Licence and right-to-work expiry warnings, in calendar days. */
export const EXPIRY_WARNING_DAYS = [90, 60, 30] as const;
