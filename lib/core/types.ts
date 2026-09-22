/**
 * The shared spine.
 *
 * These types belong to the engines described in docs/platform/02, not to any
 * one department. The rule that keeps the platform from duplicating itself:
 *
 *   A domain may not write a fact it does not own. It reads it.
 *
 * The single-source-of-truth register in docs/platform/02 §3 names the owner of
 * every fact. Domain-specific types (candidates, screening files) stay in
 * lib/types.ts and reference these.
 */

// ---------------------------------------------------------------------------
// Departments — how the business is organised, and how the platform navigates
// ---------------------------------------------------------------------------

export type DepartmentId =
  | "control"
  | "recruitment"
  | "vetting"
  | "compliance"
  | "operations"
  | "quality"
  | "account_management"
  | "administration";

// ---------------------------------------------------------------------------
// Identity — one person, for life
// ---------------------------------------------------------------------------

/**
 * States of one person record, not separate records in separate modules.
 *
 * Rehire is the case that proves the design: a returning officer keeps their
 * screening history, their previous assignments and their PIN lineage rather
 * than being typed in again as a stranger.
 */
export type PersonLifecycle =
  | "enquiry"
  | "applicant"
  | "candidate"
  | "conditional_officer"
  | "confirmed_officer"
  | "leaver"
  | "rehire_candidate";

export interface Person {
  id: string;
  fullName: string;
  lifecycle: PersonLifecycle;
  dateOfBirth: string;
  /** Duplicate-check keys. Held once; every module references personId. */
  nationalInsurance: string | null;
  email: string;
  phone: string;
  firstContactAt: string;
}

// ---------------------------------------------------------------------------
// Places — client, site, post
// ---------------------------------------------------------------------------

/**
 * A post is the thing that needs an officer and the thing a client pays for.
 * The rota fills posts, not sites.
 *
 * Post requirements are how a client's contractual vetting terms reach a
 * screening file automatically, instead of being remembered by whoever raised
 * the requirement.
 */
export interface Post {
  id: string;
  siteId: string;
  name: string;
  /** e.g. "Mon-Fri 1900-0700". Human-readable; the assignments carry the truth. */
  pattern: string;
  requiresSiaLicence: boolean;
  screeningPeriodYears: 5 | 10;
  /** Hourly check calls expected on this post, per the client's instructions. */
  checkCallsRequired: boolean;
  /** Lone working, which raises the welfare obligation. */
  loneWorking: boolean;
  /**
   * Whether an officer can get a mobile signal at this post.
   *
   * Some sites have none. That changes the whole contact model rather than
   * degrading it, per the confirmed process: the officer books on BEFORE going
   * in, the helpdesk emails the client to say the officer has arrived and has
   * no signal, and the client then holds contact with them on the site phone.
   * If the client cannot reach the officer, they tell us and somebody attends.
   *
   * It is a property of the post and not of the shift, which is why it lives
   * here. Getting this wrong is not cosmetic: without it the board shows a
   * missed check call every hour, all night, on a post where the officer
   * physically cannot make one — and a board that is always red is a board
   * nobody reads.
   */
  mobileSignal: boolean;
}

// ---------------------------------------------------------------------------
// Assignment — the join between HR and operations
// ---------------------------------------------------------------------------

export type AssignmentState =
  | "draft"
  | "published"
  | "amended"
  | "cancelled"
  | "completed";

/**
 * person x post x time range.
 *
 * The single choke point that makes compliance real: an assignment cannot be
 * published for a person who is not deployable (lib/core/deployability.ts).
 * A rota is a projection of these over a date range, never a second table.
 */
export interface Assignment {
  id: string;
  personId: string;
  postId: string;
  startsAt: string;
  endsAt: string;
  state: AssignmentState;
  publishedAt: string | null;
  /** Amendment history survives. "Multiple shift changes" means exactly this. */
  amendments: AssignmentAmendment[];
}

export interface AssignmentAmendment {
  at: string;
  by: string;
  /** What changed, in the words the person making the change would use. */
  change: string;
  reason: string;
  /** Who it moved from, where the change was a swap. */
  previousPersonId: string | null;
}

// ---------------------------------------------------------------------------
// Live operations — evidence that the shift happened
// ---------------------------------------------------------------------------

/**
 * How the officer made contact. Sets how much the record is worth as evidence.
 *
 * Officers use their own phones, and some sites provide a phone at the post.
 * The site phone is the stronger record of the two, because a call from the
 * site's own line is evidence of being at the site; a mobile is evidence of
 * having a mobile.
 */
export type ContactChannel =
  | "app"
  | "phone"
  | "site_phone"
  | "sms"
  | "qr"
  | "supervisor";

export interface BookOn {
  assignmentId: string;
  at: string;
  channel: ContactChannel;
  /** Only where the channel carries it and consent covers it. See E6. */
  locationVerified: boolean;
}

export interface CheckCall {
  id: string;
  assignmentId: string;
  at: string;
  channel: ContactChannel;
  /** Recorded so a pattern of "all well" that never varies is visible. */
  allWell: boolean;
  note: string | null;
}

/**
 * An attempt by Control to reach an officer who has missed a check call.
 *
 * The escalation ladder advances on these rather than on a timer: a missed call
 * triggers the moment it crosses the hour, and the step Control is on is
 * decided by what has already been tried and failed. Recording the attempts is
 * therefore not admin — it is what drives the escalation, and it is the record
 * that shows the duty of care was discharged.
 */
export interface ContactAttempt {
  id: string;
  assignmentId: string;
  at: string;
  by: string;
  channel: ContactChannel;
  reached: boolean;
  note: string | null;
}

export type IncidentSeverity = "log_only" | "notable" | "serious";

export interface Incident {
  id: string;
  assignmentId: string;
  at: string;
  severity: IncidentSeverity;
  summary: string;
  reportedBy: string;
  clientNotified: boolean;
}

// ---------------------------------------------------------------------------
// Forms — one definition and response model
// ---------------------------------------------------------------------------

export type FieldKind =
  | "text"
  | "number"
  | "boolean"
  | "choice"
  | "score"
  | "date"
  | "signature"
  | "photo"
  | "document";

export interface FormField {
  id: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  /** Answers are typed, so they feed KPIs without anyone re-keying them. */
  feedsKpi?: string;
}

/**
 * A form is data: who fills it, when, and what happens to the answers.
 *
 * Definitions are versioned and a response records the version it answered, so
 * changing the inspection form does not retrospectively change last quarter's
 * results.
 */
export interface FormDefinition {
  id: string;
  version: number;
  title: string;
  purpose: string;
  department: DepartmentId;
  filledBy: "candidate" | "officer" | "supervisor" | "staff" | "client";
  /** What creates a response: a stage, a timer, an event, or a person. */
  trigger: string;
  fields: FormField[];
  /** Tasks this form raises when a field answers a certain way. */
  raisesTasks: string | null;
}

export interface FormResponse {
  id: string;
  definitionId: string;
  definitionVersion: number;
  subjectRef: string;
  submittedBy: string;
  submittedAt: string;
  answers: Record<string, string | number | boolean>;
}

// ---------------------------------------------------------------------------
// Documents — one store, one expiry engine
// ---------------------------------------------------------------------------

export type DocumentVerification =
  | "not_supplied"
  | "supplied"
  | "rejected"
  | "verified"
  | "expired";

/**
 * A document type carries its own rules. The retention rules are the ones that
 * matter most: a criminal record certificate's outcome and date are retained,
 * the certificate itself is not.
 */
export interface DocumentType {
  id: string;
  label: string;
  department: DepartmentId;
  /** Whether the type has an expiry the scheduler should warn on. */
  expires: boolean;
  /** Whether a copy may be kept at all, or only the outcome. */
  copyRetained: boolean;
  retentionNote: string;
  /** BS 7858 clause, where the type exists to satisfy the standard. */
  clause?: string;
}

export interface DocumentRecord {
  id: string;
  typeId: string;
  /** Who or what it belongs to: a person, a site, a client, a contract. */
  ownerRef: string;
  ownerName: string;
  verification: DocumentVerification;
  suppliedAt: string | null;
  verifiedAt: string | null;
  /** Null where the type does not expire. */
  expiresAt: string | null;
}

// ---------------------------------------------------------------------------
// Work — one task model
// ---------------------------------------------------------------------------

/**
 * Recurrence is a rule on the definition, so a daily departmental workflow is
 * configured once rather than re-created by hand every morning.
 */
export type Recurrence = "none" | "daily" | "weekly" | "monthly" | "quarterly";

export interface WorkItemDefinition {
  id: string;
  title: string;
  department: DepartmentId;
  recurrence: Recurrence;
  /** Working days from creation. Our number, editable in Admin. */
  slaDays: number;
  /** Role the work falls to, never a named person — see lib/roles.ts. */
  ownerRole: string;
  escalatesTo: string;
}

// ---------------------------------------------------------------------------
// Events — one append-only log
// ---------------------------------------------------------------------------

/**
 * Everything that happens is an event. Every KPI is a query over this log, so
 * no module keeps counters and no two screens can disagree.
 *
 * The actor carries the role they were working as, which is why the sign-in
 * asks for it: "who did what, acting as what" is answerable.
 */
export interface EventRecord {
  id: string;
  at: string;
  type: string;
  actorName: string;
  actorRole: string;
  subjectRef: string;
  subjectName: string;
  department: DepartmentId;
  detail: string;
}
