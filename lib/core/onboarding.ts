/**
 * The onboarding checklist, as rules.
 *
 * From conditional offer to onboarding complete: docs/proposal/03 stages B7 to
 * B10 and the eight-item checklist in its §6. Each step belongs to the pipeline
 * stage it is done in, and a candidate cannot leave that stage until every
 * step in it is done. That is the whole gate; there is no separate "ready"
 * flag to forget.
 *
 * Pure, so the test script reaches it without a database and the screen and
 * the server action cannot disagree.
 */

import { CHASERS } from "@/lib/sla";
import type { RecruitmentStage, Role } from "@/lib/types";

export type OnboardingStepKey =
  | "risk_evaluated"
  | "offer_issued"
  | "pack_issued"
  | "contract_signed"
  | "confidentiality_signed"
  | "covenant_signed"
  | "handbook_acknowledged"
  | "bank_details_received"
  | "next_of_kin_recorded"
  | "online_checks_confirmed"
  | "sia_licence_recorded"
  | "pin_assigned"
  | "indel_profile"
  | "watch_list"
  | "maps"
  | "casper"
  | "control_notified";

/**
 * How a step is completed.
 *   tick        — a confirmation, nothing to capture
 *   note        — a confirmation that must say something (the risk evaluation)
 *   next_of_kin — captures next-of-kin details onto the person
 *   online_checks — confirmed by Vetting, or read from the screening file
 *   sia_licence — records the licence, which the Watch List then runs against
 *   pin         — allocates the next free PIN and opens the employment record
 *   automatic   — the platform does it on the move to the next stage
 */
export type StepKind = "tick" | "note" | "next_of_kin" | "online_checks" | "sia_licence" | "pin" | "automatic";

export interface StepSpec {
  key: OnboardingStepKey;
  /** The stage it is done in, and which it holds the candidate in until done. */
  stage: RecruitmentStage;
  label: string;
  detail: string;
  owner: string;
  roles: Role[];
  kind: StepKind;
  clause?: string;
  /** Still done by hand today, and to be retired once the platform replaces it. */
  retiring?: boolean;
  /** Steps that have to be done first, in the order the standard asks for them. */
  after?: OnboardingStepKey[];
}

const RECRUITMENT: Role[] = ["recruitment", "recruitment_manager"];
const VETTING: Role[] = ["vetting_admin", "vetting_controller"];

export const ONBOARDING_STEPS: StepSpec[] = [
  // --- B7 Conditional offer --------------------------------------------------
  {
    key: "risk_evaluated",
    stage: "conditional_offer",
    label: "Risk in the intended role evaluated and documented",
    detail: "Say what the role involves and why the risk is acceptable. Required before a conditional offer stands.",
    owner: "Recruitment",
    roles: RECRUITMENT,
    kind: "note",
    clause: "7.5.1a",
  },
  {
    key: "offer_issued",
    stage: "conditional_offer",
    label: "Conditional offer issued",
    detail: "The offer states that confirmed employment depends on screening completing within the period allowed, and ends if it does not.",
    owner: "Recruitment",
    roles: RECRUITMENT,
    kind: "tick",
    clause: "7.5.2",
    // No offer of conditional employment before the risk in the role has been
    // evaluated and documented [7.5.1a].
    after: ["risk_evaluated"],
  },
  {
    key: "pack_issued",
    stage: "conditional_offer",
    label: "Welcome pack sent",
    detail: "Employment Contract, Confidentiality & Disclosure, Restrictive Covenant and the Employee Handbook. Same day as the offer.",
    owner: "Recruitment",
    roles: RECRUITMENT,
    kind: "tick",
    after: ["offer_issued"],
  },

  // --- B8/B9 Welcome pack and signatures --------------------------------------
  {
    key: "contract_signed",
    stage: "welcome_pack",
    label: "Employment contract signed",
    detail: "Including the acknowledgement that confirmation depends on screening.",
    owner: "Recruitment",
    roles: RECRUITMENT,
    kind: "tick",
    clause: "7.5.2",
  },
  {
    key: "confidentiality_signed",
    stage: "welcome_pack",
    label: "Confidentiality & Disclosure signed",
    detail: "",
    owner: "Recruitment",
    roles: RECRUITMENT,
    kind: "tick",
  },
  {
    key: "covenant_signed",
    stage: "welcome_pack",
    label: "Restrictive Covenant signed",
    detail: "",
    owner: "Recruitment",
    roles: RECRUITMENT,
    kind: "tick",
  },
  {
    key: "handbook_acknowledged",
    stage: "welcome_pack",
    label: "Employee Handbook receipt acknowledged",
    detail: "",
    owner: "Recruitment",
    roles: RECRUITMENT,
    kind: "tick",
  },
  {
    key: "bank_details_received",
    stage: "welcome_pack",
    label: "Bank details received for payroll",
    detail: "Passed to payroll. The account details themselves are not kept in the portal.",
    owner: "Recruitment",
    roles: RECRUITMENT,
    kind: "tick",
  },
  {
    key: "next_of_kin_recorded",
    stage: "welcome_pack",
    label: "Next of kin recorded",
    detail: "Saved to the person's record, where Control finds it in an emergency.",
    owner: "Recruitment",
    roles: RECRUITMENT,
    kind: "next_of_kin",
  },

  // --- B10 Onboarding: the eight-item checklist --------------------------------
  {
    key: "online_checks_confirmed",
    stage: "signed_docs_complete",
    label: "Online checks recorded on the screening file",
    detail: "SIA status, right to work, Creditsafe, UK sanctions and OFAC. Done at preliminary checks, so this confirms rather than repeats them.",
    owner: "Screening Administrator",
    roles: VETTING,
    kind: "online_checks",
    clause: "7.4",
  },
  {
    key: "sia_licence_recorded",
    stage: "signed_docs_complete",
    label: "SIA licence recorded, name exactly as on the badge",
    detail: "One verified spelling, used everywhere after this — and the number the Watch List checks.",
    owner: "Recruitment",
    roles: RECRUITMENT,
    kind: "sia_licence",
    clause: "7.4c1",
  },
  {
    key: "pin_assigned",
    stage: "signed_docs_complete",
    label: "PIN assigned",
    detail: "The next free PIN, unique and never reused. Opens the officer record.",
    owner: "Recruitment",
    roles: RECRUITMENT,
    kind: "pin",
  },
  {
    key: "indel_profile",
    stage: "signed_docs_complete",
    label: "INDEL profile created",
    detail: "Still done by hand. Retired once the portal is in live use — listed so nobody forgets to stop.",
    owner: "Recruitment",
    roles: RECRUITMENT,
    kind: "tick",
    retiring: true,
  },
  {
    key: "watch_list",
    stage: "signed_docs_complete",
    label: "Added to the SIA Watch List",
    detail: "Checked twice daily for officers who have gone inactive.",
    owner: "Recruitment",
    roles: RECRUITMENT,
    kind: "tick",
  },
  {
    key: "maps",
    stage: "signed_docs_complete",
    label: "Added to Google Maps",
    detail: "So Control can see the officer's area when deploying.",
    owner: "Recruitment",
    roles: RECRUITMENT,
    kind: "tick",
  },
  {
    key: "casper",
    stage: "signed_docs_complete",
    label: "Hired in Casper",
    detail: "From the submitted application.",
    owner: "Recruitment",
    roles: RECRUITMENT,
    kind: "tick",
  },
  {
    key: "control_notified",
    stage: "onboarding_complete",
    label: "Control Team notified",
    detail: "Automatic on onboarding complete: a task in the right Control team's queue, instead of the WhatsApp message.",
    owner: "Portal",
    roles: [],
    kind: "automatic",
  },
];

/** The three phases, in order, as shown on the checklist. */
export const ONBOARDING_PHASES: { stage: RecruitmentStage; title: string; target: string }[] = [
  { stage: "conditional_offer", title: "Offer", target: "Within 1 working day of the interviews clearing" },
  { stage: "welcome_pack", title: "Welcome pack and signatures", target: "Returned same or next day. Chase at 48 hours and 5 days; escalate at 10" },
  { stage: "signed_docs_complete", title: "Onboarding", target: "Within 2 working days of the signed documents" },
];

/** Stages from which the checklist is shown at all. */
export const ONBOARDING_STAGES: RecruitmentStage[] = [
  "conditional_offer",
  "welcome_pack",
  "signed_docs_complete",
  "onboarding_complete",
  "deployed",
  "confirmed_employment",
];

export function stepSpec(key: string): StepSpec | undefined {
  return ONBOARDING_STEPS.find((s) => s.key === key);
}

/**
 * Everything done: what was recorded, plus the online checks where the
 * screening file already shows them — preliminary checks and right to work
 * verified (onlineChecksOnFile in lib/core/screening.ts).
 */
export function doneSteps(recorded: OnboardingStepKey[], onlineChecksOnFile: boolean): Set<OnboardingStepKey> {
  const done = new Set(recorded);
  if (onlineChecksOnFile) done.add("online_checks_confirmed");
  return done;
}

/** Steps that must be done before this one, and are not yet. */
export function waitingOn(spec: StepSpec, done: Set<OnboardingStepKey>): StepSpec[] {
  return (spec.after ?? []).filter((k) => !done.has(k)).map((k) => stepSpec(k)!);
}

/** The steps still to do before a candidate may leave this stage. */
export function outstandingFor(stage: RecruitmentStage, done: Set<OnboardingStepKey>): StepSpec[] {
  return ONBOARDING_STEPS.filter((s) => s.stage === stage && s.kind !== "automatic" && !done.has(s.key));
}

/**
 * Where the signature chasers are, counted from the day the pack was sent.
 * CHASERS.signatures in lib/sla.ts: chase at 2 and 5 days, escalate at 10.
 */
export function signatureChase(
  packSentAt: Date,
  now = new Date(),
): { daysOut: number; next: string; severity: "good" | "warning" | "serious" | "critical" } {
  const daysOut = Math.floor((now.getTime() - packSentAt.getTime()) / 86_400_000);
  const [first, second] = CHASERS.signatures.days;
  const escalate = CHASERS.signatures.escalateAfterDays;
  if (daysOut >= escalate) return { daysOut, next: "Escalate to the HR Manager", severity: "critical" };
  if (daysOut >= second) return { daysOut, next: `Second chase due · escalate at ${escalate} days`, severity: "serious" };
  if (daysOut >= first) return { daysOut, next: `First chase due · second at ${second} days`, severity: "warning" };
  return { daysOut, next: `First chase at ${first} days if not returned`, severity: "good" };
}

/** SIA licence numbers are 16 digits, shown in groups of four. */
export function normaliseSiaNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 16 ? digits.replace(/(\d{4})(?=\d)/g, "$1 ") : null;
}

export const CONTROL_TEAMS = [
  { id: "alpha", label: "Control Alpha" },
  { id: "bravo", label: "Control Bravo" },
] as const;
