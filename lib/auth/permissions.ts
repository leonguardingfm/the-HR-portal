/**
 * Who may DO what.
 *
 * Distinct from who may SEE what, which is the navigation in
 * components/layout/nav.ts. Gating navigation was never enough: a role that
 * can reach a screen can still be the wrong role to press the buttons on it.
 *
 * This module is imported by the server actions and by the UI. The UI use is a
 * courtesy — it stops people clicking things that will be refused. The server
 * use is the enforcement. Anything that only checks here in the browser is not
 * enforced at all, so every action in lib/actions calls requirePermission
 * before it touches the database.
 *
 * Two deliberate shapes:
 *   - Higher management holds almost nothing operational. A director recording
 *     Control's check calls is precisely the intervention this prevents; the
 *     one thing they hold is countersigning a disposal.
 *   - The auditor holds nothing at all. Read-only across everything.
 */

import type { Role } from "@/lib/types";

export type ActionId =
  | "check_call.record"
  | "contact_attempt.log"
  | "book_on.record"
  | "incident.notify_client"
  | "assignment.publish"
  | "candidacy.advance"
  | "candidacy.withdraw"
  | "candidacy.create"
  | "onboarding.step"
  | "pin.allocate"
  | "document.verify"
  | "document.renew"
  | "disposal.run"
  | "work_item.complete"
  | "reminder.send"
  // --- Administration ----------------------------------------------------
  | "admin_item.raise"
  | "admin_item.assign"
  | "admin_item.start"
  | "admin_item.review"
  | "admin_item.approve"
  | "admin_item.reject"
  | "admin_item.complete"
  | "admin_item.cancel"
  | "payment.record"
  | "asset.maintain"
  | "holiday.decide"
  | "stock.move"
  | "accreditation.evidence"
  | "authority_matter.respond"
  | "threshold.change";

export interface ActionSpec {
  /** Roles permitted to take it. Everything else is refused. */
  roles: Role[];
  /** Named in the refusal, so people learn whose job it is. */
  owner: string;
  /** Phrased as the subject of a sentence: "<what> belongs to <owner>". */
  what: string;
}

const STAFF: Role[] = [
  "control",
  "operations_manager",
  "recruitment",
  "recruitment_manager",
  "admin_officer",
  "admin_manager",
  "finance_officer",
  "vetting_admin",
  "vetting_controller",
  "top_management",
];

/**
 * The Admin department.
 *
 * Note what the Finance Officer does NOT hold. They approve spend and they see
 * every cost; they cannot decide someone's holiday, respond to an authority on
 * the company's behalf, or move uniform stock. That is the separation the
 * approval ladder depends on, and writing it as a role rather than a rank is
 * what keeps it true when the same person also sits in higher management.
 */
const ADMIN_TEAM: Role[] = ["admin_officer", "admin_manager"];

export const ACTIONS: Record<ActionId, ActionSpec> = {
  "check_call.record": { roles: ["control", "operations_manager"], owner: "Control", what: "Recording a check call" },
  "contact_attempt.log": { roles: ["control", "operations_manager"], owner: "Control", what: "Logging a contact attempt" },
  "book_on.record": { roles: ["control", "operations_manager"], owner: "Control", what: "Booking an officer on" },
  "incident.notify_client": { roles: ["control", "operations_manager"], owner: "Control or the Operations Manager", what: "Recording a client notification" },
  "assignment.publish": { roles: ["control", "operations_manager"], owner: "Control", what: "Publishing a shift to the rota" },
  "candidacy.advance": { roles: ["recruitment", "recruitment_manager"], owner: "Recruitment", what: "Moving a candidate through the pipeline" },
  "candidacy.withdraw": { roles: ["recruitment", "recruitment_manager"], owner: "Recruitment", what: "Withdrawing a candidate" },
  "candidacy.create": { roles: ["recruitment", "recruitment_manager"], owner: "Recruitment", what: "Creating a candidate record" },
  "onboarding.step": { roles: ["recruitment", "recruitment_manager"], owner: "Recruitment", what: "Completing an onboarding step" },
  "pin.allocate": { roles: ["recruitment", "recruitment_manager"], owner: "Recruitment", what: "Allocating a PIN" },
  "document.verify": { roles: ["vetting_admin", "vetting_controller"], owner: "the Screening Administrator", what: "Verifying a document" },
  "document.renew": { roles: ["vetting_admin", "vetting_controller"], owner: "the Screening Administrator", what: "Renewing a compliance document" },
  // Disposal is countersigned, so it sits with the controller and higher
  // management rather than with whoever happens to run the sweep [clause 11].
  "disposal.run": { roles: ["vetting_controller", "top_management"], owner: "the Screening Controller", what: "Running a retention disposal" },
  "work_item.complete": { roles: STAFF, owner: "the person the task is assigned to", what: "Closing a task" },
  "reminder.send": { roles: STAFF, owner: "anyone but the Auditor", what: "Sending a reminder early" },

  // --- Administration ------------------------------------------------------
  // Raising is open to every member of staff on purpose: an Admin request that
  // has to be asked for through Admin is a request that gets asked for by
  // WhatsApp instead, and then it is not in the platform at all.
  "admin_item.raise": { roles: STAFF, owner: "anyone but the Auditor", what: "Raising an Admin task or request" },
  "admin_item.assign": { roles: ["admin_manager", "top_management"], owner: "the Admin Manager", what: "Assigning Admin work" },
  "admin_item.start": { roles: [...ADMIN_TEAM, "top_management"], owner: "the Admin team", what: "Starting an Admin item" },
  "admin_item.review": { roles: [...ADMIN_TEAM, "top_management"], owner: "the Admin team", what: "Reviewing and costing a request" },
  // Approving is not a single role: which role may sign depends on the amount
  // and on who the request is about. This entry says who may ever hold a pen;
  // approvalChain and canApproveStep in lib/core/admin.ts decide which rung
  // this particular person may sign, and the database refuses the rest.
  "admin_item.approve": {
    roles: ["admin_manager", "finance_officer", "recruitment_manager", "top_management"],
    owner: "the approver named on the step",
    what: "Approving a request",
  },
  "admin_item.reject": {
    roles: ["admin_manager", "finance_officer", "recruitment_manager", "top_management"],
    owner: "the approver named on the step",
    what: "Rejecting a request",
  },
  "admin_item.complete": { roles: [...ADMIN_TEAM, "top_management"], owner: "the Admin team", what: "Completing an Admin item" },
  "admin_item.cancel": { roles: ["admin_manager", "top_management"], owner: "the Admin Manager", what: "Cancelling an Admin item" },
  "payment.record": { roles: [...ADMIN_TEAM, "finance_officer"], owner: "the Admin team or the Finance Officer", what: "Recording a payment" },
  "asset.maintain": { roles: ADMIN_TEAM, owner: "the Admin team", what: "Recording maintenance on an asset" },
  // Holiday is a decision about a person, so it sits with Admin and HR — never
  // with Finance.
  "holiday.decide": { roles: ["admin_manager", "recruitment_manager", "top_management"], owner: "the Admin Manager or the HR Manager", what: "Deciding a holiday request" },
  "stock.move": { roles: [...ADMIN_TEAM, "recruitment"], owner: "the Admin team", what: "Recording a stock movement" },
  "accreditation.evidence": { roles: [...ADMIN_TEAM, "vetting_controller", "top_management"], owner: "the Admin team", what: "Marking accreditation evidence satisfied" },
  "authority_matter.respond": { roles: ["admin_manager", "recruitment_manager", "top_management"], owner: "the Admin Manager or the HR Manager", what: "Responding to an external authority" },
  // Changing a threshold changes who may approve what, so it belongs with the
  // portal owner rather than with the people it governs.
  "threshold.change": { roles: ["top_management"], owner: "higher management", what: "Changing an approval threshold" },
};

export function canDo(role: Role | null | undefined, action: ActionId): boolean {
  if (!role) return false;
  return ACTIONS[action].roles.includes(role);
}

/** Thrown by requirePermission. Carries a sentence fit to show a user. */
export class PermissionError extends Error {
  readonly action: ActionId;
  constructor(action: ActionId, role: Role | null) {
    const spec = ACTIONS[action];
    super(
      `${spec.what} belongs to ${spec.owner}. You are working as ${role ?? "no role"}, so this was refused.`,
    );
    this.name = "PermissionError";
    this.action = action;
  }
}

/**
 * The enforcement point. Every server action calls this first, before it reads
 * its arguments and before it touches the database.
 */
export function requirePermission(role: Role | null | undefined, action: ActionId): void {
  if (!canDo(role, action)) throw new PermissionError(action, role ?? null);
}
