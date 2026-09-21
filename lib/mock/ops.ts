/**
 * Demonstration data for the operational domains.
 *
 * Invented, like lib/mock/data.ts, and replaced wholesale when the database
 * lands. Dates are offsets from now so the live board is always live.
 *
 * One thing here is not just demonstration: the people are the SAME people as
 * in lib/mock/data.ts, looked up by personId. Nobody is re-typed. That is the
 * identity spine from docs/platform/02 working, rather than being described.
 */

import type { Severity } from "../types";
import type {
  Assignment,
  BookOn,
  CheckCall,
  DepartmentId,
  DocumentRecord,
  EventRecord,
  Incident,
  Post,
  WorkItemDefinition,
} from "../core/types";
import { evaluateDeployability } from "../core/deployability";
import type { Deployability } from "../core/deployability";
import { evaluateDeploymentGate } from "../policy";
import {
  candidates,
  officers,
  requiredInterviewsHeld,
  screeningFiles,
  sites,
} from "./data";

const MS_PER_MIN = 60_000;
const at = (minutesFromNow: number) =>
  new Date(Date.now() + minutesFromNow * MS_PER_MIN).toISOString();
const hours = (h: number) => at(h * 60);
const days = (d: number) => at(d * 1440);

// ---------------------------------------------------------------------------
// Identity — one directory, read from the existing person records
// ---------------------------------------------------------------------------

/**
 * Names are not stored here. They are read from the candidate and officer
 * records that already exist, keyed on personId, which is the whole point of
 * the identity engine: a second copy of a name is a second thing to correct.
 */
export const personName = (personId: string): string => {
  const officer = officers.find((o) => o.personId === personId);
  if (officer) return officer.siaBadgeName;
  const candidate = candidates.find((c) => c.personId === personId);
  if (candidate) return candidate.fullName;
  return "Unknown person";
};

export const personPin = (personId: string): string | null => {
  const officer = officers.find((o) => o.personId === personId);
  if (officer) return officer.pin;
  return candidates.find((c) => c.personId === personId)?.pin ?? null;
};

const siaExpiry = (personId: string): string | null => {
  const officer = officers.find((o) => o.personId === personId);
  if (officer) return officer.siaLicenceExpiry;
  return candidates.find((c) => c.personId === personId)?.siaLicenceExpiry ?? null;
};

const rtwExpiry = (personId: string): string | null =>
  officers.find((o) => o.personId === personId)?.rightToWorkExpiry ?? null;

// ---------------------------------------------------------------------------
// Places — posts. The rota fills these, not sites.
// ---------------------------------------------------------------------------

export const posts: Post[] = [
  { id: "post1", siteId: "s1", name: "Night gatehouse", pattern: "Mon–Sun 1900–0700", requiresSiaLicence: true, screeningPeriodYears: 5, checkCallsRequired: true, loneWorking: false },
  { id: "post2", siteId: "s1", name: "Day patrol", pattern: "Mon–Fri 0700–1900", requiresSiaLicence: true, screeningPeriodYears: 5, checkCallsRequired: false, loneWorking: false },
  { id: "post3", siteId: "s2", name: "Gatehouse", pattern: "Mon–Sun 1800–0600", requiresSiaLicence: true, screeningPeriodYears: 5, checkCallsRequired: true, loneWorking: true },
  { id: "post4", siteId: "s3", name: "Concourse, retail hours", pattern: "Mon–Sat 0900–2100", requiresSiaLicence: true, screeningPeriodYears: 5, checkCallsRequired: true, loneWorking: false },
  { id: "post5", siteId: "s3", name: "Concourse, second officer", pattern: "Fri–Sun 1200–2200", requiresSiaLicence: true, screeningPeriodYears: 5, checkCallsRequired: true, loneWorking: false },
  { id: "post6", siteId: "s4", name: "Perimeter, nights", pattern: "Mon–Sun 1900–0700", requiresSiaLicence: true, screeningPeriodYears: 5, checkCallsRequired: true, loneWorking: true },
  { id: "post7", siteId: "s5", name: "Concierge desk", pattern: "Mon–Sun 0700–1900", requiresSiaLicence: true, screeningPeriodYears: 5, checkCallsRequired: false, loneWorking: true },
  { id: "post8", siteId: "s6", name: "Vehicle gate", pattern: "Mon–Sun 0600–1800", requiresSiaLicence: true, screeningPeriodYears: 5, checkCallsRequired: true, loneWorking: true },
  { id: "post9", siteId: "s6", name: "Vehicle gate, relief", pattern: "Sat–Sun 0600–1800", requiresSiaLicence: true, screeningPeriodYears: 5, checkCallsRequired: true, loneWorking: false },
];

export const postById = (id: string) => posts.find((p) => p.id === id)!;
export const siteNameForPost = (postId: string) =>
  sites.find((s) => s.id === postById(postId).siteId)?.name ?? "Unknown site";

// ---------------------------------------------------------------------------
// Assignment — the rota, as a projection of these
// ---------------------------------------------------------------------------

/**
 * Spread deliberately across every state the live board has to show: on post
 * and quiet, a call due, a call overdue, a call missed on a lone-working post,
 * a late book-on, a no-show, and shifts not yet due.
 *
 * A board that only ever shows green teaches people to stop looking at it.
 */
export const assignments: Assignment[] = [
  { id: "a1", personId: "p20", postId: "post1", startsAt: hours(-5), endsAt: hours(7), state: "published", publishedAt: days(-6), amendments: [] },
  { id: "a2", personId: "p22", postId: "post4", startsAt: hours(-3), endsAt: hours(9), state: "published", publishedAt: days(-6), amendments: [] },
  { id: "a3", personId: "p1", postId: "post8", startsAt: hours(-7), endsAt: hours(5), state: "amended", publishedAt: days(-6), amendments: [
    { at: days(-1), by: "Control Alpha", change: "Officer changed from Elena Petrova to Adebayo Fashola", reason: "Elena moved to cover the relief post at short notice", previousPersonId: "p6" },
  ] },
  { id: "a4", personId: "p21", postId: "post6", startsAt: at(35), endsAt: hours(12.5), state: "published", publishedAt: days(-5), amendments: [] },
  { id: "a5", personId: "p2", postId: "post7", startsAt: at(-22), endsAt: hours(11.5), state: "published", publishedAt: days(-5), amendments: [] },
  { id: "a6", personId: "p3", postId: "post3", startsAt: at(-45), endsAt: hours(11), state: "published", publishedAt: days(-5), amendments: [] },
  { id: "a7", personId: "p4", postId: "post5", startsAt: hours(-2), endsAt: hours(8), state: "published", publishedAt: days(-4), amendments: [] },
  { id: "a8", personId: "p5", postId: "post2", startsAt: hours(-9), endsAt: hours(1), state: "published", publishedAt: days(-4), amendments: [] },
  { id: "a9", personId: "p7", postId: "post6", startsAt: hours(6), endsAt: hours(18), state: "published", publishedAt: days(-3), amendments: [] },
  { id: "a10", personId: "p6", postId: "post9", startsAt: hours(-4), endsAt: hours(8), state: "amended", publishedAt: days(-3), amendments: [
    { at: days(-1), by: "Control Alpha", change: "Moved from the manufacturing gate to the relief post", reason: "Cover swap with Adebayo Fashola", previousPersonId: null },
  ] },
  { id: "a11", personId: "p20", postId: "post1", startsAt: hours(19), endsAt: hours(31), state: "published", publishedAt: days(-2), amendments: [] },
  { id: "a12", personId: "p22", postId: "post4", startsAt: hours(21), endsAt: hours(33), state: "draft", publishedAt: null, amendments: [] },
  { id: "a13", personId: "p21", postId: "post6", startsAt: hours(43), endsAt: hours(55), state: "draft", publishedAt: null, amendments: [] },
  /* Control trying to roster a candidate who has not cleared the deployment
     gate. The block is the point: it is caught here, not on site. */
  { id: "a14", personId: "p8", postId: "post7", startsAt: hours(50), endsAt: hours(62), state: "draft", publishedAt: null, amendments: [] },
  { id: "a15", personId: "p5", postId: "post2", startsAt: hours(15), endsAt: hours(25), state: "published", publishedAt: days(-2), amendments: [] },
  { id: "a16", personId: "p4", postId: "post5", startsAt: hours(36), endsAt: hours(46), state: "published", publishedAt: days(-2), amendments: [] },
];

export const bookOns: BookOn[] = [
  { assignmentId: "a1", at: hours(-5), channel: "qr", locationVerified: true },
  { assignmentId: "a2", at: at(-168), channel: "app", locationVerified: true },
  { assignmentId: "a3", at: hours(-7), channel: "phone", locationVerified: false },
  { assignmentId: "a7", at: hours(-2), channel: "sms", locationVerified: false },
  { assignmentId: "a8", at: hours(-9), channel: "qr", locationVerified: true },
  { assignmentId: "a10", at: hours(-4), channel: "supervisor", locationVerified: false },
];

export const checkCalls: CheckCall[] = [
  { id: "cc1", assignmentId: "a1", at: at(-20), channel: "phone", allWell: true, note: null },
  { id: "cc2", assignmentId: "a1", at: at(-82), channel: "phone", allWell: true, note: null },
  { id: "cc3", assignmentId: "a2", at: at(-75), channel: "app", allWell: true, note: null },
  { id: "cc4", assignmentId: "a3", at: at(-135), channel: "phone", allWell: true, note: "Quiet. Contractors on site until 1800." },
  { id: "cc5", assignmentId: "a7", at: at(-30), channel: "app", allWell: true, note: null },
  { id: "cc6", assignmentId: "a10", at: at(-62), channel: "phone", allWell: true, note: null },
];

export const incidents: Incident[] = [
  { id: "i1", assignmentId: "a2", at: at(-40), severity: "notable", summary: "Shoplifting detained and handed to police at the concourse entrance.", reportedBy: "Liam Corrigan", clientNotified: false },
  { id: "i2", assignmentId: "a8", at: hours(-6), severity: "log_only", summary: "Delivery vehicle refused entry — no booking reference.", reportedBy: "Rashid Karim", clientNotified: true },
];

export const bookOnFor = (assignmentId: string) =>
  bookOns.find((b) => b.assignmentId === assignmentId);

/** Assignments whose shift touches now — what the live board is about. */
export const liveAssignments = (now: Date = new Date()) => {
  const t = now.getTime();
  const window = 6 * 3600_000;
  return assignments
    .filter((a) => a.state !== "draft" && a.state !== "cancelled")
    .filter((a) => new Date(a.endsAt).getTime() > t && new Date(a.startsAt).getTime() < t + window)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
};

// ---------------------------------------------------------------------------
// Documents — the expiry register, read from the person records
// ---------------------------------------------------------------------------

/**
 * The compliance register is DERIVED, not maintained. The SIA and right-to-work
 * dates come from the person record; nobody keeps a second list. That is the
 * fix for the drift the register in docs/platform/02 §3 exists to prevent.
 */
function derivedComplianceDocuments(): DocumentRecord[] {
  const out: DocumentRecord[] = [];
  const people = [
    ...officers.map((o) => o.personId),
    ...candidates.filter((c) => c.stage === "deployed").map((c) => c.personId),
  ];
  for (const personId of Array.from(new Set(people))) {
    const sia = siaExpiry(personId);
    if (sia) {
      out.push({
        id: `doc-sia-${personId}`,
        typeId: "sia_licence",
        ownerRef: personId,
        ownerName: personName(personId),
        verification: new Date(sia).getTime() < Date.now() ? "expired" : "verified",
        suppliedAt: days(-120),
        verifiedAt: days(-119),
        expiresAt: sia,
      });
    }
    const rtw = rtwExpiry(personId);
    if (rtw) {
      out.push({
        id: `doc-rtw-${personId}`,
        typeId: "right_to_work",
        ownerRef: personId,
        ownerName: personName(personId),
        verification: new Date(rtw).getTime() < Date.now() ? "expired" : "verified",
        suppliedAt: days(-120),
        verifiedAt: days(-119),
        expiresAt: rtw,
      });
    }
  }
  return out;
}

/** Documents with no home on a person record yet — held explicitly for now. */
const otherDocuments: DocumentRecord[] = [
  { id: "doc-t1", typeId: "training_certificate", ownerRef: "p22", ownerName: personName("p22"), verification: "expired", suppliedAt: days(-400), verifiedAt: days(-399), expiresAt: days(-9) },
  { id: "doc-t2", typeId: "training_certificate", ownerRef: "p20", ownerName: personName("p20"), verification: "verified", suppliedAt: days(-300), verifiedAt: days(-299), expiresAt: days(41) },
  { id: "doc-si1", typeId: "site_instructions", ownerRef: "s4", ownerName: "Halton — DC1 perimeter", verification: "verified", suppliedAt: days(-330), verifiedAt: days(-330), expiresAt: days(19) },
  { id: "doc-si2", typeId: "site_instructions", ownerRef: "s2", ownerName: "Meridian — Depot 7", verification: "expired", suppliedAt: days(-400), verifiedAt: days(-400), expiresAt: days(-27) },
  { id: "doc-cc1", typeId: "client_contract", ownerRef: "c3", ownerName: "Halton Data Centre", verification: "verified", suppliedAt: days(-700), verifiedAt: days(-700), expiresAt: days(78) },
  { id: "doc-cc2", typeId: "client_contract", ownerRef: "c5", ownerName: "Clearwater Pharma", verification: "verified", suppliedAt: days(-500), verifiedAt: days(-500), expiresAt: days(140) },
];

export const documents: DocumentRecord[] = [
  ...derivedComplianceDocuments(),
  ...otherDocuments,
];

/** Everything with an expiry date, soonest first. One list, one job. */
export const expiringDocuments = () =>
  documents
    .filter((d) => d.expiresAt !== null)
    .sort((a, b) => new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime());

// ---------------------------------------------------------------------------
// Work — departmental task definitions, so a daily routine is configured once
// ---------------------------------------------------------------------------

export const workItemDefinitions: WorkItemDefinition[] = [
  { id: "w1", title: "Morning rota check — every post covered for the next 24 hours", department: "control", recurrence: "daily", slaDays: 1, ownerRole: "control", escalatesTo: "top_management" },
  { id: "w2", title: "Watch List sweep — SIA status for every deployed officer", department: "compliance", recurrence: "daily", slaDays: 1, ownerRole: "vetting_admin", escalatesTo: "vetting_controller" },
  { id: "w3", title: "Right-to-work expiry review", department: "compliance", recurrence: "daily", slaDays: 1, ownerRole: "vetting_admin", escalatesTo: "recruitment_manager" },
  { id: "w4", title: "Screening clock review — files inside 4 weeks of their deadline", department: "vetting", recurrence: "weekly", slaDays: 2, ownerRole: "vetting_controller", escalatesTo: "top_management" },
  { id: "w5", title: "Outstanding reference chasers", department: "vetting", recurrence: "weekly", slaDays: 2, ownerRole: "vetting_admin", escalatesTo: "vetting_controller" },
  { id: "w6", title: "Open requirements without an allocated candidate", department: "recruitment", recurrence: "daily", slaDays: 1, ownerRole: "recruitment", escalatesTo: "recruitment_manager" },
  { id: "w7", title: "Site inspection programme — sites due this week", department: "quality", recurrence: "weekly", slaDays: 5, ownerRole: "control", escalatesTo: "top_management" },
  { id: "w8", title: "Client satisfaction reviews due", department: "account_management", recurrence: "quarterly", slaDays: 10, ownerRole: "recruitment_manager", escalatesTo: "top_management" },
  { id: "w9", title: "Retention disposal run — files past their retention period", department: "administration", recurrence: "monthly", slaDays: 5, ownerRole: "vetting_controller", escalatesTo: "top_management" },
  { id: "w10", title: "Uniform returns outstanding from leavers", department: "administration", recurrence: "monthly", slaDays: 5, ownerRole: "recruitment", escalatesTo: "recruitment_manager" },
];

// ---------------------------------------------------------------------------
// Events — the log every KPI is a query over
// ---------------------------------------------------------------------------

export const events: EventRecord[] = [
  { id: "e1", at: at(-8), type: "check_call.recorded", actorName: "Usman", actorRole: "Control", subjectRef: "a1", subjectName: personName("p20"), department: "control", detail: "All well. Depot 4 night gatehouse." },
  { id: "e2", at: at(-22), type: "book_on.missed", actorName: "System", actorRole: "Scheduler", subjectRef: "a5", subjectName: personName("p2"), department: "control", detail: "Book-on not received within the grace period at Block A concierge." },
  { id: "e3", at: at(-40), type: "incident.reported", actorName: "Liam Corrigan", actorRole: "Officer", subjectRef: "a2", subjectName: "Northgate — Main concourse", department: "operations", detail: "Shoplifting detained and handed to police. Client notification outstanding." },
  { id: "e4", at: at(-45), type: "book_on.no_show", actorName: "System", actorRole: "Scheduler", subjectRef: "a6", subjectName: personName("p3"), department: "control", detail: "No show at Depot 7 gatehouse. Escalated to Control Alpha." },
  { id: "e5", at: hours(-3), type: "document.expired", actorName: "System", actorRole: "Scheduler", subjectRef: "doc-t1", subjectName: personName("p22"), department: "compliance", detail: "Training certificate expired 9 days ago. Renewal task raised." },
  { id: "e6", at: hours(-5), type: "assignment.amended", actorName: "Usman", actorRole: "Control", subjectRef: "a3", subjectName: "Clearwater — Manufacturing gate", department: "control", detail: "Officer changed from Elena Petrova to Adebayo Fashola." },
  { id: "e7", at: hours(-7), type: "screening.check_verified", actorName: "Talha", actorRole: "Screening Administrator", subjectRef: "f4", subjectName: "Shanice Bennett", department: "vetting", detail: "Employment reference verified — Brightwater Security." },
  { id: "e8", at: hours(-9), type: "gate.passed", actorName: "Anas", actorRole: "Screening Controller", subjectRef: "f6", subjectName: "Elena Petrova", department: "vetting", detail: "Deployment gate cleared. Criminality and right to work complete." },
  { id: "e9", at: hours(-11), type: "interview.held", actorName: "Farhan", actorRole: "HR Manager", subjectRef: "cand8", subjectName: "Ify Nwachukwu", department: "recruitment", detail: "Second interview held. Outcome: progress." },
  { id: "e10", at: hours(-26), type: "requirement.released", actorName: "Usman", actorRole: "Control", subjectRef: "r7", subjectName: "Riverside — Block A concierge", department: "control", detail: "Released to sourcing after the pool check found no internal cover." },
];

export const recentEvents = (limit = 8) =>
  [...events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);

// ---------------------------------------------------------------------------
// Insight — department KPIs
// ---------------------------------------------------------------------------

/**
 * Every figure here is a stand-in for a query over the event log. None of them
 * is stored: that is the reason the Insight domain owns no facts of its own
 * (docs/platform/01 §2). The `derivable` flag marks the ones this prototype
 * already computes from the data above rather than asserting.
 */
export interface DepartmentKpi {
  department: DepartmentId;
  label: string;
  value: string;
  detail: string;
  severity: Severity;
  derivable: boolean;
}

export const departmentKpis: DepartmentKpi[] = [
  { department: "control", label: "Posts covered next 24h", value: "96%", detail: "2 of 54 shifts unallocated", severity: "warning", derivable: false },
  { department: "control", label: "Book-on compliance today", value: "83%", detail: "1 late, 1 no-show of 12 shifts", severity: "serious", derivable: true },
  { department: "control", label: "Check calls on time", value: "78%", detail: "Rolling 24 hours, all posts", severity: "serious", derivable: true },
  { department: "recruitment", label: "Time to fill a requirement", value: "24 days", detail: "Median, release to sourcing → deployed", severity: "warning", derivable: false },
  { department: "recruitment", label: "Open requirements", value: "7", detail: "3 released to sourcing, 4 at pool check", severity: "warning", derivable: true },
  { department: "vetting", label: "Files on the clock", value: "5", detail: "1 inside 2 weeks of its deadline", severity: "serious", derivable: true },
  { department: "vetting", label: "Screening completed in period", value: "94%", detail: "31 of 33 completed inside the permitted period", severity: "good", derivable: false },
  { department: "compliance", label: "Licences expiring in 90 days", value: "4", detail: "1 inside 30 days", severity: "warning", derivable: true },
  { department: "compliance", label: "Documents expired", value: "3", detail: "1 training certificate, 1 site instruction set", severity: "critical", derivable: true },
  { department: "quality", label: "Inspections completed this month", value: "11 / 14", detail: "3 sites still due", severity: "warning", derivable: false },
  { department: "quality", label: "Inspection pass rate", value: "88%", detail: "Rolling 3 months", severity: "good", derivable: false },
  { department: "account_management", label: "Client satisfaction", value: "4.3 / 5", detail: "Last quarter, 5 of 5 clients responded", severity: "good", derivable: false },
  { department: "operations", label: "Open incidents", value: "2", detail: "1 awaiting client notification", severity: "warning", derivable: true },
  { department: "administration", label: "Overdue tasks", value: "6", detail: "Across all departments", severity: "serious", derivable: true },
];

export const kpisForDepartment = (d: DepartmentId) =>
  departmentKpis.filter((k) => k.department === d);

// ---------------------------------------------------------------------------
// Deployability — derived, never stored
// ---------------------------------------------------------------------------

/**
 * Whether a person may be put on a post, worked out from their screening file
 * and their compliance documents. Nothing stores a "deployable" flag; this is
 * the only place the question is answered, and Scheduling calls it before it
 * publishes an assignment.
 */
export function deployabilityFor(
  personId: string,
  postRequiresSiaLicence = true,
  now: Date = new Date(),
): Deployability {
  const officer = officers.find((o) => o.personId === personId);
  const candidate = candidates.find((c) => c.personId === personId);
  const file = candidate?.screeningFileId
    ? screeningFiles.find((f) => f.id === candidate.screeningFileId)
    : undefined;

  // The deployment gate is our own, stricter than the standard's minimum:
  // criminality and right to work are complete before site, not after.
  const gate = file
    ? evaluateDeploymentGate(file, {
        riskEvaluationDocumented: true,
        finalInterviewHeld: requiredInterviewsHeld(candidate!.id),
        signedDocumentsComplete: true,
      })
    : null;

  return evaluateDeployability(
    {
      deploymentGatePassed: gate ? gate.open : true,
      screeningClockExpired: file?.status === "time_expired",
      suspended: officer?.employmentState === "suspended",
      postRequiresSiaLicence,
      siaLicenceExpiry: siaExpiry(personId),
      rightToWorkExpiry: rtwExpiry(personId),
    },
    now,
  );
}

/** Everyone currently on the books, for the compliance and rota views. */
export const workforcePersonIds = (): string[] =>
  Array.from(
    new Set([
      ...officers.map((o) => o.personId),
      ...candidates.filter((c) => c.stage === "deployed").map((c) => c.personId),
    ]),
  );
