/**
 * Company policy that goes beyond BS 7858:2019.
 *
 * Kept deliberately separate from lib/bs7858.ts. Everything in that file comes
 * from the standard and carries a clause reference; everything here is a choice
 * we made. Mixing them would let a local preference pass itself off as a
 * regulatory requirement — or, worse, let someone quietly drop a rule we chose
 * on the grounds that "the standard doesn't ask for it".
 *
 * Confirmed September 2026: officers reach a client site only after initial
 * screening. The single element that runs afterwards is verification of the
 * five-year career history, inside the 12 weeks the standard allows.
 *
 * No person is named anywhere in this file. Who holds which role is data, set
 * up in Admin — see lib/roles.ts for the rules that operate on it.
 */

import { evaluateGate1, type GateResult, isGroupSatisfied } from "./bs7858";
import type { InterviewStage, ScreeningFile } from "./types";

/**
 * The deployment gate — stricter than the standard's conditional-employment
 * gate, and the one that actually decides whether someone can be rostered.
 *
 * Beyond BS 7858's Gate 1 we require, before anyone goes to site:
 *
 *  - the criminality element: SIA licence, NPCC Appendix C, or a disclosure
 *    from the appropriate body. The standard places this inside full screening
 *    [7.7j], i.e. it would permit deployment without it. We do not.
 *  - right to work, with a follow-up date where leave is time-limited. Outside
 *    BS 7858's scope entirely [Clause 1], but a separate legal obligation.
 *  - the signed Welcome Pack documents returned.
 *
 * Returns the same shape as the BS 7858 gates so the UI treats all three
 * identically, and so the blocking reason is always a plain sentence rather
 * than a disabled button with no explanation.
 */
export function evaluateDeploymentGate(
  file: ScreeningFile,
  args: {
    riskEvaluationDocumented: boolean;
    finalInterviewHeld: boolean;
    /** All Welcome Pack documents signed and checked. */
    signedDocumentsComplete: boolean;
  },
): GateResult {
  const gate1 = evaluateGate1(file, {
    riskEvaluationDocumented: args.riskEvaluationDocumented,
    finalInterviewHeld: args.finalInterviewHeld,
  });
  const blockedBy = [...gate1.blockedBy];

  if (!isGroupSatisfied(file, "criminality")) {
    blockedBy.push(
      "SIA licence, NPCC Appendix C or disclosure not yet held — our policy requires this before deployment (7.7j)",
    );
  }
  if (!isGroupSatisfied(file, "legal")) {
    blockedBy.push("Right to work not yet confirmed");
  }
  if (!args.signedDocumentsComplete) {
    blockedBy.push("Welcome Pack documents not yet signed and returned");
  }

  return {
    open: blockedBy.length === 0,
    reason:
      blockedBy.length === 0
        ? "Deployment to a client site permitted"
        : `Deployment blocked: ${blockedBy[0]}`,
    blockedBy,
  };
}

/**
 * Which checks must be complete before deployment, for display and for the
 * personalised checklist. Everything not listed here belongs to the post-
 * deployment 12-week window.
 */
export const PRE_DEPLOYMENT_CHECK_GROUPS = [
  "consent",
  "preliminary",
  "criminality",
  "legal",
  "signoff",
] as const;

/** The one group of work that runs on the clock after deployment. */
export const POST_DEPLOYMENT_CHECK_GROUPS = ["history"] as const;

/**
 * The employment contract condition.
 *
 * Confirmed 19 September 2026: confirmed employment depends on satisfactory
 * completion of screening within the permitted period, and conditional
 * employment ends if it does not complete.
 *
 * This is what makes signing the contract before history verification finishes
 * defensible [7.5.2], and it is the wording the portal's gates and clock
 * assume. An earlier answer reported the current contract as not stating it
 * expressly, so the amendment is tracked as C18 in docs/proposal/07 — the
 * portal enforces the rule either way, but it cannot make a contract say
 * something it does not say.
 */
export const CONTRACT_CONDITION = {
  confirmationDependsOnScreening: true,
  conditionalEmploymentEndsIfIncomplete: true,
  clause: "7.5.2",
} as const;

/**
 * Interviews.
 *
 * Three stages, the third used only where a client asks for it:
 *
 *   1. First interview  — recruitment team, by telephone or voice call
 *   2. Second interview — HR Manager, on site or by video
 *   3. Additional       — only where the site or client requires one
 *
 * BS 7858 requires an interview before any offer of employment is made
 * [7.3.4]. Which stages are required for a given candidate depends on the
 * client, so the gate asks the client record rather than assuming.
 */
export const INTERVIEW_STAGES = ["first", "second", "additional"] as const;

/** Stages that must be complete before an offer, for a given client. */
export function requiredInterviewStages(client: {
  requiresAdditionalInterview: boolean;
}): InterviewStage[] {
  return client.requiresAdditionalInterview
    ? ["first", "second", "additional"]
    : ["first", "second"];
}

/**
 * Division of functions [6.1].
 *
 * The standard asks for particular attention to the division of functions and
 * authority between interviewing, screening and the decision to employ. It
 * does not forbid one person holding more than one, so this warns and records
 * rather than blocking — in a small team an audited exception is more honest
 * than a workaround.
 *
 * Compares people by id rather than by name, so it keeps working when someone
 * changes team or a new starter takes over a queue.
 */
export function reviewIndependence(args: {
  controllerUserId: string | null;
  interviewerUserIds: string[];
}): { independent: boolean; warning: string | null } {
  if (
    args.controllerUserId &&
    args.interviewerUserIds.includes(args.controllerUserId)
  ) {
    return {
      independent: false,
      warning:
        "This candidate's screening file is being signed off by someone who interviewed them — permitted, but recorded as an exception to the division of functions (6.1)",
    };
  }
  return { independent: true, warning: null };
}
