/**
 * The form registry.
 *
 * Nine things the brief asks for are one engine and nine rows of
 * configuration: the application form, the welcome pack, the uniform
 * measurement sheet, the site inspection, the operational report, the welfare
 * check, the client satisfaction survey, the incident report and the exit
 * interview.
 *
 * A form is a versioned definition of typed fields. Typed, because a
 * satisfaction score that is a number trends by itself, and one that is free
 * text has to be read by a person before it means anything.
 *
 * A response records the version it answered, so changing a form does not
 * retrospectively change what last quarter's results meant.
 */

import type { FormDefinition } from "./types";

export const FORM_DEFINITIONS: FormDefinition[] = [
  {
    id: "application",
    version: 3,
    title: "Application form",
    purpose:
      "Everything clause 7.3.2 requires, plus the declared history that the document checklist is derived from.",
    department: "recruitment",
    filledBy: "candidate",
    trigger: "Sent when a candidate is invited to apply.",
    fields: [
      { id: "identity", label: "Full name, previous names, date of birth", kind: "text", required: true },
      { id: "addresses", label: "Address history for the screening period", kind: "text", required: true },
      { id: "employment", label: "Employment and education history, with dates", kind: "text", required: true },
      { id: "gaps", label: "Explanation for any gap over 31 days", kind: "text", required: false },
      { id: "sia", label: "SIA licence number", kind: "text", required: false },
      { id: "consent", label: "Consent to screening", kind: "signature", required: true },
      { id: "declaration", label: "Declaration of convictions", kind: "boolean", required: true },
    ],
    raisesTasks: "A document request per declared period, and a duplicate check on submission.",
  },
  {
    id: "welcome_pack",
    version: 2,
    title: "Welcome pack",
    purpose: "Contract, handbook and policy acknowledgements. Signed on the day or the next day.",
    department: "recruitment",
    filledBy: "candidate",
    trigger: "Issued on conditional offer.",
    fields: [
      { id: "contract", label: "Contract of employment", kind: "signature", required: true },
      { id: "conditional", label: "Acknowledgement that confirmation depends on screening", kind: "signature", required: true },
      { id: "handbook", label: "Handbook received", kind: "boolean", required: true },
      { id: "bank", label: "Bank details", kind: "text", required: true },
      { id: "nok", label: "Next of kin", kind: "text", required: true },
    ],
    raisesTasks: "A signature chaser ladder that cancels itself on receipt.",
  },
  {
    id: "uniform",
    version: 1,
    title: "Uniform measurements",
    purpose: "Sizes, so the right kit is issued once rather than exchanged twice.",
    department: "administration",
    filledBy: "staff",
    trigger: "Part of onboarding.",
    fields: [
      { id: "shirt", label: "Shirt / blouse", kind: "choice", required: true },
      { id: "trouser", label: "Trousers", kind: "choice", required: true },
      { id: "jacket", label: "Jacket", kind: "choice", required: true },
      { id: "boots", label: "Footwear", kind: "choice", required: true },
      { id: "issued", label: "Items issued", kind: "text", required: false },
    ],
    raisesTasks: "An issue task, and a return task on leaving.",
  },
  {
    id: "site_inspection",
    version: 4,
    title: "Site inspection",
    purpose: "The operational quality check. Failures raise corrective actions automatically.",
    department: "quality",
    filledBy: "supervisor",
    trigger: "Scheduled per site, per the client's contracted frequency.",
    fields: [
      { id: "appearance", label: "Officer appearance and uniform", kind: "boolean", required: true, feedsKpi: "inspection_pass_rate" },
      { id: "knowledge", label: "Site knowledge and assignment instructions", kind: "boolean", required: true, feedsKpi: "inspection_pass_rate" },
      { id: "occurrence", label: "Occurrence book up to date", kind: "boolean", required: true, feedsKpi: "inspection_pass_rate" },
      { id: "equipment", label: "Equipment present and working", kind: "boolean", required: true },
      { id: "score", label: "Overall score", kind: "score", required: true, feedsKpi: "inspection_score" },
      { id: "photos", label: "Photographs", kind: "photo", required: false },
      { id: "actions", label: "Corrective actions required", kind: "text", required: false },
    ],
    raisesTasks: "A corrective-action task per failed field, owned by the operations manager.",
  },
  {
    id: "welfare_check",
    version: 1,
    title: "Welfare check",
    purpose:
      "A lone-working officer confirming they are safe. Distinct from a check call: the check call proves presence, this asks after the person.",
    department: "control",
    filledBy: "officer",
    trigger: "On a timer during lone-working shifts, and after any incident.",
    fields: [
      { id: "safe", label: "Are you safe and well?", kind: "boolean", required: true, feedsKpi: "welfare_response_rate" },
      { id: "concerns", label: "Anything you need?", kind: "text", required: false },
    ],
    raisesTasks: "Escalation to the welfare ladder if unanswered, per lib/core/ops.ts.",
  },
  {
    id: "incident_report",
    version: 2,
    title: "Incident report",
    purpose: "What happened, when, who was told. The record a client and an insurer both ask for.",
    department: "operations",
    filledBy: "officer",
    trigger: "Raised by the officer or by Control.",
    fields: [
      { id: "when", label: "Date and time", kind: "date", required: true },
      { id: "severity", label: "Severity", kind: "choice", required: true, feedsKpi: "incidents_by_severity" },
      { id: "account", label: "Account of the incident", kind: "text", required: true },
      { id: "photos", label: "Photographs", kind: "photo", required: false },
      { id: "client_notified", label: "Client notified", kind: "boolean", required: true, feedsKpi: "client_notification_rate" },
    ],
    raisesTasks: "A review task for the operations manager; client notification where severity requires it.",
  },
  {
    id: "client_satisfaction",
    version: 1,
    title: "Client satisfaction review",
    purpose: "Typed scores, so satisfaction trends without anyone compiling it by hand.",
    department: "account_management",
    filledBy: "client",
    trigger: "Quarterly per client, and after any serious incident.",
    fields: [
      { id: "officers", label: "Quality of officers", kind: "score", required: true, feedsKpi: "csat_officers" },
      { id: "response", label: "Responsiveness of Control", kind: "score", required: true, feedsKpi: "csat_response" },
      { id: "admin", label: "Administration and reporting", kind: "score", required: true, feedsKpi: "csat_admin" },
      { id: "recommend", label: "Would you recommend us?", kind: "score", required: true, feedsKpi: "nps" },
      { id: "comments", label: "Comments", kind: "text", required: false },
    ],
    raisesTasks: "An account-management action for any score below the agreed threshold.",
  },
  {
    id: "exit_interview",
    version: 1,
    title: "Exit interview",
    purpose: "Why officers leave, in typed categories, so retention is measurable.",
    department: "administration",
    filledBy: "staff",
    trigger: "On notice being given.",
    fields: [
      { id: "reason", label: "Primary reason for leaving", kind: "choice", required: true, feedsKpi: "leaver_reasons" },
      { id: "would_return", label: "Would consider returning", kind: "boolean", required: true },
      { id: "kit_returned", label: "Uniform and equipment returned", kind: "boolean", required: true },
    ],
    raisesTasks: "Equipment return, access revocation, and the retention clock on the file.",
  },
];

export const formById = (id: string) => FORM_DEFINITIONS.find((f) => f.id === id);

/** Every KPI that is fed directly by a typed form field. */
export const KPI_FIELDS = FORM_DEFINITIONS.flatMap((f) =>
  f.fields.filter((x) => x.feedsKpi).map((x) => ({ form: f.title, field: x.label, kpi: x.feedsKpi! })),
);
