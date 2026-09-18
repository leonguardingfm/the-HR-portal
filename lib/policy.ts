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
 */

import { evaluateGate1, type GateResult, isGroupSatisfied } from "./bs7858";
import type { ScreeningFile } from "./types";

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
 * Our vetting team is two people who alternate roles per file. Both are
 * trained and recorded as competent in both, and the pairing rule in
 * `canSignOff` stops the same person appearing twice on one file.
 */
export const VETTING_PAIR = ["Anas", "Talha"] as const;

/** The authorised person for risk acceptance, extensions and statutory declarations. */
export const AUTHORISED_PERSON = "Farhan" as const;

/**
 * Interviews. The final interview is held by Farhan and is mandatory before
 * any offer [7.3.4]; an initial interview by the recruitment team is optional
 * and does not substitute for it.
 */
export const FINAL_INTERVIEWER = "Farhan" as const;
export const INITIAL_INTERVIEW_OPTIONAL = true;

/**
 * Who screens the screeners.
 *
 * Confirmed September 2026: Farhan is the administrator on Anas's and Talha's
 * own screening files. That closes the problem cleanly, because the reviewing
 * controller then has to be someone who is neither the subject nor the
 * administrator — which leaves the other half of the pair:
 *
 *   Anas's file    → administrator Farhan, controller Talha
 *   Talha's file   → administrator Farhan, controller Anas
 *   Farhan's file  → administrator Talha,  controller Anas
 *
 * Every row satisfies both rules: nobody screens themselves [6.1], and no
 * controller reviews a file they built [7.5.2b]. Being an administrator makes
 * Farhan a person engaged in screening, so clause 6.2 training and a
 * confidentiality agreement apply to him too.
 */
export const INTERNAL_FILE_ASSIGNMENTS = [
  { subject: "Anas", administrator: "Farhan", controller: "Talha" },
  { subject: "Talha", administrator: "Farhan", controller: "Anas" },
  { subject: "Farhan", administrator: "Talha", controller: "Anas" },
] as const;

/**
 * Division of functions [6.1].
 *
 * The standard asks for particular attention to the division of functions and
 * authority between interviewing, screening and the decision to employ. It
 * does not forbid one person holding more than one, so this warns and records
 * rather than blocking — in a small team an audited exception is more honest
 * than a workaround.
 *
 * In practice our arrangement satisfies it without needing the warning:
 * Farhan interviews and accepts risk, while Anas and Talha control the files.
 */
export function reviewIndependence(args: {
  controller: string;
  finalInterviewer: string | null;
}): { independent: boolean; warning: string | null } {
  if (args.finalInterviewer && args.controller === args.finalInterviewer) {
    return {
      independent: false,
      warning: `${args.controller} both interviewed this candidate and is signing off their screening file — permitted, but recorded as an exception to the division of functions (6.1)`,
    };
  }
  return { independent: true, warning: null };
}
