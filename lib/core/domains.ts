import type { NavGroup } from "@/components/layout/nav";

/**
 * The platform map, as data.
 *
 * This is the anti-duplication contract from docs/platform/02, in a form the
 * application can render. Keeping it here rather than only in a document means
 * it can be checked on screen instead of trusted, and that a new module has to
 * declare what it owns and what it reuses before it exists.
 *
 * Two rules it exists to enforce:
 *   1. A domain may not write a fact it does not own. It reads it.
 *   2. If you are about to build a second form renderer, a second reminder, a
 *      second task list or a second place to count something — it already
 *      exists.
 */

export type EngineId =
  | "identity"
  | "places"
  | "assignment"
  | "forms"
  | "documents"
  | "work"
  | "scheduler"
  | "events"
  | "access";

export interface Engine {
  id: EngineId;
  name: string;
  /** The single sentence that says what it is for. */
  purpose: string;
  /** What would have been built repeatedly without it. */
  replaces: string;
  module: string;
}

export const ENGINES: Engine[] = [
  {
    id: "identity",
    name: "Identity",
    purpose: "One person record for life. Applicant, officer and leaver are states, not records.",
    replaces: "A separate profile in recruitment, vetting, scheduling, uniform and payroll.",
    module: "lib/core/types.ts",
  },
  {
    id: "places",
    name: "Places",
    purpose: "Client, site and post. The rota fills posts, because a post is what a client pays for.",
    replaces: "Site lists maintained separately by Control, HR and account management.",
    module: "lib/core/types.ts",
  },
  {
    id: "assignment",
    name: "Assignment",
    purpose: "Person x post x time. The join between HR and operations, and where compliance blocks.",
    replaces: "A rota table, a deployment list and an attendance sheet that disagree with each other.",
    module: "lib/core/deployability.ts",
  },
  {
    id: "forms",
    name: "Forms",
    purpose: "Versioned definitions of typed fields. Nine forms are nine rows, not nine features.",
    replaces: "The application form, welcome pack, inspection, welfare check, survey and incident report, each built by hand.",
    module: "lib/core/forms.ts",
  },
  {
    id: "documents",
    name: "Documents",
    purpose: "One store with types, verification states and expiry dates. One expiry engine.",
    replaces: "Six sets of expiry reminders for licences, visas, right to work, training, insurance and contracts.",
    module: "lib/core/documents.ts",
  },
  {
    id: "work",
    name: "Work",
    purpose: "One task model with a polymorphic subject, so there is one queue per person.",
    replaces: "A to-do list inside every module that nobody opens.",
    module: "lib/sla.ts",
  },
  {
    id: "scheduler",
    name: "Scheduler",
    purpose: "One clock for SLAs, chasers, expiry warnings, check-call windows and recurring tasks.",
    replaces: "Reminders implemented separately in each department, and the chase-reject-rechase loop.",
    module: "lib/sla.ts, lib/core/ops.ts",
  },
  {
    id: "events",
    name: "Events",
    purpose: "One append-only log. Every KPI is a query over it, so no module keeps counters.",
    replaces: "Per-department counters, and two screens that disagree about the same number.",
    module: "lib/core/types.ts",
  },
  {
    id: "access",
    name: "Access",
    purpose: "Roles as data, with separation of duties enforced rather than documented.",
    replaces: "Permissions hardcoded per screen, and a compliance rule that lives only in a policy document.",
    module: "lib/roles.ts",
  },
];

export interface DomainSpec {
  id: string;
  name: string;
  href: string | null;
  /**
   * The department responsible, using the same names as the sidebar. Keeping
   * one taxonomy means the platform map and the navigation cannot end up
   * describing the business differently.
   */
  group: NavGroup;
  /** Facts nothing else in the platform may write. */
  owns: string[];
  reuses: EngineId[];
  release: "R0" | "R1" | "R2" | "R3" | "R4" | "R5";
  status: "built" | "designed" | "outlined";
}

export const DOMAINS: DomainSpec[] = [
  {
    id: "live",
    name: "Live operations",
    href: "/live",
    group: "Control Room",
    owns: ["Book-ons", "Check calls", "Welfare checks", "Incidents", "Live post state"],
    reuses: ["assignment", "forms", "scheduler", "events"],
    release: "R3",
    status: "built",
  },
  {
    id: "scheduling",
    name: "Scheduling",
    href: "/scheduling",
    group: "Control Room",
    owns: ["Assignments", "Rota publication", "Shift changes", "Availability", "Absence"],
    reuses: ["identity", "places", "assignment", "work", "events"],
    release: "R2",
    status: "built",
  },
  {
    id: "places",
    name: "Places",
    href: null,
    group: "Control Room",
    owns: ["Clients", "Sites", "Posts", "Site instructions", "PIN/PRN cross-reference"],
    reuses: ["documents", "events"],
    release: "R2",
    status: "designed",
  },
  {
    id: "requirements",
    name: "Requirements",
    href: "/requirements",
    group: "Control Room",
    owns: ["Client staffing requirements", "The pool check", "The timestamped release to HR"],
    reuses: ["places", "work", "events"],
    release: "R1",
    status: "designed",
  },
  {
    id: "candidates",
    name: "Recruitment",
    href: "/candidates",
    group: "HR",
    owns: ["Candidate pipeline stage", "Interviews", "Offers"],
    reuses: ["identity", "forms", "documents", "work", "scheduler"],
    release: "R1",
    status: "designed",
  },
  {
    id: "vetting",
    name: "Vetting",
    href: "/vetting",
    group: "HR",
    owns: ["The BS 7858 screening file", "Checks and evidence", "The clock", "The three gates"],
    reuses: ["identity", "documents", "work", "scheduler", "access"],
    release: "R1",
    status: "designed",
  },
  {
    id: "onboarding",
    name: "Onboarding",
    href: "/onboarding",
    group: "HR",
    owns: ["PIN allocation", "The onboarding checklist", "The handover to operations"],
    reuses: ["identity", "forms", "documents", "work"],
    release: "R1",
    status: "designed",
  },
  {
    id: "compliance",
    name: "Compliance",
    href: "/compliance",
    group: "HR",
    owns: ["Licence, right-to-work and visa status and expiry", "Deployability"],
    reuses: ["documents", "scheduler", "events"],
    release: "R1",
    status: "built",
  },
  {
    id: "quality",
    name: "Quality",
    href: "/quality",
    group: "Management",
    owns: ["Inspections", "Operational reports", "Corrective actions"],
    reuses: ["forms", "documents", "work", "events"],
    release: "R4",
    status: "outlined",
  },
  {
    id: "clients",
    name: "Clients",
    href: "/clients",
    group: "Management",
    owns: ["Contracts", "Service levels", "Feedback", "Satisfaction scores"],
    reuses: ["places", "forms", "events"],
    release: "R4",
    status: "outlined",
  },
  {
    id: "people",
    name: "People",
    href: "/people",
    group: "HR",
    owns: ["The person record and its lifecycle", "Contact details", "Next of kin", "Payroll reference"],
    reuses: ["identity", "documents", "events"],
    release: "R1",
    status: "outlined",
  },
  {
    id: "equipment",
    name: "Equipment",
    href: "/equipment",
    group: "Admin",
    owns: ["Uniform measurements, issues and returns", "Radios, keys and PPE"],
    reuses: ["identity", "forms", "documents", "work"],
    release: "R5",
    status: "outlined",
  },
  {
    id: "tasks",
    name: "Tasks",
    href: "/tasks",
    group: "Dashboard",
    owns: ["Departmental task definitions", "Recurring workflows", "Ownership"],
    reuses: ["work", "scheduler", "access"],
    release: "R1",
    status: "designed",
  },
  {
    id: "insight",
    name: "Insight",
    href: "/reports",
    group: "Management",
    owns: [],
    reuses: ["events"],
    release: "R5",
    status: "designed",
  },
  {
    id: "administration",
    name: "Administration",
    href: "/admin",
    group: "Admin",
    owns: [
      "Suppliers, recurring payments and their agreed amounts",
      "Premises asset register and service schedule",
      "Holiday entitlement and requests",
      "External authority matters and suspensions",
      "Fines, penalties and vouchers",
      "Uniform stock levels and movements",
      "Accreditations, renewal dates and evidence links",
    ],
    reuses: ["identity", "forms", "documents", "work", "scheduler", "events", "access"],
    release: "R2",
    status: "built",
  },
  {
    id: "messaging",
    name: "Messaging",
    href: null,
    group: "Control Room",
    owns: [
      "Conversations and their messages",
      "Delivery and read state",
      "Which conversation a message belongs to",
    ],
    reuses: ["identity", "places", "documents", "scheduler", "events", "access"],
    release: "R3",
    status: "outlined",
  },
  {
    id: "client_access",
    name: "Client access",
    href: null,
    group: "Management",
    // Nothing. A scoped view over Places, Assignment, Live operations and
    // Quality — the moment it keeps its own record of a site, two systems are
    // describing the same site and one of them is stale.
    owns: [],
    reuses: ["places", "assignment", "access", "events"],
    release: "R4",
    status: "outlined",
  },
  {
    id: "system",
    name: "System",
    href: "/system",
    group: "System",
    owns: ["Users and roles", "Configurable rules and thresholds", "The platform map", "The audit log"],
    reuses: ["access", "scheduler", "events"],
    release: "R1",
    status: "designed",
  },
];

/**
 * What would have been built twice.
 *
 * The left column is the brief, read literally. The right is what it actually
 * is. This is the argument for the architecture, and it is on screen so it can
 * be argued with.
 */
export const COLLAPSED_FEATURES: {
  asked: string;
  actually: string;
  engines: EngineId[];
}[] = [
  { asked: "Application form", actually: "A form definition, and the documents it demands", engines: ["forms", "documents"] },
  { asked: "Welcome pack", actually: "A form needing signatures, and a task to chase them", engines: ["forms", "work"] },
  { asked: "Five-year employment history", actually: "Documents with a verification state, against a timeline", engines: ["documents"] },
  { asked: "Uniform measurements", actually: "A form definition", engines: ["forms"] },
  { asked: "Site inspections", actually: "A form, photos, and corrective-action tasks", engines: ["forms", "documents", "work"] },
  { asked: "Operational reports", actually: "The same engine, a different definition", engines: ["forms"] },
  { asked: "Welfare checks", actually: "A form on a timer", engines: ["forms", "scheduler"] },
  { asked: "Client feedback", actually: "A form sent to a client contact, with typed scores", engines: ["forms", "events"] },
  { asked: "Hourly check calls", actually: "A scheduled expectation, and the event that satisfies it", engines: ["scheduler", "events"] },
  { asked: "Book-ons", actually: "An event against an assignment, inside a window", engines: ["assignment", "events"] },
  { asked: "SIA licence reminders", actually: "A document with an expiry, and one reminder rule", engines: ["documents", "scheduler"] },
  { asked: "Visa and right-to-work reminders", actually: "The same engine, a different document type", engines: ["documents", "scheduler"] },
  { asked: "Daily departmental tasks", actually: "Work items with a recurrence rule", engines: ["work", "scheduler"] },
  { asked: "Rotas and shift changes", actually: "Assignments, and their amendment history", engines: ["assignment", "events"] },
  { asked: "Live KPIs for every department", actually: "Queries over the event log", engines: ["events"] },
  { asked: "Office rent and recurring payments", actually: "A schedule with an agreed amount, and a reminder rule per due date", engines: ["scheduler", "work", "events"] },
  { asked: "Appliance maintenance", actually: "An asset with a next-service date, and the same expiry engine", engines: ["scheduler", "work", "documents"] },
  { asked: "Employee holidays", actually: "A request needing approval, checked against the rota we already hold", engines: ["work", "assignment", "identity"] },
  { asked: "Department of Work matters and suspensions", actually: "A matter with correspondence attached, and an approval before anything leaves the building", engines: ["documents", "work", "events"] },
  { asked: "Company and employee forms", actually: "Form definitions — the same engine as application forms and welcome packs", engines: ["forms"] },
  { asked: "Fines, penalties and decision forms", actually: "A decision record with an approval chain, and a form for the grounds", engines: ["work", "forms", "events"] },
  { asked: "Vouchers", actually: "The same decision record, with a value and a redemption date", engines: ["work", "events"] },
  { asked: "Uniform stock, allocation and returns", actually: "Stock as the running total of movements against the item the issues already point at", engines: ["identity", "work", "events"] },
  { asked: "Accreditations and supporting evidence", actually: "An expiry date, and a view over screening, inspection and training records already held", engines: ["documents", "scheduler", "events"] },
  { asked: "Approval history for sensitive decisions", actually: "The append-only event log, queried", engines: ["events", "access"] },
];

/** The single-source-of-truth register. Every fact, and its one owner. */
export const OWNERSHIP_REGISTER: {
  fact: string;
  owner: string;
  readBy: string;
  note?: string;
}[] = [
  { fact: "Name, date of birth, contact details", owner: "People", readBy: "Everything", note: "Written once, at first contact" },
  { fact: "National Insurance number", owner: "People", readBy: "Vetting, payroll export", note: "Duplicate-check key" },
  { fact: "SIA licence number and badge name", owner: "Compliance", readBy: "Scheduling, Live ops", note: "From the public register, never typed from the badge" },
  { fact: "Licence, right-to-work and visa expiry", owner: "Compliance", readBy: "Scheduling (blocks), Insight", note: "Held in one place only, and warned on from one rule" },
  { fact: "Screening status and the clock", owner: "Vetting", readBy: "Recruitment (status only), Scheduling", note: "Contents restricted" },
  { fact: "Deployability", owner: "Compliance (derived)", readBy: "Scheduling, as a hard block", note: "Derived, never set by hand" },
  { fact: "Recruitment stage", owner: "Recruitment", readBy: "Insight", note: "A separate track from vetting, by design" },
  { fact: "PIN", owner: "Onboarding", readBy: "Everything", note: "Allocated, never reused. Client-side PRN is a Places reference" },
  { fact: "Post requirements", owner: "Places", readBy: "Vetting, Scheduling", note: "How a contract term reaches a screening file" },
  { fact: "Who is on shift where", owner: "Scheduling", readBy: "Live ops, Insight, payroll export", note: "The rota is a projection, not a second table" },
  { fact: "Whether they turned up", owner: "Live operations", readBy: "Scheduling, Insight, payroll", note: "The book-on is the evidence" },
  { fact: "Hours worked", owner: "Live operations (derived)", readBy: "Payroll and billing export", note: "Approved by a manager before export" },
  { fact: "Client satisfaction score", owner: "Clients", readBy: "Insight", note: "A typed field, so it trends without re-keying" },
  { fact: "Task ownership and due date", owner: "Work", readBy: "Everything", note: "One queue per person" },
  { fact: "Every KPI", owner: "Nobody — derived from Events", readBy: "Insight", note: "The reason reporting cannot drift" },
  { fact: "Supplier, payment terms and bank details", owner: "Administration", readBy: "Insight", note: "One edit, visible as one edit" },
  { fact: "The agreed amount for a recurring payment", owner: "Administration", readBy: "Administration (variance check)", note: "Approved once with the contract; only a difference asks again" },
  { fact: "Premises asset register and next service date", owner: "Administration", readBy: "Insight", note: "Expiry warnings come from the shared scheduler, not a second rule" },
  { fact: "Holiday entitlement and balance", owner: "Administration", readBy: "Scheduling, the person", note: "Pro-rata is arithmetic on the employment start date, never re-keyed" },
  { fact: "Whether the person is rostered on requested dates", owner: "Scheduling", readBy: "Administration (holiday cover check)", note: "A query, not a phone call to Control" },
  { fact: "Suspension period", owner: "Administration", readBy: "Scheduling (blocks), Compliance", note: "A suspended officer cannot be published to the rota" },
  { fact: "Fines, penalties and vouchers", owner: "Administration", readBy: "Insight", note: "Two approvals where it is against an employee" },
  { fact: "Uniform stock on hand", owner: "Administration", readBy: "Recruitment, Control", note: "Derived from movements. Who holds what stays with Equipment" },
  { fact: "Accreditation expiry and evidence links", owner: "Administration", readBy: "Management, the auditor", note: "Evidence is a view over Vetting, Quality and training records" },
  { fact: "Approval thresholds", owner: "System (settings)", readBy: "Administration", note: "A number in the database, so changing it is an edit with an event" },
  { fact: "Who may act as which role, and until when", owner: "System (UserRole and RoleDelegation)", readBy: "Every action", note: "A lent role ends on a date that cannot be left off. Resolved at the moment of acting, not from the session cookie" },
  { fact: "Message content and its delivery state", owner: "Messaging", readBy: "Live operations (as check-call evidence), the auditor", note: "The reason to build it: a WhatsApp message is not a record and sits outside retention" },
  { fact: "What a client may see", owner: "Client access (derived from the contract and the sites)", readBy: "The client portal only", note: "Owns nothing itself. A scoped view, never a copy" },
];

export const engineById = (id: EngineId) => ENGINES.find((e) => e.id === id)!;
export const domainsByGroup = (group: DomainSpec["group"]) =>
  DOMAINS.filter((d) => d.group === group);
