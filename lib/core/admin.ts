/**
 * The Admin department.
 *
 * Approved structure and workflow, turned into the one place the rules live.
 * Two things are deliberate and worth reading before changing anything here.
 *
 * 1. Admin adds NO new engine. It is a domain, in the sense of
 *    docs/platform/02: the tasks are WorkItems, the approvals hang off them,
 *    the documents are DocumentRecords, the reminders are ReminderRules, the
 *    audit trail is the Event log and the thresholds are Settings. What Admin
 *    owns is six categories of *fact* nobody else owned — rent, appliances,
 *    entitlement, penalties, stock, accreditations — and one workflow over
 *    them.
 *
 * 2. Approval follows the role, not the rank. The Finance Officer sits inside
 *    higher management, so if the ladder were written in terms of seniority
 *    its top two rungs would be the same person and the second signature on a
 *    large payment would be worth nothing. Hence `finance_officer` as a role of
 *    its own, and hence `canApproveStep` refusing an approver who is the
 *    requester, the subject, or someone who has already signed this request.
 */

import type { DepartmentId, Recurrence } from "./types";
import type { Role } from "@/lib/types";

// ---------------------------------------------------------------------------
// 1. Structure — six categories
// ---------------------------------------------------------------------------

export type AdminCategoryId =
  | "payments"
  | "premises"
  | "people_admin"
  | "decisions"
  | "uniform"
  | "accreditations";

export interface AdminCategory {
  id: AdminCategoryId;
  label: string;
  /** One line, shown as the category's own description. */
  purpose: string;
  /**
   * The facts this category is the single source of truth for. Nothing outside
   * Admin writes these; other departments read them.
   */
  owns: string[];
  /**
   * Facts it reads from elsewhere rather than keeping its own copy of. This
   * column is the anti-duplication check: if something appears here and in
   * `owns`, one of the two is wrong.
   */
  reads: string[];
}

export const ADMIN_CATEGORIES: AdminCategory[] = [
  {
    id: "payments",
    label: "Payments & contracts",
    purpose:
      "Office rent, recurring payments, suppliers and the contracts behind them.",
    owns: [
      "Supplier record and payment terms",
      "Recurring payment schedule and its agreed amount",
      "Each payment instance: due, paid, amount actually paid",
      "Supplier contract start, end and notice period",
    ],
    reads: ["Approval decisions (Work engine)", "Contract documents (Documents engine)"],
  },
  {
    id: "premises",
    label: "Premises & equipment",
    purpose:
      "Office appliances and equipment, their service schedule, faults and repairs.",
    owns: [
      "Asset register: what we have, where, what it cost, warranty end",
      "Service schedule per asset",
      "Fault reports and what was done about them",
    ],
    reads: ["Suppliers (Payments)", "Spend approvals (Work engine)"],
  },
  {
    id: "people_admin",
    label: "People admin",
    purpose:
      "Holiday entitlement and requests, external authority matters, suspensions and employee forms.",
    owns: [
      "Holiday entitlement per person per leave year",
      "Holiday requests and their decisions",
      "External authority matters and correspondence sent",
      "Suspension periods",
    ],
    reads: [
      "The person record (Identity engine)",
      "Whether the person is rostered on the dates requested (Assignment engine)",
      "Employment start date, which sets pro-rata entitlement (Identity engine)",
      "Forms and their responses (Forms engine)",
    ],
  },
  {
    id: "decisions",
    label: "Penalties & decisions",
    purpose:
      "Fines and penalties, decision forms, and vouchers issued or redeemed.",
    owns: [
      "Penalty: what, how much, the grounds, whether it was recovered",
      "Voucher: issued to whom, value, expiry, redemption",
      "The decision record behind either",
    ],
    reads: ["The person record (Identity engine)", "Approval decisions (Work engine)"],
  },
  {
    id: "uniform",
    label: "Uniform & stock",
    purpose: "Stock levels, allocation to officers, and returns from leavers.",
    owns: ["Stock on hand per item and size", "Reorder level", "Stock movements in and out"],
    reads: [
      "Who has what, and what is outstanding (Equipment engine — already built for issues and returns)",
      "Measurements held once on the person record (Identity engine)",
      "Leaver date, which is what makes a return outstanding (Identity engine)",
    ],
  },
  {
    id: "accreditations",
    label: "Accreditations",
    purpose:
      "Accreditations held, when each is next due, and the evidence behind it.",
    owns: [
      "Accreditation record: body, scope, certificate number, expiry",
      "Submission and audit dates",
      "Which evidence requirement is satisfied by what",
    ],
    reads: [
      "Screening completions (Vetting domain)",
      "Inspection results and corrective actions (Quality domain)",
      "Training records (Identity engine)",
      "Certificates and policies (Documents engine)",
    ],
  },
];

export function adminCategory(id: AdminCategoryId): AdminCategory {
  const found = ADMIN_CATEGORIES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown Admin category: ${id}`);
  return found;
}

/** Admin work is stamped with this department on every event. */
export const ADMIN_DEPARTMENT: DepartmentId = "administration";

// ---------------------------------------------------------------------------
// 2. Workflow — one engine, two tracks
// ---------------------------------------------------------------------------

/**
 * A task needs DOING. A request needs DECIDING and then doing.
 *
 * Keeping them as two tracks of one thing rather than two systems is what
 * stops Admin growing a second task list: "order a new kettle" and "approve
 * £400 for a new kettle" are the same item at different points, not two items
 * in two modules.
 */
export type AdminTrack = "task" | "request";

export type AdminTaskState = "raised" | "assigned" | "in_progress" | "completed" | "cancelled";

export type AdminRequestState =
  | "raised"
  | "assigned"
  | "reviewed"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

export const TASK_FLOW: AdminTaskState[] = [
  "raised",
  "assigned",
  "in_progress",
  "completed",
];

export const REQUEST_FLOW: AdminRequestState[] = [
  "raised",
  "assigned",
  "reviewed",
  "approved",
  "completed",
];

/** Which states may follow which. Anything not listed is refused. */
const TASK_TRANSITIONS: Record<AdminTaskState, AdminTaskState[]> = {
  raised: ["assigned", "cancelled"],
  assigned: ["in_progress", "assigned", "cancelled"],
  in_progress: ["completed", "assigned", "cancelled"],
  completed: [],
  cancelled: [],
};

const REQUEST_TRANSITIONS: Record<AdminRequestState, AdminRequestState[]> = {
  raised: ["assigned", "cancelled"],
  assigned: ["reviewed", "assigned", "cancelled"],
  // Review is where the request is checked and costed. From there it either
  // gathers approvals or is rejected — it cannot jump to completed.
  reviewed: ["approved", "rejected", "cancelled"],
  approved: ["completed", "cancelled"],
  // A rejection is final for this request. Raising it again is a new request,
  // deliberately, so the history shows two asks and not one that changed mind.
  rejected: [],
  completed: [],
  cancelled: [],
};

export function canTransition(
  track: AdminTrack,
  from: string,
  to: string,
): boolean {
  const map: Record<string, string[]> =
    track === "task" ? TASK_TRANSITIONS : REQUEST_TRANSITIONS;
  return (map[from] ?? []).includes(to);
}

// ---------------------------------------------------------------------------
// 3. Priorities, deadlines and escalation
// ---------------------------------------------------------------------------

export type AdminPriority = "P1" | "P2" | "P3" | "P4";

export interface PrioritySpec {
  id: AdminPriority;
  label: string;
  /** Target to completion, in hours from the moment it was raised. */
  targetHours: number;
  /** A one-line test, so people pick the same priority as each other. */
  test: string;
}

export const PRIORITIES: Record<AdminPriority, PrioritySpec> = {
  P1: {
    id: "P1",
    label: "P1 — within 4 hours",
    targetHours: 4,
    test: "An officer cannot work, a site is at risk, or a legal deadline is today.",
  },
  P2: {
    id: "P2",
    label: "P2 — within 1 day",
    targetHours: 24,
    test: "Someone is blocked and has no workaround, or money is due this week.",
  },
  P3: {
    id: "P3",
    label: "P3 — within 3 days",
    targetHours: 72,
    test: "Normal departmental work with a date attached.",
  },
  P4: {
    id: "P4",
    label: "P4 — within 10 days",
    targetHours: 240,
    test: "Housekeeping. Real work, no deadline pressing.",
  },
};

export const PRIORITY_ORDER: AdminPriority[] = ["P1", "P2", "P3", "P4"];

/**
 * Escalation is a multiple of the item's own target, not a fixed clock, so one
 * rule covers a four-hour job and a ten-day one.
 *
 * Nothing here reassigns the work. Escalation puts a second name on it; taking
 * it off the first person is a decision a manager makes, not something a timer
 * does behind their back.
 */
export interface EscalationStep {
  /** Multiple of targetHours at which this step fires. */
  atMultiple: number;
  to: Role;
  note: string;
}

export const ESCALATION_STEPS: EscalationStep[] = [
  { atMultiple: 1, to: "admin_manager", note: "Target passed. The Admin Manager is told it is late." },
  { atMultiple: 1.5, to: "admin_manager", note: "Half again past target. The Admin Manager is asked to intervene." },
  { atMultiple: 2, to: "top_management", note: "Twice target. It goes to higher management." },
];

export interface EscalationState {
  /** 0 = inside target. 1, 2, 3 = which step has fired. */
  stage: 0 | 1 | 2 | 3;
  /** Who it currently sits with for escalation purposes. Null while on target. */
  escalatedTo: Role | null;
  dueAt: string;
  hoursLate: number;
  note: string | null;
}

export function escalationState(args: {
  raisedAt: string;
  priority: AdminPriority;
  now?: Date;
}): EscalationState {
  const target = PRIORITIES[args.priority].targetHours;
  const raised = new Date(args.raisedAt).getTime();
  const dueAt = new Date(raised + target * 3_600_000);
  const now = (args.now ?? new Date()).getTime();
  const hoursLate = (now - dueAt.getTime()) / 3_600_000;

  let stage: 0 | 1 | 2 | 3 = 0;
  let escalatedTo: Role | null = null;
  let note: string | null = null;

  ESCALATION_STEPS.forEach((step, i) => {
    const firesAt = raised + step.atMultiple * target * 3_600_000;
    if (now >= firesAt) {
      stage = (i + 1) as 1 | 2 | 3;
      escalatedTo = step.to;
      note = step.note;
    }
  });

  return { stage, escalatedTo, dueAt: dueAt.toISOString(), hoursLate, note };
}

/**
 * An approval that nobody answers is the commonest way an Admin workflow
 * dies. It is chased on its own clock, separate from the work's, because the
 * work cannot start and the delay is not the requester's fault.
 *
 * Nothing on this ladder approves anything. The last step puts it in front of
 * higher management; it does not decide on their behalf.
 */
export const APPROVAL_CHASE_HOURS = [24, 48, 72] as const;

export const APPROVAL_NEVER_AUTO_APPROVES = true as const;

// ---------------------------------------------------------------------------
// 4. The approval ladder
// ---------------------------------------------------------------------------

/**
 * Thresholds are settings, not constants, so changing them is an edit with an
 * event against it rather than a release. These are the agreed starting
 * figures; `thresholdsFrom` reads whatever is in the database over the top.
 */
export const APPROVAL_SETTING_KEYS = {
  low: "admin.approval.low_threshold_pence",
  high: "admin.approval.high_threshold_pence",
} as const;

export const DEFAULT_THRESHOLDS = {
  /** £250 — Admin Manager decides alone at or below this. */
  lowPence: 25_000,
  /** £2,000 — above this a second, different approver is required. */
  highPence: 200_000,
} as const;

export interface Thresholds {
  lowPence: number;
  highPence: number;
}

export function thresholdsFrom(settings: Record<string, string> | null | undefined): Thresholds {
  const read = (key: string, fallback: number) => {
    const raw = settings?.[key];
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const lowPence = read(APPROVAL_SETTING_KEYS.low, DEFAULT_THRESHOLDS.lowPence);
  const highPence = read(APPROVAL_SETTING_KEYS.high, DEFAULT_THRESHOLDS.highPence);
  // A high threshold below the low one would silently skip a rung.
  return { lowPence, highPence: Math.max(lowPence, highPence) };
}

/** What is being asked for. Money is always integer pence. */
export type AdminRequestKind =
  | "payment"
  | "purchase"
  | "voucher"
  | "penalty"
  | "suspension"
  | "holiday"
  | "authority_response"
  | "write_off";

export interface ApprovalSubject {
  kind: AdminRequestKind;
  amountPence: number | null;
  /** Set where the request is about a member of staff. */
  aboutPersonId: string | null;
}

export interface ApprovalRequirement {
  /** 1-based. Steps are gathered in order; all must be satisfied. */
  step: number;
  /** Any one of these roles satisfies the step. */
  anyOf: Role[];
  /** Shown on the request, so the requester knows who they are waiting for. */
  reason: string;
}

const MONEY_KINDS: AdminRequestKind[] = ["payment", "purchase", "voucher", "write_off", "penalty"];

/** Kinds that are a decision about a person, whatever the amount. */
const ABOUT_A_PERSON: AdminRequestKind[] = ["penalty", "suspension"];

export function formatPence(pence: number): string {
  const pounds = pence / 100;
  return pounds % 1 === 0
    ? `£${pounds.toLocaleString("en-GB")}`
    : `£${pounds.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The ladder.
 *
 *   money  <= low          Admin Manager, alone
 *   low <  money <= high   Finance Officer
 *   money  >  high         Finance Officer, plus one other higher-management
 *                          approver — two distinct people
 *
 * On top of the money, anything against an employee takes the HR Manager and
 * higher management. A penalty with a value attached therefore gathers both
 * chains: the money rung and the two people rungs, because they are answering
 * different questions.
 */
export function approvalChain(
  subject: ApprovalSubject,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): ApprovalRequirement[] {
  const steps: Omit<ApprovalRequirement, "step">[] = [];
  const amount = subject.amountPence ?? 0;

  if (MONEY_KINDS.includes(subject.kind) && amount > 0) {
    if (amount <= thresholds.lowPence) {
      steps.push({
        anyOf: ["admin_manager"],
        reason: `${formatPence(amount)} is at or under ${formatPence(thresholds.lowPence)}, so the Admin Manager decides alone.`,
      });
    } else if (amount <= thresholds.highPence) {
      steps.push({
        anyOf: ["finance_officer"],
        reason: `${formatPence(amount)} is over ${formatPence(thresholds.lowPence)}, so it goes to the Finance Officer.`,
      });
    } else {
      steps.push({
        anyOf: ["finance_officer"],
        reason: `${formatPence(amount)} is over ${formatPence(thresholds.highPence)}, so the Finance Officer approves first.`,
      });
      steps.push({
        anyOf: ["top_management"],
        reason:
          "Over the high threshold a second, different approver from higher management is required. The Finance Officer cannot be both.",
      });
    }
  }

  if (ABOUT_A_PERSON.includes(subject.kind)) {
    steps.push({
      anyOf: ["recruitment_manager"],
      reason: "A decision affecting a member of staff is approved by the HR Manager.",
    });
    steps.push({
      anyOf: ["top_management"],
      reason: "A decision affecting a member of staff also takes higher management.",
    });
  }

  if (subject.kind === "holiday") {
    steps.push({
      anyOf: ["admin_manager", "recruitment_manager"],
      reason:
        "Holiday is approved by the Admin Manager, or the HR Manager. The rota is checked for cover before it can be granted.",
    });
  }

  if (subject.kind === "authority_response") {
    steps.push({
      anyOf: ["recruitment_manager", "top_management"],
      reason:
        "Correspondence leaving the company to an external authority is signed off by the HR Manager or higher management.",
    });
  }

  if (steps.length === 0) {
    steps.push({
      anyOf: ["admin_manager"],
      reason: "No money and no person affected, so the Admin Manager signs it off.",
    });
  }

  return steps.map((s, i) => ({ ...s, step: i + 1 }));
}

export interface Approver {
  userId: string;
  personId: string;
  roles: Role[];
}

export interface ApprovalDecisionCheck {
  permitted: boolean;
  reason: string | null;
}

/**
 * Whether this person may sign this step, right now.
 *
 * Four refusals, in the order a person is most likely to hit them. The last
 * two are the ones that make a two-step chain mean anything: without them, the
 * same person could satisfy both rungs and a large payment would carry one
 * signature wearing two hats.
 */
export function canApproveStep(args: {
  requirement: ApprovalRequirement;
  approver: Approver;
  requestedByUserId: string;
  aboutPersonId?: string | null;
  alreadyApprovedByUserIds?: string[];
}): ApprovalDecisionCheck {
  const { requirement, approver } = args;

  if (!requirement.anyOf.some((r) => approver.roles.includes(r))) {
    return {
      permitted: false,
      reason: `This step needs ${requirement.anyOf.join(" or ").replace(/_/g, " ")}. ${requirement.reason}`,
    };
  }
  if (approver.userId === args.requestedByUserId) {
    return {
      permitted: false,
      reason:
        "You raised this request, so you cannot approve it — even though you hold the role. It needs someone else.",
    };
  }
  if (args.aboutPersonId && approver.personId === args.aboutPersonId) {
    return {
      permitted: false,
      reason: "This request is about you. Someone else has to decide it.",
    };
  }
  if ((args.alreadyApprovedByUserIds ?? []).includes(approver.userId)) {
    return {
      permitted: false,
      reason:
        "You have already approved a step on this request. A second approval means a second person.",
    };
  }
  return { permitted: true, reason: null };
}

/** The next unsatisfied step, or null when the chain is complete. */
export function nextStep(
  chain: ApprovalRequirement[],
  satisfiedSteps: number[],
): ApprovalRequirement | null {
  return chain.find((s) => !satisfiedSteps.includes(s.step)) ?? null;
}

export function isFullyApproved(
  chain: ApprovalRequirement[],
  satisfiedSteps: number[],
): boolean {
  return nextStep(chain, satisfiedSteps) === null;
}

// ---------------------------------------------------------------------------
// 5. Reminders
// ---------------------------------------------------------------------------

/**
 * Ten rules, all of them self-cancelling.
 *
 * `cancelsWhen` is the important column and the reason these are rules rather
 * than a cron job that emails a list. A reminder that keeps arriving after the
 * thing was done is how people learn to ignore reminders, so every rule here
 * names the condition that withdraws it.
 *
 * Offsets are days. Negative is before the date, positive after.
 */
export interface AdminReminderRule {
  key: string;
  label: string;
  /** What it watches. Matches ReminderRule.subject in the schema. */
  subject: string;
  offsets: number[];
  escalatesTo: Role | null;
  cancelsWhen: string;
}

export const ADMIN_REMINDER_RULES: AdminReminderRule[] = [
  {
    key: "admin.recurring_payment_due",
    label: "Recurring payment falling due",
    subject: "recurring_payment.dueDate",
    offsets: [-7, -2, 0, 1],
    escalatesTo: "finance_officer",
    cancelsWhen: "The payment instance is marked paid.",
  },
  {
    key: "admin.payment_variance",
    label: "Payment differs from the agreed amount",
    subject: "recurring_payment.variance",
    offsets: [0],
    escalatesTo: "finance_officer",
    cancelsWhen:
      "The variance is approved, or the amount is corrected to the agreed figure.",
  },
  {
    key: "admin.supplier_contract_renewal",
    label: "Supplier contract approaching its end",
    subject: "supplier_contract.endsOn",
    offsets: [-90, -60, -30, -7],
    escalatesTo: "admin_manager",
    cancelsWhen: "The contract is renewed, replaced, or marked as ending deliberately.",
  },
  {
    key: "admin.accreditation_renewal",
    label: "Accreditation renewal due",
    subject: "accreditation.expiresOn",
    offsets: [-120, -90, -60, -30, -7],
    escalatesTo: "top_management",
    cancelsWhen: "A renewal submission is recorded with a new expiry date.",
  },
  {
    key: "admin.accreditation_evidence_gap",
    label: "Accreditation evidence still missing",
    subject: "accreditation.evidenceGap",
    offsets: [-60, -30, -14],
    escalatesTo: "admin_manager",
    cancelsWhen: "Every evidence requirement on the accreditation is satisfied.",
  },
  {
    key: "admin.holiday_awaiting_decision",
    label: "Holiday request waiting on a decision",
    subject: "holiday_request.raisedAt",
    offsets: [2, 5],
    escalatesTo: "recruitment_manager",
    cancelsWhen: "The request is approved or rejected.",
  },
  {
    key: "admin.holiday_entitlement_unused",
    label: "Holiday entitlement at risk of being lost",
    subject: "holiday_entitlement.leaveYearEnd",
    offsets: [-90, -30],
    escalatesTo: "recruitment_manager",
    cancelsWhen: "The remaining balance is booked, carried over, or paid.",
  },
  {
    key: "admin.maintenance_due",
    label: "Asset service or inspection due",
    subject: "asset.nextServiceOn",
    offsets: [-14, -3, 0, 7],
    escalatesTo: "admin_manager",
    cancelsWhen: "A completed maintenance job is recorded against the asset.",
  },
  {
    key: "admin.uniform_return_outstanding",
    label: "Uniform still out with a leaver",
    subject: "equipment_issue.leaverDate",
    offsets: [7, 14, 30],
    escalatesTo: "admin_manager",
    cancelsWhen: "The item is returned, or written off with a reason.",
  },
  {
    key: "admin.approval_waiting",
    label: "Approval unanswered",
    subject: "admin_request.awaitingApprovalSince",
    offsets: [1, 2, 3],
    escalatesTo: "top_management",
    cancelsWhen:
      "The step is approved or rejected. Nothing on this ladder approves it automatically.",
  },
];

// ---------------------------------------------------------------------------
// 6. KPIs
// ---------------------------------------------------------------------------

/**
 * Every figure is a query over the event log and the Admin tables — no counter
 * is kept anywhere, which is why no two screens can disagree.
 *
 * `tolerance` is the watch band: how far past target counts as "watch" rather
 * than "at risk". Two measures have a tolerance of nothing at all, on purpose:
 * a missed renewal deadline and an accreditation inside 30 days with no
 * submission are both either fine or not fine, and a band would only soften
 * the one figure the department exists to protect.
 */
export interface AdminKpi {
  id: string;
  label: string;
  /** What makes the number, in words. */
  measure: string;
  unit: "percent" | "count" | "hours" | "pence" | "ratio";
  target: number;
  /** Which direction is good. */
  direction: "higher_is_better" | "lower_is_better";
  /** Watch band. 0 means no band: past target is immediately at risk. */
  tolerance: number;
  category: AdminCategoryId | "department";
}

export const ADMIN_KPIS: AdminKpi[] = [
  {
    id: "on_time_completion",
    label: "Tasks completed on time",
    measure: "Completed within their priority target, as a share of all completed this period.",
    unit: "percent",
    target: 95,
    direction: "higher_is_better",
    tolerance: 5,
    category: "department",
  },
  {
    id: "overdue_tasks",
    label: "Overdue tasks",
    measure: "Open items past their priority target right now.",
    unit: "count",
    target: 3,
    direction: "lower_is_better",
    tolerance: 5,
    category: "department",
  },
  {
    id: "average_completion",
    label: "Average completion time against target",
    measure: "Mean hours to completion as a percentage of the item's own target.",
    unit: "percent",
    target: 100,
    direction: "lower_is_better",
    tolerance: 20,
    category: "department",
  },
  {
    id: "renewals_missed",
    label: "Renewal deadlines missed",
    measure: "Accreditation or contract renewal dates that passed without a submission.",
    unit: "count",
    target: 0,
    direction: "lower_is_better",
    tolerance: 0,
    category: "accreditations",
  },
  {
    id: "renewals_upcoming_ready",
    label: "Upcoming renewals with evidence complete",
    measure: "Of renewals due inside 90 days, the share whose evidence is already gathered.",
    unit: "percent",
    target: 100,
    direction: "higher_is_better",
    tolerance: 10,
    category: "accreditations",
  },
  {
    id: "payments_on_time",
    label: "Recurring payments made on time",
    measure: "Payment instances settled on or before their due date.",
    unit: "percent",
    target: 100,
    direction: "higher_is_better",
    tolerance: 2,
    category: "payments",
  },
  {
    id: "holiday_pending",
    label: "Holiday requests pending over 5 days",
    measure: "Requests raised more than five days ago with no decision.",
    unit: "count",
    target: 0,
    direction: "lower_is_better",
    tolerance: 2,
    category: "people_admin",
  },
  {
    id: "uniform_outstanding",
    label: "Uniform outstanding from leavers",
    measure: "Returnable items issued to someone who has left and not yet back or written off.",
    unit: "count",
    target: 5,
    direction: "lower_is_better",
    tolerance: 7,
    category: "uniform",
  },
  {
    id: "penalties_outstanding",
    label: "Fines, penalties and vouchers outstanding",
    measure: "Total value raised and neither recovered, redeemed nor written off.",
    unit: "pence",
    target: 50_000,
    direction: "lower_is_better",
    tolerance: 100_000,
    category: "decisions",
  },
  {
    id: "accreditation_at_risk",
    label: "Accreditations inside 30 days with no submission",
    measure: "Held accreditations expiring within 30 days and nothing submitted.",
    unit: "count",
    target: 0,
    direction: "lower_is_better",
    tolerance: 0,
    category: "accreditations",
  },
  {
    id: "workload_spread",
    label: "Workload spread across the team",
    measure: "Busiest person's open items divided by the team median.",
    unit: "ratio",
    target: 1.5,
    direction: "lower_is_better",
    tolerance: 0.5,
    category: "department",
  },
  {
    id: "recurring_cost_run_rate",
    label: "Recurring cost against the agreed figures",
    measure: "This month's recurring payments as a percentage of their agreed amounts.",
    unit: "percent",
    target: 100,
    direction: "lower_is_better",
    tolerance: 5,
    category: "payments",
  },
];

export type KpiVerdict = "good" | "warning" | "serious" | "critical" | "neutral";

/** The same banding the management board uses, so the two never disagree. */
export function kpiVerdict(kpi: AdminKpi, value: number | null): KpiVerdict {
  if (value == null || !Number.isFinite(value)) return "neutral";

  const overBy =
    kpi.direction === "lower_is_better" ? value - kpi.target : kpi.target - value;

  if (overBy <= 0) return "good";
  if (kpi.tolerance === 0) return "critical";
  if (overBy <= kpi.tolerance) return "warning";
  if (overBy <= kpi.tolerance * 2) return "serious";
  return "critical";
}

// ---------------------------------------------------------------------------
// 7. Recurring work
// ---------------------------------------------------------------------------

/**
 * The repeating Admin jobs, configured once. Reuses the Work engine's
 * recurrence rather than a schedule of its own.
 */
export interface AdminRoutine {
  key: string;
  title: string;
  recurrence: Recurrence;
  priority: AdminPriority;
  ownerRole: Role;
  category: AdminCategoryId;
}

export const ADMIN_ROUTINES: AdminRoutine[] = [
  {
    key: "admin.monthly_payment_run",
    title: "Check the month's recurring payments against their agreed amounts",
    recurrence: "monthly",
    priority: "P2",
    ownerRole: "admin_officer",
    category: "payments",
  },
  {
    key: "admin.stock_count",
    title: "Count uniform stock and flag anything under its reorder level",
    recurrence: "monthly",
    priority: "P3",
    ownerRole: "admin_officer",
    category: "uniform",
  },
  {
    key: "admin.leaver_returns_sweep",
    title: "Chase outstanding uniform and equipment from leavers",
    recurrence: "weekly",
    priority: "P3",
    ownerRole: "admin_officer",
    category: "uniform",
  },
  {
    key: "admin.accreditation_evidence_review",
    title: "Review accreditation evidence for anything due in the next quarter",
    recurrence: "monthly",
    priority: "P3",
    ownerRole: "admin_manager",
    category: "accreditations",
  },
  {
    key: "admin.premises_walk",
    title: "Walk the office: appliances working, services in date, faults raised",
    recurrence: "monthly",
    priority: "P4",
    ownerRole: "admin_officer",
    category: "premises",
  },
  {
    key: "admin.holiday_balance_review",
    title: "Review holiday balances and flag entitlement at risk of being lost",
    recurrence: "quarterly",
    priority: "P4",
    ownerRole: "admin_manager",
    category: "people_admin",
  },
];

// ---------------------------------------------------------------------------
// 8. Where Admin avoids typing something twice
// ---------------------------------------------------------------------------

/**
 * Rendered on the Admin page, so the claim is checkable rather than a promise
 * in a document nobody opens.
 */
export interface DeDuplication {
  instead: string;
  the: string;
  because: string;
}

export const ADMIN_DEDUPLICATION: DeDuplication[] = [
  {
    instead: "Re-keying the employee's details onto a holiday form",
    the: "Holiday request reads the person record and their employment start date",
    because:
      "Pro-rata entitlement is arithmetic on a date we already hold. Typing it again is how two systems come to disagree about someone's leave.",
  },
  {
    instead: "Asking Control whether the officer is covered before granting leave",
    the: "The request shows the shifts the person is rostered on across those dates",
    because: "The rota already knows. The question is a query, not a phone call.",
  },
  {
    instead: "Building an accreditation evidence pack by hand each year",
    the: "Evidence assembles itself from screening completions, inspection results and training records",
    because:
      "This is the strongest one. The evidence an accreditation asks for is work the platform already recorded; the pack is a view over it, not a folder someone fills.",
  },
  {
    instead: "A separate approval inbox",
    the: "Approvals are steps on the work item, in the same queue as everything else",
    because: "One queue per person. A second inbox is a second thing to forget to open.",
  },
  {
    instead: "Monthly approval of the same rent figure",
    the: "The contract is approved once; only a variance, a new payee or a renewal asks again",
    because:
      "Approving an unchanged figure twelve times a year teaches people to approve without looking, which is the opposite of a control.",
  },
  {
    instead: "A uniform spreadsheet next to the equipment records",
    the: "Stock levels sit against the same item the issues and returns already point at",
    because:
      "Issues and returns were already modelled. Stock is the running total of movements, so a spreadsheet could only ever be a second, staler answer.",
  },
  {
    instead: "Typing supplier details onto each payment",
    the: "Payments reference the supplier record",
    because: "A changed bank detail should be one edit, and should be visible as one edit.",
  },
  {
    instead: "A folder of scanned documents organised by year",
    the: "Documents attach to the thing they are about — the supplier, the asset, the person, the accreditation",
    because:
      "Retention and expiry are properties of the subject, so a document filed by date cannot be swept correctly.",
  },
  {
    instead: "An Admin audit spreadsheet of who approved what",
    the: "Approvals write to the existing append-only event log",
    because:
      "The audit trail already exists and cannot be edited. A parallel record could be, which makes it worse than none.",
  },
];
