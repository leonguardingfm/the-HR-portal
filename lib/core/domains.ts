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
  group: "Operate" | "Grow" | "Assure" | "Run" | "See";
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
    group: "Operate",
    owns: ["Book-ons", "Check calls", "Welfare checks", "Incidents", "Live post state"],
    reuses: ["assignment", "forms", "scheduler", "events"],
    release: "R3",
    status: "built",
  },
  {
    id: "scheduling",
    name: "Scheduling",
    href: "/scheduling",
    group: "Operate",
    owns: ["Assignments", "Rota publication", "Shift changes", "Availability", "Absence"],
    reuses: ["identity", "places", "assignment", "work", "events"],
    release: "R2",
    status: "built",
  },
  {
    id: "places",
    name: "Places",
    href: null,
    group: "Operate",
    owns: ["Clients", "Sites", "Posts", "Site instructions", "PIN/PRN cross-reference"],
    reuses: ["documents", "events"],
    release: "R2",
    status: "designed",
  },
  {
    id: "requirements",
    name: "Requirements",
    href: "/requirements",
    group: "Grow",
    owns: ["Client staffing requirements", "The pool check", "The timestamped release to HR"],
    reuses: ["places", "work", "events"],
    release: "R1",
    status: "designed",
  },
  {
    id: "candidates",
    name: "Recruitment",
    href: "/candidates",
    group: "Grow",
    owns: ["Candidate pipeline stage", "Interviews", "Offers"],
    reuses: ["identity", "forms", "documents", "work", "scheduler"],
    release: "R1",
    status: "designed",
  },
  {
    id: "vetting",
    name: "Vetting",
    href: "/vetting",
    group: "Grow",
    owns: ["The BS 7858 screening file", "Checks and evidence", "The clock", "The three gates"],
    reuses: ["identity", "documents", "work", "scheduler", "access"],
    release: "R1",
    status: "designed",
  },
  {
    id: "onboarding",
    name: "Onboarding",
    href: "/onboarding",
    group: "Grow",
    owns: ["PIN allocation", "The onboarding checklist", "The handover to operations"],
    reuses: ["identity", "forms", "documents", "work"],
    release: "R1",
    status: "designed",
  },
  {
    id: "compliance",
    name: "Compliance",
    href: "/compliance",
    group: "Assure",
    owns: ["Licence, right-to-work and visa status and expiry", "Deployability"],
    reuses: ["documents", "scheduler", "events"],
    release: "R1",
    status: "built",
  },
  {
    id: "quality",
    name: "Quality",
    href: "/quality",
    group: "Assure",
    owns: ["Inspections", "Operational reports", "Corrective actions"],
    reuses: ["forms", "documents", "work", "events"],
    release: "R4",
    status: "outlined",
  },
  {
    id: "clients",
    name: "Clients",
    href: "/clients",
    group: "Assure",
    owns: ["Contracts", "Service levels", "Feedback", "Satisfaction scores"],
    reuses: ["places", "forms", "events"],
    release: "R4",
    status: "outlined",
  },
  {
    id: "people",
    name: "People",
    href: "/people",
    group: "Run",
    owns: ["The person record and its lifecycle", "Contact details", "Next of kin", "Payroll reference"],
    reuses: ["identity", "documents", "events"],
    release: "R1",
    status: "outlined",
  },
  {
    id: "equipment",
    name: "Equipment",
    href: "/equipment",
    group: "Run",
    owns: ["Uniform measurements, issues and returns", "Radios, keys and PPE"],
    reuses: ["identity", "forms", "documents", "work"],
    release: "R5",
    status: "outlined",
  },
  {
    id: "tasks",
    name: "Tasks",
    href: "/tasks",
    group: "Run",
    owns: ["Departmental task definitions", "Recurring workflows", "Ownership"],
    reuses: ["work", "scheduler", "access"],
    release: "R1",
    status: "designed",
  },
  {
    id: "insight",
    name: "Insight",
    href: "/reports",
    group: "See",
    owns: [],
    reuses: ["events"],
    release: "R5",
    status: "designed",
  },
  {
    id: "admin",
    name: "Admin",
    href: "/admin",
    group: "See",
    owns: ["Users and roles", "Configurable rules", "The platform map", "The audit log"],
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
  { fact: "Licence, right-to-work and visa expiry", owner: "Compliance", readBy: "Scheduling (blocks), Insight", note: "Supersedes INDEL's alerting — never both" },
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
];

export const engineById = (id: EngineId) => ENGINES.find((e) => e.id === id)!;
export const domainsByGroup = (group: DomainSpec["group"]) =>
  DOMAINS.filter((d) => d.group === group);
