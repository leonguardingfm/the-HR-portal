/**
 * The screening file, as rules — the working half of lib/bs7858.ts.
 *
 * bs7858.ts says what the standard requires (the gates, the clock, who may
 * sign off). This file says how a file moves: which checks it opens with,
 * when it is ready for each controller review, and what blocks an offer.
 * Pure, so the test script reaches it without a database and the screen and
 * the server action cannot disagree.
 */

import { isGroupSatisfied } from "@/lib/bs7858";
import type { Check, CheckGroup, CheckStatus, ScreeningFile, VettingStatus } from "@/lib/types";

/**
 * The checks every file opens with — the standard's verification progress
 * sheet (Annex A, Form 2) as we run it. Criminality and right to work sit here
 * too because our deployment gate needs them before site (lib/policy.ts).
 */
export const STANDARD_CHECKS: { group: CheckGroup; label: string; clause: string; requestCode?: string }[] = [
  { group: "consent", label: "Authorisation to approach employers, government departments and a credit reference agency", clause: "7.3.2f" },
  { group: "consent", label: "Signed declaration and misrepresentation acknowledgement", clause: "7.3.2e, g" },
  { group: "preliminary", label: "Information complete and reviewed as likely to complete", clause: "7.4b" },
  { group: "preliminary", label: "Identity confirmed from original documents", clause: "7.4c" },
  { group: "preliminary", label: "SIA licence verified against the public register", clause: "7.4c1" },
  { group: "preliminary", label: "Current address confirmed", clause: "7.4d" },
  { group: "preliminary", label: "UK sanctions screening (HM Treasury consolidated list)", clause: "7.4e" },
  { group: "preliminary", label: "OFAC sanctions screening", clause: "7.4e" },
  { group: "preliminary", label: "Creditsafe public record search", clause: "7.4f" },
  { group: "history", label: "Career and history — 3 years before application", clause: "7.5.2a", requestCode: "WR" },
  { group: "history", label: "Career and history — whole screening period", clause: "7.7", requestCode: "WR" },
  { group: "history", label: "Date of leaving full-time education", clause: "7.7a", requestCode: "ER" },
  { group: "criminality", label: "SIA licence, NPCC Appendix C or disclosure held", clause: "7.7j" },
  { group: "criminality", label: "Enhanced disclosure — post involves contact with children or vulnerable adults", clause: "7.7j Note 6" },
  { group: "legal", label: "Right to work — share code checked independently", clause: "outside scope" },
  { group: "signoff", label: "Controller review — limited screening", clause: "7.5.2b" },
  { group: "signoff", label: "Controller review — completed file", clause: "7.7" },
];

export const GROUP_LABELS: Record<CheckGroup, string> = {
  consent: "Consent and authorisation",
  preliminary: "Preliminary checks",
  history: "Career and history",
  criminality: "Criminality",
  legal: "Legal (outside BS 7858 scope)",
  signoff: "Controller sign-off",
  exception: "Exceptions",
};

/**
 * When each group has to be complete. Everything except the career history is
 * done before the officer reaches a client site; the history verification is
 * the one piece of work the 12-week clock measures.
 */
export const GROUP_TIMING: Record<CheckGroup, string> = {
  consent: "With the application",
  preliminary: "Before the conditional offer",
  history: "3 years before the offer; the rest within the clock",
  criminality: "Before deployment (our policy)",
  legal: "Before deployment",
  signoff: "Before the offer, then again at completion",
  exception: "As they arise",
};

/** Statuses an administrator may set by hand. Sign-off is set by the review. */
export const SETTABLE_STATUSES: CheckStatus[] = [
  "not_started",
  "requested",
  "chased",
  "received",
  "verified",
  "not_applicable",
  "failed",
];

/** The three-year history check: limited screening [7.5.2a]. */
export const isLimitedHistory = (c: Pick<Check, "group" | "clause">) =>
  c.group === "history" && c.clause === "7.5.2a";

export const isSignoff = (c: Pick<Check, "group">) => c.group === "signoff";

/** Exception states set by a decision, which the routine flow never overrides. */
export const EXCEPTION_STATUSES: VettingStatus[] = [
  "risk_acceptance_required",
  "statutory_declaration_required",
  "adverse_finding",
  "time_expired",
  "withdrawn",
  "unsuccessful",
];

function outstanding(file: ScreeningFile, group: CheckGroup): string[] {
  return file.checks
    .filter((c) => c.group === group && c.status !== "verified" && c.status !== "not_applicable")
    .map((c) => c.label);
}

/**
 * Ready for the first controller review: consent, the preliminary checks and
 * three years of history verified [7.4, 7.5.2a]. Returns what is missing.
 */
export function limitedScreeningBlockers(file: ScreeningFile): string[] {
  const out: string[] = [];
  if (!isGroupSatisfied(file, "consent")) out.push("Consent and authorisation not yet complete (7.3.2)");
  const prelim = outstanding(file, "preliminary");
  if (prelim.length) out.push(`Preliminary checks outstanding: ${prelim.join("; ")} (7.4)`);
  const three = file.checks.find(isLimitedHistory);
  if (!three || three.status !== "verified") out.push("Three years of history not yet verified (7.5.2a)");
  if (file.checks.some((c) => c.status === "failed")) out.push("A check has failed — that is an adverse finding, not a review");
  return out;
}

/**
 * Ready for the second controller review: every group done apart from the
 * sign-offs, and no unverified period left [7.7].
 */
export function fullScreeningBlockers(file: ScreeningFile): string[] {
  const out: string[] = [];
  if (!file.controllerReview1At) out.push("Limited screening has not been reviewed yet (7.5.2b)");
  for (const group of ["consent", "preliminary", "history", "criminality", "legal"] as CheckGroup[]) {
    const left = outstanding(file, group);
    if (left.length) out.push(`${GROUP_LABELS[group]}: ${left.join("; ")}`);
  }
  if (file.unverifiedDays > 0) out.push(`${file.unverifiedDays} days of the screening period unverified (7.7)`);
  if (file.gapsOver31Days > 0) out.push(`${file.gapsOver31Days} gap(s) over 31 days without evidence (7.7)`);
  if (file.checks.some((c) => c.status === "failed")) out.push("A check has failed — that is an adverse finding, not a review");
  return out;
}

/**
 * The screening half of Gate 1: what stops a conditional offer on the file's
 * account [7.4, 7.5.1, 7.5.2b]. The interview and the risk evaluation are the
 * other half, held by Recruitment's own rules.
 */
export function offerBlockers(file: ScreeningFile | null): string[] {
  if (!file) return ["No screening file has been opened yet (7.4a)"];
  if (file.status === "unsuccessful") return ["Screening was unsuccessful"];
  if (file.status === "withdrawn") return ["The screening file was withdrawn"];
  const out: string[] = [];
  if (file.status === "adverse_finding" || file.status === "risk_acceptance_required") {
    out.push("A finding on the file is waiting for Higher Management's decision (7.4f)");
  }
  if (!isGroupSatisfied(file, "preliminary")) out.push("Preliminary checks incomplete (7.4)");
  if (!file.controllerReview1At) out.push("Awaiting the controller's review of limited screening (7.5.2b)");
  return out;
}

/**
 * The online checks the onboarding checklist confirms — SIA status, right to
 * work, Creditsafe, sanctions — read straight off the file.
 */
export function onlineChecksOnFile(file: ScreeningFile | null): boolean {
  return Boolean(file && isGroupSatisfied(file, "preliminary") && isGroupSatisfied(file, "legal"));
}

/**
 * The file's routine status, from its checks and reviews. A submitted review
 * holds until the controller acts; an exception holds until a decision.
 */
export function deriveStatus(file: ScreeningFile): VettingStatus {
  if (EXCEPTION_STATUSES.includes(file.status)) return file.status;
  if (file.controllerReview2At) return "complete";
  if (file.status === "controller_review_2" || file.status === "controller_review_1") return file.status;
  if (file.controllerReview1At) {
    return fullScreeningBlockers(file).length === 0 ? "full_screening_complete" : "full_screening_in_progress";
  }
  if (limitedScreeningBlockers(file).length === 0) return "limited_screening_complete";
  if (isGroupSatisfied(file, "preliminary")) return "preliminary_checks_complete";
  if (isGroupSatisfied(file, "consent")) {
    const info = file.checks.find((c) => c.group === "preliminary" && c.clause === "7.4b");
    return info?.status === "verified" ? "information_complete" : "consent_captured";
  }
  return "not_started";
}

/** How far through the file is, for a progress bar: settled checks over all. */
export function fileProgress(file: ScreeningFile): { done: number; total: number } {
  const counted = file.checks.filter((c) => !isSignoff(c));
  return {
    done: counted.filter((c) => c.status === "verified" || c.status === "not_applicable").length,
    total: counted.length,
  };
}

/** Whose move it is on a file, in a sentence. */
export function nextMove(file: ScreeningFile): string {
  switch (file.status) {
    case "controller_review_1":
      return "Controller to review limited screening";
    case "controller_review_2":
      return "Controller to review the completed file";
    case "complete":
      return "Complete";
    case "risk_acceptance_required":
      return "Risk finding — representation, then Higher Management decides";
    case "statutory_declaration_required":
      return "Statutory declaration to be obtained";
    case "adverse_finding":
      return "Adverse finding — representation, then Higher Management decides";
    case "time_expired":
      return "Time expired — conditional employment must cease";
    case "withdrawn":
      return "Withdrawn";
    case "unsuccessful":
      return "Screening unsuccessful — file kept for 12 months";
    default:
      if (!file.controller) return "Administrator to assign a controller";
      if (!file.controllerReview1At) {
        return limitedScreeningBlockers(file).length === 0
          ? "Administrator to submit for limited review"
          : "Administrator: preliminary checks and 3-year history";
      }
      return fullScreeningBlockers(file).length === 0
        ? "Administrator to submit the completed file"
        : "Administrator: verify the rest of the history";
  }
}
