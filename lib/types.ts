/**
 * Domain types for the HR portal.
 *
 * Two status tracks are modelled deliberately separately, per the agreed design
 * in docs/proposal/02 and 03: recruitment progress and BS 7858 vetting
 * completion. They are linked only by the two gates in lib/bs7858.ts.
 */

// ---------------------------------------------------------------------------
// Organisation
// ---------------------------------------------------------------------------

/** The two operational controls. Both names are in active use internally. */
export type ControlId = "alpha" | "bravo";

export interface Control {
  id: ControlId;
  /** Primary label, e.g. "Control Alpha". */
  name: string;
  /** The numeric alias the team also uses, e.g. "Control 3". */
  alias: string;
}

/**
 * Screening period, in years. Drives the full-screening deadline: 12 weeks for
 * a 5-year period, 16 weeks for 10-year [BS 7858:2019, 7.6]. Set from the
 * client contract when Control raises the requirement, not guessed later.
 */
export type ScreeningPeriodYears = 5 | 10;

export interface Client {
  id: string;
  name: string;
  control: ControlId;
  screeningPeriodYears: ScreeningPeriodYears;
}

export interface Site {
  id: string;
  clientId: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Track A — requirements
// ---------------------------------------------------------------------------

export type RequirementStatus =
  | "received"
  | "pool_check"
  | "covered_internally"
  | "released_to_sourcing"
  | "allocated"
  | "filled";

export interface Requirement {
  id: string;
  reference: string;
  clientId: string;
  siteId: string;
  control: ControlId;
  post: string;
  headcountRequired: number;
  headcountAllocated: number;
  shiftPattern: string;
  /** Date the client needs cover to start. */
  startDate: string;
  status: RequirementStatus;
  receivedAt: string;
  /** Timestamped Control -> HR handover. Replaces the Sourcing Sheet. */
  releasedToSourcingAt: string | null;
  owner: string | null;
}

// ---------------------------------------------------------------------------
// Track B — recruitment
// ---------------------------------------------------------------------------

export type RecruitmentStage =
  | "sourcing"
  | "shortlisted"
  | "invited"
  | "application_received"
  | "application_complete"
  | "interviewed"
  | "conditional_offer"
  | "welcome_pack"
  | "signed_docs_complete"
  | "onboarding_complete"
  | "confirmed_employment"
  | "withdrawn";

// ---------------------------------------------------------------------------
// Track C — vetting (BS 7858:2019)
// ---------------------------------------------------------------------------

export type VettingStatus =
  | "not_started"
  | "consent_captured"
  | "information_complete"
  | "preliminary_checks_complete"
  | "limited_screening_complete"
  | "controller_review_1"
  | "full_screening_in_progress"
  | "full_screening_complete"
  | "controller_review_2"
  | "risk_acceptance_required"
  | "statutory_declaration_required"
  | "adverse_finding"
  | "time_expired"
  | "withdrawn";

export type CheckStatus =
  | "not_started"
  | "requested"
  | "chased"
  | "received"
  | "verified"
  | "not_applicable"
  | "failed";

/**
 * The check groups follow the structure of the standard's own verification
 * progress sheet (Annex A, Form 2), so a file reads the same way as the paper
 * record an auditor will recognise.
 */
export type CheckGroup =
  | "consent"
  | "preliminary"
  | "history"
  | "criminality"
  | "legal"
  | "signoff"
  | "exception";

export interface Check {
  id: string;
  group: CheckGroup;
  label: string;
  /** BS 7858:2019 clause this check exists to satisfy, for the audit trail. */
  clause: string;
  status: CheckStatus;
  owner: string | null;
  /** Form 2 columns: requests are logged, which is also extension evidence. */
  firstRequestSentAt: string | null;
  secondRequestSentAt: string | null;
  confirmedAt: string | null;
}

/** Request-type codes taken verbatim from Annex A, Form 2. */
export type RequestCode =
  | "WR"   // work reference
  | "ER"   // education reference
  | "TR"   // trade reference
  | "AR"   // accountant's reference
  | "DR"   // documentation request
  | "FI"   // further information request
  | "SDR"  // statutory declaration request
  | "CL"   // chaser letter
  | "RA";  // executive risk of acceptance

export interface ScreeningFile {
  id: string;
  candidateId: string;
  screeningPeriodYears: ScreeningPeriodYears;
  status: VettingStatus;
  /** Set when Gate 1 clears. Starts the 12 or 16 week clock [7.6]. */
  conditionalEmploymentStart: string | null;
  /** Single extension of up to 4 weeks, top management approved [7.6]. */
  extensionWeeks: 0 | 4;
  extensionApprovedBy: string | null;
  administrator: string | null;
  /** Must not be the administrator, and never the subject [6.1, 7.5.2b]. */
  controller: string | null;
  controllerReview1At: string | null;
  controllerReview2At: string | null;
  checks: Check[];
  /** Unverified days still outstanding across the screening period [7.7]. */
  unverifiedDays: number;
  /** Gaps over 31 days that still need documentary evidence [7.7]. */
  gapsOver31Days: number;
  outstandingSummary: string;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface Candidate {
  id: string;
  /** Identity spine: the same Person may be an applicant, officer or leaver. */
  personId: string;
  fullName: string;
  /** Exactly as shown on the SIA badge, derived from the verified register. */
  siaBadgeName: string | null;
  siaLicenceNumber: string | null;
  siaLicenceExpiry: string | null;
  email: string;
  phone: string;
  requirementId: string | null;
  stage: RecruitmentStage;
  stageSince: string;
  owner: string;
  source: "previous_enquiry" | "existing_indeed" | "new_indeed_ad" | "referral";
  screeningFileId: string | null;
  /** Assigned by the portal at onboarding, not typed by hand. */
  pin: string | null;
}

export interface Officer {
  id: string;
  personId: string;
  siaBadgeName: string;
  pin: string;
  siaLicenceNumber: string;
  siaLicenceExpiry: string;
  control: ControlId;
  available: boolean;
  /** Deployability is driven by the screening file, never set by hand. */
  employmentState: "conditional" | "confirmed" | "suspended";
}

// ---------------------------------------------------------------------------
// Work
// ---------------------------------------------------------------------------

export type TaskKind =
  | "chase_application"
  | "chase_documents"
  | "chase_signatures"
  | "chase_reference"
  | "record_check"
  | "controller_review"
  | "onboarding_step"
  | "approval"
  | "disposal";

export interface Task {
  id: string;
  kind: TaskKind;
  title: string;
  subjectName: string;
  subjectHref: string;
  owner: string;
  dueAt: string;
  /** Agreed internal service level for this task type, in working days. */
  slaDays: number;
  createdAt: string;
  blocked: boolean;
  blockedReason: string | null;
}

export type Role =
  | "control"
  | "recruitment"
  | "recruitment_manager"
  | "vetting_admin"
  | "vetting_controller"
  | "top_management"
  | "auditor";

export interface User {
  id: string;
  name: string;
  role: Role;
}

/** Severity shared by the clock, tasks and tiles. Maps to the status palette. */
export type Severity = "good" | "warning" | "serious" | "critical" | "neutral";
