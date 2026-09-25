/**
 * Demonstration data. Every person in this file is invented.
 *
 * Stands in for the database until the Phase 1 schema lands, so the navigation
 * and dashboard can be reviewed against realistic numbers. Dates are computed
 * as offsets from today, so the dashboard never looks stale.
 *
 * No real person's name appears here, or anywhere else in the repository. Roles
 * are named in prose and in page copy; people are data.
 *
 * Replaced wholesale by Prisma queries in Phase 1 — no UI component reads
 * anything but the exported selectors at the bottom of this file.
 */

import { requiredInterviewStages } from "../policy";
import type {
  ActiveSession,
  Candidate,
  Check,
  Client,
  Interview,
  Officer,
  Requirement,
  ScreeningFile,
  Site,
  SiteReference,
  Task,
  User,
} from "../types";

const MS_PER_DAY = 86_400_000;
const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * MS_PER_DAY).toISOString();
const daysAgo = (n: number) => iso(-n);
const hoursAgo = (n: number) => iso(-n / 24);
const minutesAgo = (n: number) => iso(-n / 1440);
const daysAhead = (n: number) => iso(n);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * INVENTED PEOPLE. Not the org chart, and not confirmed by anybody.
 *
 * This list previously carried the real team's first names and a comment
 * claiming they were "confirmed". That was wrong twice over: real colleagues do
 * not belong in a repository, and a demonstration fixture must never read as a
 * statement about who does what. Names here are placeholders in a deliberately
 * different style so the two can never be confused again.
 *
 * Who actually holds which role is DATA — `UserRole` rows set up in the portal,
 * plus `RoleDelegation` for cover. That is the whole point of lib/roles.ts
 * containing no names: a new starter or an internal transfer is an edit, not a
 * release. If you find yourself wanting to write a colleague's name in this
 * repository, write the role instead.
 *
 * The shape is what matters below: two people holding both vetting roles and
 * alternating per file, so `canSignOff` in lib/bs7858.ts has something real to
 * refuse.
 */
export const users: User[] = [
  { id: "u1", personId: "hr1", name: "Priya", roles: ["recruitment"], ownScreeningComplete: true, confidentialityAgreementOnFile: true, trainingReviewedAt: daysAgo(120) },
  { id: "u2", personId: "hr2", name: "Joel", roles: ["recruitment"], ownScreeningComplete: true, confidentialityAgreementOnFile: true, trainingReviewedAt: daysAgo(150) },
  { id: "u3", personId: "hr3", name: "Marcus", roles: ["vetting_admin", "vetting_controller"], ownScreeningComplete: true, confidentialityAgreementOnFile: true, trainingReviewedAt: daysAgo(90) },
  { id: "u4", personId: "hr4", name: "Ruth", roles: ["vetting_admin", "vetting_controller"], ownScreeningComplete: true, confidentialityAgreementOnFile: true, trainingReviewedAt: daysAgo(200) },
  { id: "u5", personId: "hr5", name: "Eleanor", roles: ["top_management", "recruitment_manager", "vetting_admin"], ownScreeningComplete: true, confidentialityAgreementOnFile: true, trainingReviewedAt: daysAgo(60) },
  { id: "u6", personId: "ct1", name: "Hannah Brooks", roles: ["control"], ownScreeningComplete: true, confidentialityAgreementOnFile: true, trainingReviewedAt: daysAgo(300) },
  { id: "u7", personId: "ct2", name: "Daniel Okoye", roles: ["control"], ownScreeningComplete: true, confidentialityAgreementOnFile: true, trainingReviewedAt: daysAgo(300) },
  // The Admin department. Demonstration people, like everyone above — who
  // actually holds which role is set up in the portal, not fixed here.
  { id: "u8", personId: "hr6", name: "Kirsty", roles: ["admin_officer"], ownScreeningComplete: true, confidentialityAgreementOnFile: true, trainingReviewedAt: daysAgo(80) },
  { id: "u9", personId: "hr7", name: "Douglas", roles: ["admin_manager", "admin_officer"], ownScreeningComplete: true, confidentialityAgreementOnFile: true, trainingReviewedAt: daysAgo(45) },
  // The case the approval ladder is built around: the Finance Officer also sits
  // in higher management. Because the ladder is written in terms of ROLES, the
  // rung above the Finance Officer still needs a different person — so this row
  // is what makes the separation testable rather than theoretical.
  { id: "u10", personId: "hr8", name: "Vivien", roles: ["finance_officer", "top_management"], ownScreeningComplete: true, confidentialityAgreementOnFile: true, trainingReviewedAt: daysAgo(30) },
  // The Operations Manager: Control's manager, and step 3 of the escalation
  // ladder by name. A login so what that role sees can be reviewed.
  { id: "u11", personId: "ct3", name: "Olivia", roles: ["operations_manager"], ownScreeningComplete: true, confidentialityAgreementOnFile: true, trainingReviewedAt: daysAgo(100) },
];

export const userById = (id: string) => users.find((u) => u.id === id);
export const userByName = (name: string) =>
  users.find((u) => u.name.toLowerCase() === name.trim().toLowerCase());

/**
 * Who is signed in and working as what, right now.
 *
 * Demonstration data. Real presence needs the Phase 1 backend — a browser
 * cannot see other people's sessions — but the shape is what the API will
 * return.
 */
export const activeSessions: ActiveSession[] = [
  { userId: "u1", name: "Priya", activeRole: "recruitment", signedInAt: hoursAgo(3), lastSeenAt: minutesAgo(2) },
  { userId: "u3", name: "Marcus", activeRole: "vetting_admin", signedInAt: hoursAgo(5), lastSeenAt: minutesAgo(1) },
  { userId: "u4", name: "Ruth", activeRole: "vetting_controller", signedInAt: hoursAgo(1), lastSeenAt: minutesAgo(9) },
  { userId: "u6", name: "Hannah Brooks", activeRole: "control", signedInAt: hoursAgo(7), lastSeenAt: minutesAgo(4) },
];

// ---------------------------------------------------------------------------
// Clients and sites
// ---------------------------------------------------------------------------

export const clients: Client[] = [
  { id: "c1", name: "Meridian Logistics", screeningPeriodYears: 5, requiresAdditionalInterview: false, regulatedActivity: false },
  { id: "c2", name: "Northgate Retail Park", screeningPeriodYears: 5, requiresAdditionalInterview: false, regulatedActivity: false },
  { id: "c3", name: "Halton Data Centre", screeningPeriodYears: 5, requiresAdditionalInterview: true, regulatedActivity: false },
  { id: "c4", name: "Riverside Estates", screeningPeriodYears: 5, requiresAdditionalInterview: false, regulatedActivity: false },
  { id: "c5", name: "Clearwater Pharma", screeningPeriodYears: 5, requiresAdditionalInterview: true, regulatedActivity: true },
];

export const sites: Site[] = [
  { id: "s1", clientId: "c1", name: "Meridian — Depot 4" },
  { id: "s2", clientId: "c1", name: "Meridian — Depot 7" },
  { id: "s3", clientId: "c2", name: "Northgate — Main concourse" },
  { id: "s4", clientId: "c3", name: "Halton — DC1 perimeter" },
  { id: "s5", clientId: "c4", name: "Riverside — Block A concierge" },
  { id: "s6", clientId: "c5", name: "Clearwater — Manufacturing gate" },
];

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

export const requirements: Requirement[] = [
  {
    id: "r1", reference: "REQ-1042", clientId: "c1", siteId: "s1", control: "alpha",
    post: "Static guard", headcountRequired: 3, headcountAllocated: 1,
    shiftPattern: "4 on 4 off, nights", startDate: daysAhead(12),
    status: "released_to_sourcing", receivedAt: daysAgo(21),
    releasedToSourcingAt: daysAgo(19), owner: "Priya",
  },
  {
    id: "r2", reference: "REQ-1043", clientId: "c3", siteId: "s4", control: "bravo",
    post: "Data centre officer", headcountRequired: 2, headcountAllocated: 0,
    shiftPattern: "Days, Mon–Fri", startDate: daysAhead(4),
    status: "released_to_sourcing", receivedAt: daysAgo(34),
    releasedToSourcingAt: daysAgo(31), owner: "Joel",
  },
  {
    id: "r3", reference: "REQ-1045", clientId: "c2", siteId: "s3", control: "alpha",
    post: "Retail security officer", headcountRequired: 1, headcountAllocated: 1,
    shiftPattern: "Weekends", startDate: daysAhead(20),
    status: "allocated", receivedAt: daysAgo(14),
    releasedToSourcingAt: daysAgo(13), owner: "Priya",
  },
  {
    id: "r4", reference: "REQ-1046", clientId: "c4", siteId: "s5", control: "bravo",
    post: "Concierge", headcountRequired: 2, headcountAllocated: 2,
    shiftPattern: "Rotating 12s", startDate: daysAhead(30),
    status: "filled", receivedAt: daysAgo(40),
    releasedToSourcingAt: daysAgo(38), owner: "Joel",
  },
  {
    id: "r5", reference: "REQ-1047", clientId: "c5", siteId: "s6", control: "alpha",
    post: "Gatehouse officer", headcountRequired: 4, headcountAllocated: 1,
    shiftPattern: "Continental", startDate: daysAgo(3),
    status: "released_to_sourcing", receivedAt: daysAgo(46),
    releasedToSourcingAt: daysAgo(44), owner: "Priya",
  },
  {
    id: "r6", reference: "REQ-1048", clientId: "c1", siteId: "s2", control: "alpha",
    post: "Mobile patrol", headcountRequired: 1, headcountAllocated: 0,
    shiftPattern: "Nights", startDate: daysAhead(8),
    status: "pool_check", receivedAt: daysAgo(2),
    releasedToSourcingAt: null, owner: null,
  },
  {
    id: "r7", reference: "REQ-1049", clientId: "c3", siteId: "s4", control: "bravo",
    post: "Data centre officer", headcountRequired: 1, headcountAllocated: 0,
    shiftPattern: "Nights", startDate: daysAhead(1),
    status: "released_to_sourcing", receivedAt: daysAgo(9),
    releasedToSourcingAt: daysAgo(8), owner: "Joel",
  },
];

// ---------------------------------------------------------------------------
// Screening files
// ---------------------------------------------------------------------------

/** Builds the standard check set for a file, at a given level of completeness. */
function checkSet(
  level: "preliminary" | "limited" | "full" | "complete",
  owner: string,
): Check[] {
  const preliminaryDone = level !== "preliminary";
  const fullDone = level === "complete";

  const mk = (
    id: string,
    group: Check["group"],
    label: string,
    clause: string,
    status: Check["status"],
  ): Check => ({
    id, group, label, clause, status, owner,
    firstRequestSentAt: status === "not_started" ? null : daysAgo(20),
    secondRequestSentAt: status === "chased" ? daysAgo(6) : null,
    confirmedAt: status === "verified" ? daysAgo(3) : null,
  });

  return [
    mk("k1", "consent", "Authorisation to approach employers, government departments and a credit reference agency", "7.3.2f", "verified"),
    mk("k2", "consent", "Signed declaration and misrepresentation acknowledgement", "7.3.2e, g", "verified"),
    mk("k3", "preliminary", "Information complete and reviewed as likely to complete", "7.4b", preliminaryDone ? "verified" : "received"),
    mk("k4", "preliminary", "Identity confirmed from original documents", "7.4c", preliminaryDone ? "verified" : "received"),
    mk("k5", "preliminary", "SIA licence verified against the public register", "7.4c1", preliminaryDone ? "verified" : "requested"),
    mk("k6", "preliminary", "Current address confirmed", "7.4d", preliminaryDone ? "verified" : "requested"),
    mk("k7", "preliminary", "UK sanctions screening (HM Treasury consolidated list)", "7.4e", preliminaryDone ? "verified" : "not_started"),
    mk("k7b", "preliminary", "OFAC sanctions screening", "7.4e", preliminaryDone ? "verified" : "not_started"),
    mk("k8", "preliminary", "Creditsafe public record search", "7.4f", preliminaryDone ? "verified" : "not_started"),
    mk("k9", "history", "Career and history — 3 years before application", "7.5.2a", level === "preliminary" ? "requested" : "verified"),
    mk("k10", "history", "Career and history — whole screening period", "7.7", fullDone ? "verified" : "chased"),
    mk("k11", "history", "Date of leaving full-time education", "7.7a", fullDone ? "verified" : "requested"),
    // Criminality and right to work gate DEPLOYMENT under our own policy, so on
    // any file whose officer is on site these are already verified.
    mk("k12", "criminality", "SIA licence, NPCC Appendix C or disclosure held", "7.7j", preliminaryDone ? "verified" : "requested"),
    mk("k12b", "criminality", "Enhanced disclosure — post involves contact with children or vulnerable adults", "7.7j Note 6", preliminaryDone ? "verified" : "not_applicable"),
    mk("k13", "legal", "Right to work — share code checked independently", "outside scope", preliminaryDone ? "verified" : "received"),
    mk("k14", "signoff", "Controller review — limited screening", "7.5.2b", level === "preliminary" ? "not_started" : "verified"),
    mk("k15", "signoff", "Controller review — completed file", "7.7", fullDone ? "verified" : "not_started"),
  ];
}

export const screeningFiles: ScreeningFile[] = [
  {
    id: "f1", candidateId: "cand1", screeningPeriodYears: 5,
    status: "full_screening_in_progress",
    conditionalEmploymentStart: daysAgo(78), extensionWeeks: 0,
    extensionApprovedBy: null,
    administrator: "Ruth", controller: "Marcus",
    controllerReview1At: daysAgo(80), controllerReview2At: null,
    checks: checkSet("full", "Ruth"),
    unverifiedDays: 47, gapsOver31Days: 1,
    outstandingSummary: "2 employment references, 1 gap over 31 days",
  },
  {
    id: "f2", candidateId: "cand2", screeningPeriodYears: 5,
    status: "full_screening_in_progress",
    conditionalEmploymentStart: daysAgo(72), extensionWeeks: 0,
    extensionApprovedBy: null,
    administrator: "Marcus", controller: "Ruth",
    controllerReview1At: daysAgo(74), controllerReview2At: null,
    checks: checkSet("full", "Marcus"),
    unverifiedDays: 96, gapsOver31Days: 2,
    outstandingSummary: "DWP unemployment period, 2 gaps over 31 days",
  },
  {
    id: "f3", candidateId: "cand3", screeningPeriodYears: 5,
    status: "risk_acceptance_required",
    conditionalEmploymentStart: daysAgo(58), extensionWeeks: 0,
    extensionApprovedBy: null,
    administrator: "Ruth", controller: "Marcus",
    controllerReview1At: daysAgo(60), controllerReview2At: null,
    checks: checkSet("full", "Ruth"),
    unverifiedDays: 12, gapsOver31Days: 0,
    outstandingSummary: "CCJ £14,200 — awaiting Eleanor's risk acceptance",
  },
  {
    id: "f4", candidateId: "cand4", screeningPeriodYears: 5,
    status: "full_screening_in_progress",
    conditionalEmploymentStart: daysAgo(41), extensionWeeks: 0,
    extensionApprovedBy: null,
    administrator: "Marcus", controller: "Ruth",
    controllerReview1At: daysAgo(43), controllerReview2At: null,
    checks: checkSet("full", "Marcus"),
    unverifiedDays: 31, gapsOver31Days: 1,
    outstandingSummary: "1 employment reference, travel abroad over 31 days",
  },
  {
    id: "f5", candidateId: "cand5", screeningPeriodYears: 5,
    status: "full_screening_in_progress",
    conditionalEmploymentStart: daysAgo(96), extensionWeeks: 4,
    extensionApprovedBy: "Eleanor",
    administrator: "Ruth", controller: "Marcus",
    controllerReview1At: daysAgo(98), controllerReview2At: null,
    checks: checkSet("full", "Ruth"),
    unverifiedDays: 22, gapsOver31Days: 0,
    outstandingSummary: "Overseas employer reference — 2nd request sent",
  },
  {
    id: "f6", candidateId: "cand6", screeningPeriodYears: 5,
    status: "full_screening_in_progress",
    conditionalEmploymentStart: daysAgo(19), extensionWeeks: 0,
    extensionApprovedBy: null,
    administrator: "Marcus", controller: "Ruth",
    controllerReview1At: daysAgo(21), controllerReview2At: null,
    checks: checkSet("full", "Marcus"),
    unverifiedDays: 64, gapsOver31Days: 1,
    outstandingSummary: "3 employment references outstanding",
  },
  {
    id: "f7", candidateId: "cand7", screeningPeriodYears: 5,
    status: "controller_review_2",
    conditionalEmploymentStart: daysAgo(66), extensionWeeks: 0,
    extensionApprovedBy: null,
    administrator: "Ruth", controller: "Marcus",
    controllerReview1At: daysAgo(68), controllerReview2At: null,
    checks: checkSet("complete", "Ruth"),
    unverifiedDays: 0, gapsOver31Days: 0,
    outstandingSummary: "Complete — awaiting controller review",
  },
  {
    id: "f8", candidateId: "cand8", screeningPeriodYears: 5,
    status: "preliminary_checks_complete",
    conditionalEmploymentStart: null, extensionWeeks: 0,
    extensionApprovedBy: null,
    administrator: "Marcus", controller: null,
    controllerReview1At: null, controllerReview2At: null,
    checks: checkSet("preliminary", "Marcus"),
    unverifiedDays: 0, gapsOver31Days: 0,
    outstandingSummary: "Criminality check outstanding — not yet deployable",
  },
];

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export const candidates: Candidate[] = [
  { id: "cand1", personId: "p1", fullName: "Adebayo Fashola", siaBadgeName: "Adebayo O Fashola", siaLicenceNumber: "1010 2233 4455 6677", siaLicenceExpiry: daysAhead(412), email: "a.fashola@example.com", phone: "07700 900111", requirementId: "r5", stage: "deployed", stageSince: daysAgo(75), owner: "Priya", source: "existing_indeed", screeningFileId: "f1", pin: "4417" },
  { id: "cand2", personId: "p2", fullName: "Marta Kowalczyk", siaBadgeName: "Marta Kowalczyk", siaLicenceNumber: "1010 3344 5566 7788", siaLicenceExpiry: daysAhead(58), email: "m.kowalczyk@example.com", phone: "07700 900222", requirementId: "r1", stage: "deployed", stageSince: daysAgo(69), owner: "Priya", source: "previous_enquiry", screeningFileId: "f2", pin: "4418" },
  { id: "cand3", personId: "p3", fullName: "Kieran Doyle", siaBadgeName: "Kieran P Doyle", siaLicenceNumber: "1010 4455 6677 8899", siaLicenceExpiry: daysAhead(690), email: "k.doyle@example.com", phone: "07700 900333", requirementId: "r3", stage: "deployed", stageSince: daysAgo(55), owner: "Joel", source: "new_indeed_ad", screeningFileId: "f3", pin: "4421" },
  { id: "cand4", personId: "p4", fullName: "Shanice Bennett", siaBadgeName: "Shanice Bennett", siaLicenceNumber: "1010 5566 7788 9900", siaLicenceExpiry: daysAhead(220), email: "s.bennett@example.com", phone: "07700 900444", requirementId: "r4", stage: "deployed", stageSince: daysAgo(38), owner: "Joel", source: "previous_enquiry", screeningFileId: "f4", pin: "4423" },
  { id: "cand5", personId: "p5", fullName: "Rashid Karim", siaBadgeName: "Rashid Karim", siaLicenceNumber: "1010 6677 8899 0011", siaLicenceExpiry: daysAhead(310), email: "r.karim@example.com", phone: "07700 900555", requirementId: "r2", stage: "deployed", stageSince: daysAgo(93), owner: "Joel", source: "existing_indeed", screeningFileId: "f5", pin: "4425" },
  { id: "cand6", personId: "p6", fullName: "Elena Petrova", siaBadgeName: "Elena Petrova", siaLicenceNumber: "1010 7788 9900 1122", siaLicenceExpiry: daysAhead(505), email: "e.petrova@example.com", phone: "07700 900666", requirementId: "r4", stage: "deployed", stageSince: daysAgo(16), owner: "Priya", source: "new_indeed_ad", screeningFileId: "f6", pin: "4427" },
  { id: "cand7", personId: "p7", fullName: "Callum Reid", siaBadgeName: "Callum J Reid", siaLicenceNumber: "1010 8899 0011 2233", siaLicenceExpiry: daysAhead(140), email: "c.reid@example.com", phone: "07700 900777", requirementId: "r3", stage: "deployed", stageSince: daysAgo(63), owner: "Priya", source: "referral", screeningFileId: "f7", pin: "4428" },
  { id: "cand8", personId: "p8", fullName: "Ify Nwachukwu", siaBadgeName: null, siaLicenceNumber: "1010 9900 1122 3344", siaLicenceExpiry: daysAhead(95), email: "i.nwachukwu@example.com", phone: "07700 900888", requirementId: "r2", stage: "second_interview", stageSince: daysAgo(6), owner: "Joel", source: "existing_indeed", screeningFileId: "f8", pin: null },
  { id: "cand9", personId: "p9", fullName: "Gareth Llewellyn", siaBadgeName: null, siaLicenceNumber: null, siaLicenceExpiry: null, email: "g.llewellyn@example.com", phone: "07700 900999", requirementId: "r5", stage: "application_complete", stageSince: daysAgo(3), owner: "Priya", source: "new_indeed_ad", screeningFileId: null, pin: null },
  { id: "cand10", personId: "p10", fullName: "Amara Sesay", siaBadgeName: null, siaLicenceNumber: null, siaLicenceExpiry: null, email: "a.sesay@example.com", phone: "07700 901000", requirementId: "r5", stage: "application_received", stageSince: daysAgo(8), owner: "Priya", source: "previous_enquiry", screeningFileId: null, pin: null },
  { id: "cand11", personId: "p11", fullName: "Viktor Horvat", siaBadgeName: null, siaLicenceNumber: null, siaLicenceExpiry: null, email: "v.horvat@example.com", phone: "07700 901111", requirementId: "r7", stage: "invited", stageSince: daysAgo(11), owner: "Joel", source: "new_indeed_ad", screeningFileId: null, pin: null },
  { id: "cand12", personId: "p12", fullName: "Joanne Fitzgerald", siaBadgeName: null, siaLicenceNumber: null, siaLicenceExpiry: null, email: "j.fitzgerald@example.com", phone: "07700 901222", requirementId: "r7", stage: "shortlisted", stageSince: daysAgo(2), owner: "Joel", source: "existing_indeed", screeningFileId: null, pin: null },
  { id: "cand13", personId: "p13", fullName: "Dele Ajayi", siaBadgeName: null, siaLicenceNumber: null, siaLicenceExpiry: null, email: "d.ajayi@example.com", phone: "07700 901333", requirementId: "r1", stage: "invited", stageSince: daysAgo(15), owner: "Priya", source: "previous_enquiry", screeningFileId: null, pin: null },
  { id: "cand14", personId: "p14", fullName: "Hannah Oyelaran", siaBadgeName: null, siaLicenceNumber: null, siaLicenceExpiry: null, email: "h.oyelaran@example.com", phone: "07700 901444", requirementId: "r1", stage: "sourcing", stageSince: daysAgo(1), owner: "Priya", source: "existing_indeed", screeningFileId: null, pin: null },
];

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

/**
 * Two-stage: an optional initial interview by the recruitment team, then the
 * final interview held by the HR Manager. The final one is mandatory before any
 * offer [7.3.4] and is what Gate 1 checks.
 */
export const interviews: Interview[] = [
  { id: "i1", candidateId: "cand1", stage: "first", interviewer: "Priya", heldAt: daysAgo(112), outcome: "progress", notes: "Telephone. Strong site experience, available for nights." },
  { id: "i2", candidateId: "cand1", stage: "second", interviewer: "Eleanor", heldAt: daysAgo(108), outcome: "progress", notes: "On site. Approved for conditional offer." },
  { id: "i3", candidateId: "cand2", stage: "first", interviewer: "Joel", heldAt: daysAgo(80), outcome: "progress", notes: "Telephone." },
  { id: "i4", candidateId: "cand2", stage: "second", interviewer: "Eleanor", heldAt: daysAgo(76), outcome: "progress", notes: "Video. Approved for conditional offer." },
  { id: "i5", candidateId: "cand3", stage: "first", interviewer: "Joel", heldAt: daysAgo(66), outcome: "progress", notes: "Telephone. Retail background, weekends suit." },
  { id: "i6", candidateId: "cand3", stage: "second", interviewer: "Eleanor", heldAt: daysAgo(62), outcome: "progress", notes: "On site. Financial history to be reviewed at screening." },
  { id: "i7", candidateId: "cand4", stage: "first", interviewer: "Priya", heldAt: daysAgo(49), outcome: "progress", notes: "Telephone." },
  { id: "i8", candidateId: "cand4", stage: "second", interviewer: "Eleanor", heldAt: daysAgo(45), outcome: "progress", notes: "Video. Approved for conditional offer." },
  { id: "i9", candidateId: "cand5", stage: "first", interviewer: "Joel", heldAt: daysAgo(106), outcome: "progress", notes: "Telephone." },
  { id: "i10", candidateId: "cand5", stage: "second", interviewer: "Eleanor", heldAt: daysAgo(102), outcome: "progress", notes: "On site. Overseas history flagged for screening." },
  { id: "i11", candidateId: "cand5", stage: "additional", interviewer: "Halton Data Centre", heldAt: daysAgo(100), outcome: "progress", notes: "Client-required stage." },
  { id: "i12", candidateId: "cand6", stage: "first", interviewer: "Priya", heldAt: daysAgo(26), outcome: "progress", notes: "Telephone. Available immediately." },
  { id: "i13", candidateId: "cand6", stage: "second", interviewer: "Eleanor", heldAt: daysAgo(23), outcome: "progress", notes: "Video. Approved for conditional offer." },
  { id: "i14", candidateId: "cand7", stage: "first", interviewer: "Priya", heldAt: daysAgo(74), outcome: "progress", notes: "Telephone." },
  { id: "i15", candidateId: "cand7", stage: "second", interviewer: "Eleanor", heldAt: daysAgo(70), outcome: "progress", notes: "On site. Approved for conditional offer." },
  { id: "i16", candidateId: "cand8", stage: "first", interviewer: "Joel", heldAt: daysAgo(6), outcome: "progress", notes: "Telephone. Data centre experience." },
];

/** Every interview held for a candidate, oldest first. */
export const interviewsFor = (candidateId: string) =>
  interviews
    .filter((i) => i.candidateId === candidateId)
    .sort((a, b) => new Date(a.heldAt).getTime() - new Date(b.heldAt).getTime());

/**
 * Gate 1 checks this: every interview stage the client requires must have been
 * held before any offer [7.3.4]. Which stages those are comes from the client
 * record, so a site that adds its own stage is configuration, not a code change.
 */
export const requiredInterviewsHeld = (candidateId: string): boolean => {
  const candidate = candidateById(candidateId);
  const requirement = candidate?.requirementId
    ? requirements.find((r) => r.id === candidate.requirementId)
    : undefined;
  const client = requirement ? clientById(requirement.clientId) : undefined;
  if (!client) return false;

  const held = new Set(interviewsFor(candidateId).map((i) => i.stage));
  return requiredInterviewStages(client).every((stage) => held.has(stage));
};

// ---------------------------------------------------------------------------
// Officers
// ---------------------------------------------------------------------------

export const officers: Officer[] = [
  { id: "o1", personId: "p20", siaBadgeName: "Wesley Anand", pin: "3312", siaLicenceNumber: "1010 1111 2222 3333", siaLicenceExpiry: daysAhead(24), control: "alpha", available: true, employmentState: "confirmed", rightToWorkExpiry: null },
  { id: "o2", personId: "p21", siaBadgeName: "Grace Mbeki", pin: "3318", siaLicenceNumber: "1010 2222 3333 4444", siaLicenceExpiry: daysAhead(51), control: "bravo", available: false, employmentState: "confirmed", rightToWorkExpiry: daysAhead(38) },
  { id: "o3", personId: "p22", siaBadgeName: "Liam Corrigan", pin: "3325", siaLicenceNumber: "1010 3333 4444 5555", siaLicenceExpiry: daysAhead(78), control: "alpha", available: true, employmentState: "confirmed", rightToWorkExpiry: null },
  { id: "o4", personId: "p1", siaBadgeName: "Adebayo O Fashola", pin: "4417", siaLicenceNumber: "1010 2233 4455 6677", siaLicenceExpiry: daysAhead(412), control: "alpha", available: false, employmentState: "conditional", rightToWorkExpiry: null },
  { id: "o5", personId: "p2", siaBadgeName: "Marta Kowalczyk", pin: "4418", siaLicenceNumber: "1010 3344 5566 7788", siaLicenceExpiry: daysAhead(58), control: "alpha", available: false, employmentState: "conditional", rightToWorkExpiry: null },
];

/**
 * Client-side references. We issue the PIN; some sites issue their own PRN and
 * the two are recorded against each other, so neither side has to match on name.
 */
export const siteReferences: SiteReference[] = [
  { officerId: "o1", siteId: "s1", prn: "MER-0442" },
  { officerId: "o2", siteId: "s4", prn: "HAL-1180" },
  { officerId: "o4", siteId: "s6", prn: "CW-2207" },
];

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const tasks: Task[] = [
  { id: "t1", kind: "chase_reference", title: "2nd request — Brightwater Security (WR)", subjectName: "Adebayo Fashola", subjectHref: "/vetting", owner: "Ruth", dueAt: daysAgo(4), slaDays: 3, createdAt: daysAgo(14), blocked: false, blockedReason: null },
  { id: "t2", kind: "chase_documents", title: "Documentary evidence for gap Mar–Jun 2023 (DR)", subjectName: "Marta Kowalczyk", subjectHref: "/vetting", owner: "Marcus", dueAt: daysAgo(6), slaDays: 3, createdAt: daysAgo(12), blocked: false, blockedReason: null },
  { id: "t3", kind: "approval", title: "Risk acceptance — CCJ £14,200", subjectName: "Kieran Doyle", subjectHref: "/vetting", owner: "Eleanor", dueAt: daysAgo(2), slaDays: 2, createdAt: daysAgo(5), blocked: false, blockedReason: null },
  { id: "t4", kind: "controller_review", title: "Controller review — completed file", subjectName: "Callum Reid", subjectHref: "/vetting", owner: "Marcus", dueAt: daysAhead(1), slaDays: 2, createdAt: daysAgo(1), blocked: false, blockedReason: null },
  { id: "t5", kind: "chase_application", title: "3rd chaser — application not returned", subjectName: "Dele Ajayi", subjectHref: "/candidates", owner: "Priya", dueAt: daysAgo(1), slaDays: 3, createdAt: daysAgo(15), blocked: false, blockedReason: null },
  { id: "t6", kind: "chase_documents", title: "Two documents needed for Acme Ltd period", subjectName: "Gareth Llewellyn", subjectHref: "/candidates", owner: "Priya", dueAt: daysAhead(2), slaDays: 3, createdAt: daysAgo(1), blocked: false, blockedReason: null },
  { id: "t7", kind: "record_check", title: "SIA public register check — blocks deployment", subjectName: "Ify Nwachukwu", subjectHref: "/vetting", owner: "Marcus", dueAt: daysAhead(1), slaDays: 3, createdAt: daysAgo(2), blocked: false, blockedReason: null },
  { id: "t8", kind: "onboarding_step", title: "Hire in Casper from submitted application", subjectName: "Elena Petrova", subjectHref: "/onboarding", owner: "Priya", dueAt: daysAhead(1), slaDays: 2, createdAt: daysAgo(1), blocked: false, blockedReason: null },
  { id: "t9", kind: "chase_signatures", title: "Restrictive covenant unsigned", subjectName: "Amara Sesay", subjectHref: "/candidates", owner: "Priya", dueAt: daysAgo(3), slaDays: 5, createdAt: daysAgo(8), blocked: false, blockedReason: null },
  { id: "t10", kind: "disposal", title: "Secure disposal due — unsuccessful at preliminary (12 months)", subjectName: "4 records", subjectHref: "/system", owner: "Marcus", dueAt: daysAhead(5), slaDays: 5, createdAt: daysAgo(2), blocked: false, blockedReason: null },
  { id: "t11", kind: "record_check", title: "DWP written request — registered unemployment", subjectName: "Marta Kowalczyk", subjectHref: "/vetting", owner: "Marcus", dueAt: daysAhead(3), slaDays: 3, createdAt: daysAgo(1), blocked: true, blockedReason: "Awaiting DWP response — no API, written request only" },
  { id: "t12", kind: "chase_reference", title: "1st request — overseas employer (WR)", subjectName: "Rashid Karim", subjectHref: "/vetting", owner: "Ruth", dueAt: daysAhead(4), slaDays: 3, createdAt: daysAgo(1), blocked: false, blockedReason: null },
];

// ---------------------------------------------------------------------------
// Aggregates for the dashboard charts
// ---------------------------------------------------------------------------

/** Pipeline funnel, last 90 days. Ordered as RECRUITMENT_STAGE_ORDER. */
export const funnel = [
  { stage: "Requirements released", count: 34 },
  { stage: "Candidates shortlisted", count: 96 },
  { stage: "Applications invited", count: 78 },
  { stage: "Applications complete", count: 41 },
  { stage: "First interview", count: 38 },
  { stage: "Second interview", count: 33 },
  { stage: "Conditional offers", count: 27 },
  { stage: "Deployable", count: 24 },
  { stage: "Confirmed employment", count: 16 },
];

/** Median days in stage against the agreed internal service level. */
export const stageCycleTimes = [
  { stage: "Pool check", actual: 1.4, sla: 1 },
  { stage: "Sourcing", actual: 2.1, sla: 1 },
  { stage: "Shortlist + dedupe", actual: 1.8, sla: 2 },
  { stage: "Application returned", actual: 9.6, sla: 3 },
  { stage: "Application complete", actual: 11.2, sla: 3 },
  { stage: "Interview", actual: 4.3, sla: 5 },
  { stage: "Preliminary checks", actual: 4.8, sla: 3 },
  { stage: "Limited screening", actual: 6.2, sla: 5 },
  { stage: "Controller review", actual: 1.6, sla: 2 },
  { stage: "Signed documents", actual: 7.9, sla: 5 },
  { stage: "Onboarding admin", actual: 2.4, sla: 2 },
];

/** Open work per owner, split by whether it is inside its service level. */
export const workload = [
  { owner: "Priya", onTrack: 14, overdue: 3 },
  { owner: "Joel", onTrack: 11, overdue: 5 },
  { owner: "Ruth", onTrack: 9, overdue: 4 },
  { owner: "Marcus", onTrack: 12, overdue: 2 },
  { owner: "Eleanor", onTrack: 3, overdue: 1 },
];

/** Headline compliance measure: files completing inside the period allowed [7.6]. */
export const complianceRate = { completedInPeriod: 31, due: 33 };

// ---------------------------------------------------------------------------
// Selectors — the only surface the UI reads
// ---------------------------------------------------------------------------

export const clientById = (id: string) => clients.find((c) => c.id === id);
export const siteById = (id: string) => sites.find((s) => s.id === id);
export const candidateById = (id: string) => candidates.find((c) => c.id === id);
export const screeningFileById = (id: string) =>
  screeningFiles.find((f) => f.id === id);

/** Files on the clock: conditionally employed with screening incomplete. */
export const filesOnClock = () =>
  screeningFiles.filter(
    (f) => f.conditionalEmploymentStart !== null && f.controllerReview2At === null,
  );

export const openRequirements = () =>
  requirements.filter((r) => r.status !== "filled" && r.status !== "covered_internally");

export const overdueTasks = (now: Date = new Date()) =>
  tasks.filter((t) => new Date(t.dueAt).getTime() < now.getTime());
