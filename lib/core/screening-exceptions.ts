/**
 * Screening exceptions, as rules.
 *
 * The cases the routine flow cannot carry: a risk found in the public record,
 * a check that fails, a clock that needs its one extension, a period that can
 * only be covered by a statutory declaration. Each is decided by Higher
 * Management with written grounds, and two things never happen automatically:
 * an extension is never approved and a finding is never cleared
 * (docs/proposal/03 §7).
 *
 * The limits here are enforced a second time in prisma/constraints.sql §13.
 */

import {
  CCJ_RISK_ACCEPTANCE_THRESHOLD_GBP,
  MAX_EXTENSION_WEEKS,
  MAX_STATUTORY_DECLARATION_MONTHS,
  clockState,
  weeksAllowed,
} from "@/lib/bs7858";
import { EXCEPTION_STATUSES, deriveStatus } from "@/lib/core/screening";
import type { ScreeningFile, VettingStatus } from "@/lib/types";

export type ExceptionKind = "risk_finding" | "adverse_finding" | "extension" | "statutory_declaration";
export type ExceptionState = "awaiting_representation" | "awaiting_decision" | "decided";
export type DecisionOutcome = "accepted" | "declined" | "approved" | "refused";
export type DecisionKind = "risk_acceptance" | "adverse_finding" | "extension" | "statutory_declaration";

export const EXCEPTION_LABELS: Record<ExceptionKind, string> = {
  risk_finding: "Risk acceptance",
  adverse_finding: "Adverse finding",
  extension: "Extension",
  statutory_declaration: "Statutory declaration",
};

export const EXCEPTION_CLAUSES: Record<ExceptionKind, string> = {
  risk_finding: "7.4f, Form 5",
  adverse_finding: "7.4f",
  extension: "7.6",
  statutory_declaration: "7.7i",
};

/** The three public-record findings that need a senior person to accept the risk [7.4f, Form 5]. */
export const RISK_TRIGGERS = [
  { id: "ccj", label: `CCJs totalling more than £${CCJ_RISK_ACCEPTANCE_THRESHOLD_GBP.toLocaleString("en-GB")}, satisfied or not` },
  { id: "bankruptcy", label: "The individual is bankrupt" },
  { id: "directorship", label: "The individual is, or was, a director of another organisation" },
] as const;
export type RiskTrigger = (typeof RISK_TRIGGERS)[number]["id"];

export const STATE_LABELS: Record<ExceptionState, string> = {
  awaiting_representation: "Representation invited",
  awaiting_decision: "Awaiting Higher Management",
  decided: "Decided",
};

export const OUTCOME_LABELS: Record<DecisionOutcome, string> = {
  accepted: "Accepted",
  declined: "Declined",
  approved: "Approved",
  refused: "Refused",
};

/** Findings pause the file; requests do not. */
export const PAUSING: ExceptionKind[] = ["risk_finding", "adverse_finding"];

/** Findings are put to the individual before anyone decides [7.4f]. */
export const needsRepresentation = (kind: ExceptionKind) => PAUSING.includes(kind);

export const DECISION_KIND: Record<ExceptionKind, DecisionKind> = {
  risk_finding: "risk_acceptance",
  adverse_finding: "adverse_finding",
  extension: "extension",
  statutory_declaration: "statutory_declaration",
};

/** The two answers each kind of case can have, the favourable one first. */
export function outcomesFor(kind: ExceptionKind): [DecisionOutcome, DecisionOutcome] {
  return PAUSING.includes(kind) ? ["accepted", "declined"] : ["approved", "refused"];
}

const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Raising a case
// ---------------------------------------------------------------------------

export function riskFindingProblem(args: { trigger: string; amountGbp: number | null }): string | null {
  if (!RISK_TRIGGERS.some((t) => t.id === args.trigger)) return "Choose what the public record search found.";
  if (args.trigger === "ccj") {
    if (args.amountGbp === null || !Number.isFinite(args.amountGbp)) return "Give the total of the CCJs.";
    if (args.amountGbp <= CCJ_RISK_ACCEPTANCE_THRESHOLD_GBP) {
      return `CCJs totalling £${CCJ_RISK_ACCEPTANCE_THRESHOLD_GBP.toLocaleString("en-GB")} or less do not need risk acceptance. Record them in the note on the Creditsafe check instead.`;
    }
  }
  return null;
}

/**
 * The one extension [7.6]: four weeks, once, while the clock is still running,
 * and only where written requests have gone unanswered — which is exactly what
 * the request dates stamped on each history check are the evidence of.
 */
export function extensionProblem(args: {
  file: ScreeningFile;
  openKinds: ExceptionKind[];
  now?: Date;
}): string | null {
  const { file } = args;
  const now = args.now ?? new Date();
  if (file.controllerReview2At) return "The file is complete; there is nothing to extend.";
  const clock = clockState(file, now);
  if (!clock) return "The clock has not started, so there is nothing to extend yet.";
  if (file.extensionWeeks > 0) return "The single extension has already been used (7.6).";
  if (args.openKinds.includes("extension")) return "An extension request is already waiting for a decision.";
  if (clock.expired) return "The period has already run out. An extension has to be decided before the deadline, not after it.";
  const asked = file.checks.some(
    (c) => c.group === "history" && c.status !== "verified" && c.status !== "not_applicable" && c.firstRequestSentAt,
  );
  if (!asked) {
    return "An extension needs evidence that written requests were made and not answered. Record the request on the outstanding history check first.";
  }
  return null;
}

/**
 * A statutory declaration [7.7i]: one period, no more than six months, within
 * the last five years, and only where verification genuinely cannot be done.
 */
export function declarationProblem(args: {
  from: Date;
  to: Date;
  openKinds: ExceptionKind[];
  alreadyApproved: boolean;
  now?: Date;
}): string | null {
  const now = args.now ?? new Date();
  if (Number.isNaN(args.from.getTime()) || Number.isNaN(args.to.getTime())) return "Give the start and end of the period.";
  if (args.from > args.to) return "The period ends before it starts.";
  if (args.to > now) return "The period cannot run into the future.";
  if ((args.to.getTime() - args.from.getTime()) / DAY > 183) {
    return `A statutory declaration can cover at most ${MAX_STATUTORY_DECLARATION_MONTHS} months (7.7i).`;
  }
  if (args.from.getTime() < now.getTime() - 5 * 365.25 * DAY) return "The period has to fall within the last five years (7.7i).";
  if (args.alreadyApproved) return "A statutory declaration has already been approved on this file. The standard allows one period (7.7i).";
  if (args.openKinds.includes("statutory_declaration")) return "A statutory declaration request is already waiting for a decision.";
  return null;
}

// ---------------------------------------------------------------------------
// Deciding a case
// ---------------------------------------------------------------------------

/**
 * Who may decide. Higher Management, but never the person who raised the case
 * — the same separation the approval ladder keeps — and never the subject
 * [6.1].
 */
export function decisionProblem(args: {
  state: ExceptionState;
  deciderUserId: string;
  deciderPersonId: string;
  subjectPersonId: string;
  raisedById: string;
}): string | null {
  if (args.state === "awaiting_representation") return "The individual has to be given the chance to make representation first (7.4f).";
  if (args.state === "decided") return "This has already been decided.";
  if (args.deciderPersonId === args.subjectPersonId) return "An individual may not decide on their own screening (6.1).";
  if (args.deciderUserId === args.raisedById) return "The person who raised a case does not also decide it.";
  return null;
}

/** An extension can only be approved while it still leaves time on the clock. */
export function extensionApprovalProblem(file: ScreeningFile, now = new Date()): string | null {
  if (!file.conditionalEmploymentStart) return "The clock has not started.";
  if (file.extensionWeeks > 0) return "The single extension has already been used (7.6).";
  const start = new Date(file.conditionalEmploymentStart).getTime();
  const extended = start + (weeksAllowed(file.screeningPeriodYears) + MAX_EXTENSION_WEEKS) * 7 * DAY;
  if (extended <= now.getTime()) return "Even with four more weeks the period has run out. It cannot be extended now.";
  return null;
}

// ---------------------------------------------------------------------------
// What the file's status is, with its cases taken into account
// ---------------------------------------------------------------------------

/**
 * The file's status, all things considered. A withdrawn or unsuccessful file
 * stays so; a completed one is complete; an expired one stays expired while it
 * is out of time [7.6]; an open finding pauses it; otherwise it is wherever
 * its checks say.
 */
export function fileStatus(file: ScreeningFile, openKinds: ExceptionKind[], now = new Date()): VettingStatus {
  if (file.status === "withdrawn" || file.status === "unsuccessful") return file.status;
  if (file.controllerReview2At) return "complete";
  // Expiry is set only by the sweep, because the sweep is also what tells
  // Control. Once set it holds while the clock is still out of time; an
  // approved extension is what lifts it.
  if (file.status === "time_expired" && clockState(file, now)?.expired) return "time_expired";
  if (openKinds.includes("adverse_finding")) return "adverse_finding";
  if (openKinds.includes("risk_finding")) return "risk_acceptance_required";
  // Back to the routine: the checks decide, and a submitted review holds.
  const routine = EXCEPTION_STATUSES.includes(file.status) ? "not_started" : file.status;
  return deriveStatus({ ...file, status: routine });
}

/**
 * Files the daily sweep has to expire: on the clock, past the deadline, not
 * complete, and not already ended [7.6].
 */
export function isExpiredOnClock(file: ScreeningFile, now = new Date()): boolean {
  if (file.controllerReview2At) return false;
  if (["time_expired", "withdrawn", "unsuccessful", "complete"].includes(file.status)) return false;
  return Boolean(clockState(file, now)?.expired);
}
