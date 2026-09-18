/**
 * BS 7858:2019 rules expressed as code.
 *
 * This file is the compliance core of the portal. Everything here derives from
 * the standard rather than from local preference, so each rule carries its
 * clause reference. Internal service levels that we chose ourselves live in
 * lib/sla.ts instead, so the two are never confused.
 *
 * BS 7858:2019 is a licensed BSI publication. Requirements are paraphrased and
 * cited, never reproduced.
 */

import type {
  Check,
  ScreeningFile,
  ScreeningPeriodYears,
  Severity,
} from "./types";

// ---------------------------------------------------------------------------
// Clock — clause 7.6
// ---------------------------------------------------------------------------

/**
 * Weeks allowed to complete full screening after conditional employment
 * commences: 12 for a 5-year screening period, 16 for 10-year [7.6].
 */
export function weeksAllowed(years: ScreeningPeriodYears): 12 | 16 {
  return years === 10 ? 16 : 12;
}

/**
 * A single extension of up to four weeks is possible, but only with evidence
 * that written verification requests were made and with top management
 * approval, recorded and retrievable [7.6]. The portal never grants a second.
 */
export const MAX_EXTENSION_WEEKS = 4 as const;

/** Minimum screening period: five years, or back to age 16 [3.13]. */
export const MIN_SCREENING_PERIOD_YEARS = 5 as const;

/**
 * Our default, confirmed September 2026: we screen to five years, so every
 * file runs a 12-week clock. The 10-year path stays supported but unused,
 * because the period has to be extended for contractual or legislative
 * reasons or specific industry standards [7.3.2b], and some insurers impose a
 * longer period as a policy condition [Clause 1, Note 2].
 */
export const DEFAULT_SCREENING_PERIOD_YEARS = 5 as const;

/** Limited screening confirms at least the last three years [7.5.2a]. */
export const LIMITED_SCREENING_YEARS = 3 as const;

/** No unverified period may exceed 31 days [7.7]. */
export const MAX_UNVERIFIED_GAP_DAYS = 31 as const;

/** A statutory declaration may cover at most six months [7.7i]. */
export const MAX_STATUTORY_DECLARATION_MONTHS = 6 as const;

/** CCJs above this total need documented risk acceptance [7.4f, Form 5]. */
export const CCJ_RISK_ACCEPTANCE_THRESHOLD_GBP = 10_000 as const;

const MS_PER_DAY = 86_400_000;

export interface ClockState {
  /** Date full screening must be complete by, including any extension. */
  deadline: Date;
  /** The date conditional employment must cease if screening is incomplete. */
  ceaseDate: Date;
  daysRemaining: number;
  daysElapsed: number;
  totalDays: number;
  /** Fraction of the allowed period used, clamped to 0..1 for display. */
  fractionUsed: number;
  severity: Severity;
  expired: boolean;
  /** True where an extension has not yet been used and could be requested. */
  extensionAvailable: boolean;
}

/**
 * Escalation thresholds on the clock. These are ours, not the standard's — the
 * standard only fixes the endpoint. Chosen so that a file turns red with a
 * quarter of its window left, which is roughly three weeks on a 12-week clock.
 */
export const CLOCK_THRESHOLDS = { warning: 0.5, serious: 0.75, critical: 0.9 };

export function clockState(
  file: Pick<
    ScreeningFile,
    "conditionalEmploymentStart" | "screeningPeriodYears" | "extensionWeeks"
  >,
  now: Date = new Date(),
): ClockState | null {
  if (!file.conditionalEmploymentStart) return null;

  const start = new Date(file.conditionalEmploymentStart);
  const weeks = weeksAllowed(file.screeningPeriodYears) + file.extensionWeeks;
  const totalDays = weeks * 7;

  const deadline = new Date(start.getTime() + totalDays * MS_PER_DAY);
  const daysElapsed = Math.floor((now.getTime() - start.getTime()) / MS_PER_DAY);
  const daysRemaining = Math.ceil(
    (deadline.getTime() - now.getTime()) / MS_PER_DAY,
  );
  const fractionUsed = Math.min(Math.max(daysElapsed / totalDays, 0), 1);

  let severity: Severity = "good";
  if (daysRemaining <= 0) severity = "critical";
  else if (fractionUsed >= CLOCK_THRESHOLDS.critical) severity = "critical";
  else if (fractionUsed >= CLOCK_THRESHOLDS.serious) severity = "serious";
  else if (fractionUsed >= CLOCK_THRESHOLDS.warning) severity = "warning";

  return {
    deadline,
    // Employment is to cease on the deadline where screening has not been
    // completed successfully [7.6]. Records must show this date prominently
    // alongside the commencement date [7.2].
    ceaseDate: deadline,
    daysRemaining,
    daysElapsed,
    totalDays,
    fractionUsed,
    severity,
    expired: daysRemaining <= 0,
    extensionAvailable: file.extensionWeeks === 0,
  };
}

// ---------------------------------------------------------------------------
// Gates — clauses 7.4, 7.5, 7.7
// ---------------------------------------------------------------------------

export interface GateResult {
  open: boolean;
  /** Plain-English reason, shown to the user rather than a disabled button. */
  reason: string;
  /** The unmet conditions, in the order the standard lists them. */
  blockedBy: string[];
}

/**
 * Gate 1 — no offer of conditional employment unless the risk in the intended
 * role has been evaluated, deemed acceptable and documented, preliminary checks
 * are satisfactory, and limited screening is satisfactory [7.5.1]. Limited
 * screening is only complete once the controller has reviewed the file
 * [7.5.2b].
 *
 * This is the standard's own minimum and nothing more. Deployment to a client
 * site is gated more tightly than this by our own policy — see
 * `evaluateDeploymentGate` in lib/policy.ts, kept separate so a local rule is
 * never mistaken for a requirement of the standard.
 */
export function evaluateGate1(
  file: ScreeningFile,
  riskEvaluationDocumented: boolean,
): GateResult {
  const blockedBy: string[] = [];

  if (!riskEvaluationDocumented) {
    blockedBy.push("Risk in the intended role not yet evaluated and documented (7.5.1a)");
  }
  if (!isGroupSatisfied(file, "preliminary")) {
    blockedBy.push("Preliminary checks incomplete (7.4)");
  }
  if (!file.controllerReview1At) {
    blockedBy.push("Awaiting controller review of limited screening (7.5.2b)");
  }

  return {
    open: blockedBy.length === 0,
    reason:
      blockedBy.length === 0
        ? "Conditional offer permitted"
        : `Conditional offer blocked: ${blockedBy[0]}`,
    blockedBy,
  };
}

/**
 * Gate 2 — no offer of confirmed employment unless full screening has been
 * completed satisfactorily [7.7]: the whole screening period verified with no
 * unverified period over 31 days, and the completed file reviewed by the
 * controller.
 *
 * In our process this gate measures one well-defined piece of work, because
 * everything else is already done before deployment: verification of the
 * five-year career history. The criminality element [7.7j] sits inside full
 * screening in the standard, but we complete it earlier, so it is checked at
 * the deployment gate instead — see lib/policy.ts.
 */
export function evaluateGate2(file: ScreeningFile): GateResult {
  const blockedBy: string[] = [];

  if (file.unverifiedDays > 0) {
    blockedBy.push(`${file.unverifiedDays} days of the screening period still unverified (7.7)`);
  }
  if (file.gapsOver31Days > 0) {
    blockedBy.push(
      `${file.gapsOver31Days} gap${file.gapsOver31Days === 1 ? "" : "s"} over ${MAX_UNVERIFIED_GAP_DAYS} days without evidence (7.7)`,
    );
  }
  if (!file.controllerReview2At) {
    blockedBy.push("Awaiting controller review of the completed file (7.7)");
  }

  return {
    open: blockedBy.length === 0,
    reason:
      blockedBy.length === 0
        ? "Confirmed employment permitted"
        : `Confirmed employment blocked: ${blockedBy[0]}`,
    blockedBy,
  };
}

export function isGroupSatisfied(
  file: ScreeningFile,
  group: Check["group"],
): boolean {
  const checks = file.checks.filter((c) => c.group === group);
  if (checks.length === 0) return false;
  return checks.every(
    (c) => c.status === "verified" || c.status === "not_applicable",
  );
}

// ---------------------------------------------------------------------------
// Separation of duties — clause 6.1
// ---------------------------------------------------------------------------

export interface SignoffCheck {
  permitted: boolean;
  reason: string | null;
}

/**
 * An individual must not screen themselves, and the controller who reviews a
 * file must not be the administrator who built it [6.1, 3.10, 3.11, 7.5.2b].
 * Enforced as a hard rule with no override.
 */
export function canSignOff(args: {
  reviewerUserId: string;
  reviewerPersonId: string;
  subjectPersonId: string;
  administratorUserId: string | null;
}): SignoffCheck {
  if (args.reviewerPersonId === args.subjectPersonId) {
    return {
      permitted: false,
      reason: "An individual may not screen themselves (6.1)",
    };
  }
  if (args.administratorUserId && args.reviewerUserId === args.administratorUserId) {
    return {
      permitted: false,
      reason:
        "The controller reviewing a file may not be the administrator who built it (7.5.2b)",
    };
  }
  return { permitted: true, reason: null };
}

// ---------------------------------------------------------------------------
// Retention — clause 11
// ---------------------------------------------------------------------------

export const RETENTION = {
  /** Unsuccessful at preliminary screening: minimum 12 months [11.1]. */
  unsuccessfulAtPreliminaryMonths: 12,
  /** After employment ceases: seven years for the listed records [11.3]. */
  afterCessationYears: 7,
} as const;

/** Training must be reviewed at least annually [6.2]. */
export const TRAINING_REVIEW_MONTHS = 12 as const;
