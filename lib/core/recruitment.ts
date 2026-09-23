/**
 * The recruitment pipeline, as rules.
 *
 * Pure functions, so the test script can reach them without a database and
 * the server action and the screen cannot disagree about what is allowed.
 *
 * Recruitment owns the pipeline from sourcing to onboarding complete. The two
 * stages after that — deployed and confirmed employment — are decided by the
 * deployment gate on the screening file, not by moving a card, so they are
 * deliberately out of reach from here.
 */

import { outstandingFor, type OnboardingStepKey } from "@/lib/core/onboarding";
import { STAGE_SLA_DAYS, isRestingStage } from "@/lib/sla";
import type { InterviewStage, RecruitmentStage, Role } from "@/lib/types";

/** The stages Recruitment moves a candidate through, in order. */
export const RECRUITMENT_PIPELINE: RecruitmentStage[] = [
  "sourcing",
  "shortlisted",
  "invited",
  "application_received",
  "application_complete",
  "first_interview",
  "second_interview",
  "additional_interview",
  "conditional_offer",
  "welcome_pack",
  "signed_docs_complete",
  "onboarding_complete",
];

/** Stages where Recruitment's part is over and nothing moves from here. */
export const END_STAGES: RecruitmentStage[] = [
  "onboarding_complete",
  "deployed",
  "confirmed_employment",
  "withdrawn",
];

/** The interview a pipeline stage is waiting on. */
export const STAGE_INTERVIEW: Partial<Record<RecruitmentStage, InterviewStage>> = {
  first_interview: "first",
  second_interview: "second",
  additional_interview: "additional",
};

/**
 * Who may record each interview. The second interview is the HR Manager's —
 * it is the final interview the standard requires before any offer [7.3.4] —
 * so a Recruitment officer can hold the first but not sign off the second.
 */
export const INTERVIEW_ROLES: Record<InterviewStage, Role[]> = {
  first: ["recruitment", "recruitment_manager"],
  second: ["recruitment_manager"],
  additional: ["recruitment", "recruitment_manager"],
};

export interface HeldInterview {
  stage: InterviewStage;
  outcome: "progress" | "hold" | "reject";
}

export function requiredInterviews(requiresAdditional: boolean): InterviewStage[] {
  return requiresAdditional ? ["first", "second", "additional"] : ["first", "second"];
}

function passed(held: HeldInterview[], stage: InterviewStage): boolean {
  return held.some((i) => i.stage === stage && i.outcome === "progress");
}

/**
 * The stage after this one, or null at the end of Recruitment's part.
 * The additional interview is skipped unless the client asks for one.
 */
export function nextStage(
  stage: RecruitmentStage,
  requiresAdditional: boolean,
): RecruitmentStage | null {
  if (END_STAGES.includes(stage)) return null;
  const i = RECRUITMENT_PIPELINE.indexOf(stage);
  if (i < 0) return null;
  const next = RECRUITMENT_PIPELINE[i + 1] ?? null;
  if (next === "additional_interview" && !requiresAdditional) return "conditional_offer";
  return next;
}

export interface AdvanceCheck {
  to: RecruitmentStage | null;
  permitted: boolean;
  reason: string | null;
}

/**
 * Whether a candidate may move on, and to where.
 *
 * Two gates. An interview stage is left only once that interview has been held
 * and passed. And nobody reaches a conditional offer without every interview
 * the client needs [7.3.4] — checked again at the offer itself, because a
 * candidate can arrive at second_interview by a route that skipped the first.
 */
export function canAdvance(args: {
  stage: RecruitmentStage;
  interviews: HeldInterview[];
  requiresAdditional: boolean;
  /** Onboarding steps done, from conditional offer on. See lib/core/onboarding.ts. */
  onboardingDone?: Set<OnboardingStepKey>;
  /**
   * What the screening file says stops an offer (Gate 1's screening half —
   * offerBlockers in lib/core/screening.ts). Left out, the offer is blocked:
   * a caller that forgets to ask does not get a free pass.
   */
  screeningBlockers?: string[];
}): AdvanceCheck {
  const to = nextStage(args.stage, args.requiresAdditional);
  if (!to) {
    return {
      to: null,
      permitted: false,
      reason:
        args.stage === "withdrawn"
          ? "This candidate has been withdrawn."
          : "Recruitment's part is complete. Deployment is decided by the screening file's deployment gate.",
    };
  }

  const waitingOn = STAGE_INTERVIEW[args.stage];
  if (waitingOn && !passed(args.interviews, waitingOn)) {
    return {
      to,
      permitted: false,
      reason: `Record the ${waitingOn} interview with a "progress" outcome before moving on.`,
    };
  }

  // From the offer on, a stage is left only once its checklist is done.
  const outstanding = outstandingFor(args.stage, args.onboardingDone ?? new Set());
  if (outstanding.length > 0) {
    return {
      to,
      permitted: false,
      reason: `Finish the onboarding checklist for this stage first: ${outstanding
        .map((s) => s.label.charAt(0).toLowerCase() + s.label.slice(1))
        .join("; ")}.`,
    };
  }

  if (to === "conditional_offer") {
    const screening = args.screeningBlockers ?? ["The screening file was not consulted"];
    if (screening.length > 0) {
      return { to, permitted: false, reason: `No conditional offer yet — ${screening.join("; ")}.` };
    }
    const missing = requiredInterviews(args.requiresAdditional).filter(
      (s) => !passed(args.interviews, s),
    );
    if (missing.length > 0) {
      return {
        to,
        permitted: false,
        reason: `No offer before every required interview is passed (7.3.4). Missing: ${missing.join(", ")}.`,
      };
    }
  }

  return { to, permitted: true, reason: null };
}

/** Whether a role may record an interview at this stage. */
export function canRecordInterview(role: Role, stage: InterviewStage): boolean {
  return INTERVIEW_ROLES[stage].includes(role);
}

/**
 * How late a candidate is in their current stage, against our own SLA in
 * lib/sla.ts. Late is amber-red past the SLA and critical past three times it;
 * a resting or finished stage is never late.
 */
export function stageSeverity(
  stage: RecruitmentStage,
  daysInStage: number,
): "good" | "serious" | "critical" | "neutral" {
  if (isRestingStage(stage) || stage === "onboarding_complete") return "neutral";
  const sla = STAGE_SLA_DAYS[stage] || 1;
  if (daysInStage > sla * 3) return "critical";
  if (daysInStage > sla) return "serious";
  return "good";
}

export function daysIn(since: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000));
}
