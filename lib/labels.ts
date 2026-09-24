import type {
  CheckStatus,
  ControlId,
  InterviewStage,
  RecruitmentStage,
  RequirementStatus,
  Role,
  Severity,
  VettingStatus,
} from "./types";

/**
 * The two Control teams. The split is for workload and communication — each
 * runs its own WhatsApp group — not by client, geography or contract type, so
 * officers and tasks can be rebalanced between them freely.
 */
export const CONTROL_LABELS: Record<ControlId, { name: string; alias: string }> = {
  alpha: { name: "Control Alpha", alias: "Control 3" },
  bravo: { name: "Control Bravo", alias: "Control 2" },
};

export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  received: "Received",
  pool_check: "Pool check",
  covered_internally: "Covered internally",
  released_to_sourcing: "Released to sourcing",
  allocated: "Candidate allocated",
  filled: "Filled",
  cancelled: "Cancelled",
};

/** Ordered — this array is the pipeline order used by the funnel and boards. */
export const RECRUITMENT_STAGE_ORDER: RecruitmentStage[] = [
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
  "deployed",
  "confirmed_employment",
];

export const RECRUITMENT_STAGE_LABELS: Record<RecruitmentStage, string> = {
  sourcing: "Sourcing",
  shortlisted: "Shortlisted",
  invited: "Application invited",
  application_received: "Application received",
  application_complete: "Application complete",
  first_interview: "First interview (Recruitment)",
  second_interview: "Second interview (HR Manager)",
  additional_interview: "Additional interview (client)",
  conditional_offer: "Conditional offer",
  welcome_pack: "Welcome pack issued",
  signed_docs_complete: "Signed documents complete",
  onboarding_complete: "Onboarding complete",
  deployed: "Deployed to site",
  confirmed_employment: "Confirmed employment",
  withdrawn: "Withdrawn",
};

export const VETTING_STATUS_LABELS: Record<VettingStatus, string> = {
  not_started: "Not started",
  consent_captured: "Consent captured",
  information_complete: "Information complete",
  preliminary_checks_complete: "Preliminary checks complete",
  limited_screening_complete: "Limited screening complete",
  controller_review_1: "Awaiting controller review (limited)",
  full_screening_in_progress: "Full screening in progress",
  full_screening_complete: "Full screening complete",
  controller_review_2: "Awaiting controller review (full)",
  risk_acceptance_required: "Risk acceptance required",
  statutory_declaration_required: "Statutory declaration required",
  adverse_finding: "Adverse finding — representation invited",
  time_expired: "Time expired",
  withdrawn: "Withdrawn",
  complete: "Complete",
  unsuccessful: "Unsuccessful",
};

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  not_started: "Not started",
  requested: "Requested",
  chased: "Chased",
  received: "Received",
  verified: "Verified",
  not_applicable: "Not applicable",
  failed: "Failed",
};

export const ROLE_LABELS: Record<Role, string> = {
  control: "Control",
  operations_manager: "Operations Manager",
  recruitment: "Recruitment",
  recruitment_manager: "HR Manager",
  admin_officer: "Admin Officer",
  admin_manager: "Admin Manager",
  finance_officer: "Finance Officer",
  vetting_admin: "Screening Administrator",
  vetting_controller: "Screening Controller",
  top_management: "Higher Management",
  auditor: "Auditor",
  sales: "Sales",
  client: "Client",
  officer: "Officer",
};

export const INTERVIEW_STAGE_LABELS: Record<InterviewStage, string> = {
  first: "First",
  second: "Second",
  additional: "Additional",
};

/**
 * Status colours are reserved and always ship with a label or icon, never
 * colour alone. The glyph is the secondary channel.
 */
export const SEVERITY_META: Record<
  Severity,
  { label: string; glyph: string; color: string; wash: string }
> = {
  good: { label: "On track", glyph: "●", color: "var(--status-good)", wash: "var(--wash-good)" },
  warning: { label: "Watch", glyph: "▲", color: "var(--status-warning)", wash: "var(--wash-warning)" },
  serious: { label: "At risk", glyph: "▲", color: "var(--status-serious)", wash: "var(--wash-serious)" },
  critical: { label: "Critical", glyph: "■", color: "var(--status-critical)", wash: "var(--wash-critical)" },
  neutral: { label: "—", glyph: "○", color: "var(--text-muted)", wash: "var(--wash-neutral)" },
};

export const SOURCE_LABELS = {
  previous_enquiry: "Previous enquiry (WhatsApp / email)",
  existing_indeed: "Existing Indeed application",
  new_indeed_ad: "New Indeed advert",
  referral: "Referral",
} as const;
