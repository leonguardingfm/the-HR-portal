/**
 * Domain types for the HR portal.
 *
 * Two status tracks are modelled deliberately separately, per the agreed design
 * in docs/proposal/02 and 03: recruitment progress and BS 7858 vetting
 * completion. They are linked only by the gates — two from the standard in
 * lib/bs7858.ts, plus our own deployment gate in lib/policy.ts.
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
  screeningPeriodYears: ScreeningPeriodYears;
  /** Some clients add an interview stage of their own beyond the usual two. */
  requiresAdditionalInterview: boolean;
  /**
   * Whether posts at this client are likely to bring officers into contact
   * with children or vulnerable adults, which may call for a higher level of
   * disclosure [7.7j, Note 6].
   */
  regulatedActivity: boolean;
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
  | "first_interview"
  | "second_interview"
  | "additional_interview"
  | "conditional_offer"
  | "welcome_pack"
  | "signed_docs_complete"
  | "onboarding_complete"
  | "deployed"
  | "confirmed_employment"
  | "withdrawn";

/**
 * Interviews run in up to three stages: a first interview by the recruitment
 * team over the phone, a second with the HR Manager on site or by video, and
 * an additional stage only where a particular site or client requires one.
 * An interview is required before any offer of employment is made [7.3.4].
 */
export type InterviewStage = "first" | "second" | "additional";

export interface Interview {
  id: string;
  candidateId: string;
  stage: InterviewStage;
  interviewer: string;
  heldAt: string;
  outcome: "progress" | "hold" | "reject";
  notes: string;
}

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
  | "withdrawn"
  | "complete"
  | "unsuccessful";

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
  /** Set when Gate 1 clears. Starts the clock [7.6]. */
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
  /** Unique across all officers, allocated by the portal, never reused. */
  pin: string;
  siaLicenceNumber: string;
  siaLicenceExpiry: string;
  /**
   * Which Control team follows this officer up. The split is for workload and
   * communication, not by client, geography or contract type, so it is set per
   * officer and can be rebalanced freely.
   */
  control: ControlId;
  available: boolean;
  /** Deployability is driven by the screening file, never set by hand. */
  employmentState: "conditional" | "confirmed" | "suspended";
  /** Right to work expiry where leave is time-limited. Blocks shifts once passed. */
  rightToWorkExpiry: string | null;
}

/**
 * Where a client keeps its own reference for an officer. We issue the PIN;
 * some sites issue a PRN of their own and the two are recorded against each
 * other so neither side has to look the officer up by name.
 */
export interface SiteReference {
  officerId: string;
  siteId: string;
  prn: string;
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

/**
 * The roles a person can sign in as.
 *
 * A role is a job, not a rank. `finance_officer` is the case that proves it:
 * the person who holds it also sits in higher management, but payment approval
 * follows the role and not the seniority. That separation is the whole point —
 * without it, the second signature on a large payment would be the same person
 * who gave the first, and the approval ladder would only look like a ladder.
 */
export type Role =
  | "control"
  | "operations_manager"
  | "recruitment"
  | "recruitment_manager"
  | "admin_officer"
  | "admin_manager"
  | "finance_officer"
  | "vetting_admin"
  | "vetting_controller"
  | "top_management"
  | "auditor"
  | "sales"
  | "client";

/**
 * A person who uses the portal.
 *
 * `roles` is a list, because people hold more than one and move between teams.
 * Nothing about team size or composition is fixed in code — this is data, set
 * up in Admin, so a new hire or an internal transfer is an edit rather than a
 * release.
 */
export interface User {
  id: string;
  personId: string;
  name: string;
  roles: Role[];
  /** Clause 6.1 and 6.2 evidence, required before a screening role is granted. */
  ownScreeningComplete: boolean;
  confidentialityAgreementOnFile: boolean;
  trainingReviewedAt: string | null;
}

/**
 * Who is signed in and what they are working as right now.
 *
 * People choose their active role at sign-in, so the portal can show which
 * work is being done by whom in real time rather than inferring it.
 */
export interface ActiveSession {
  userId: string;
  name: string;
  activeRole: Role;
  signedInAt: string;
  lastSeenAt: string;
}

/** Severity shared by the clock, tasks and tiles. Maps to the status palette. */
export type Severity = "good" | "warning" | "serious" | "critical" | "neutral";
