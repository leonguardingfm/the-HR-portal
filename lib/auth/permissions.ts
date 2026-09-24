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
  | "threshold.change"
  | "role.delegate"
  | "role.revoke_delegation"
  | "no_signal.notify_client"
  | "no_signal.report_loss"
  | "account.review"
  | "screening.open"
  | "screening.assign"
  | "screening.check"
  | "screening.review"
  | "screening.exception.raise"
  | "screening.exception.decide"
  | "screening.sweep"
  | "requirement.raise"
  | "requirement.manage"
  | "chase_up.record"
  | "duty.self"
  | "rota.build"
  | "rota.change"
  | "officer.hours"
  | "work_item.take"
  | "alerts.subscribe"
  | "place.manage"
  | "officer.exclude"
  | "welfare.visit"
  | "candidate.invite"
  | "candidacy.edit"
  | "interview.book"
  | "employee.edit"
  | "employee.payroll"
  | "employee.leaver";

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
  // Lending a role is an access decision, so it sits with higher management
  // rather than with the department that benefits from the cover.
  "role.delegate": { roles: ["top_management"], owner: "higher management", what: "Lending a role to cover an absence" },
  "role.revoke_delegation": { roles: ["top_management"], owner: "higher management", what: "Ending a delegation early" },
  // The helpdesk and Control Room are the same desk for this purpose: whoever
  // is on it tells the client the officer has gone in without a signal.
  "no_signal.notify_client": { roles: ["control", "operations_manager"], owner: "the Control Room or helpdesk", what: "Telling the client the officer is on site with no signal" },
  // Recording what a client has told us. The client does not do this; we do,
  // on their behalf, which is why it is an internal permission.
  "no_signal.report_loss": { roles: ["control", "operations_manager"], owner: "the Control Room or helpdesk", what: "Recording that the client has lost contact with the officer" },
  // Approving a registration grants a role, and suspending one takes it away,
  // so both are access decisions for the Admin Manager or higher management.
  // --- Screening files [6.1, 7.5.2b] ----------------------------------------
  // The administrator builds a file and the controller reviews it, and the two
  // are never the same person on one file. These entries say which roles may
  // ever sit in each seat; the actions also check that this person holds the
  // seat on THIS file, and the database trigger refuses the rest. Higher
  // management administers a controller's own file, so it can open and work
  // one too.
  "screening.open": { roles: ["vetting_admin", "top_management"], owner: "the Screening Administrator", what: "Opening a screening file" },
  "screening.assign": { roles: ["vetting_admin", "vetting_controller", "top_management"], owner: "the Screening Administrator or Controller", what: "Assigning a file's controller" },
  "screening.check": { roles: ["vetting_admin", "top_management"], owner: "the file's Screening Administrator", what: "Recording progress on a screening check" },
  "screening.review": { roles: ["vetting_controller"], owner: "the file's Screening Controller", what: "Reviewing a screening file" },
  // Exceptions [7.4f, 7.6, 7.7i]. The administrator raises the case and records
  // the individual's representation; only higher management decides it, and
  // never on a case they raised themselves (lib/core/screening-exceptions.ts).
  "screening.exception.raise": { roles: ["vetting_admin", "top_management"], owner: "the file's Screening Administrator", what: "Raising a finding or request on a screening file" },
  "screening.exception.decide": { roles: ["top_management"], owner: "higher management", what: "Deciding a risk acceptance, extension or statutory declaration" },
  // Client requirements are Control's (Track A). HR sees them and sources
  // against them; it does not raise, release or close them.
  "requirement.raise": { roles: ["control", "operations_manager"], owner: "Control", what: "Raising a client requirement" },
  "requirement.manage": { roles: ["control", "operations_manager"], owner: "Control", what: "Working a client requirement: the pool check, release to HR, allocation and closing" },
  "chase_up.record": { roles: ["control", "operations_manager"], owner: "Control", what: "Chasing up an officer before their shift" },
  // The officer's own: and only ever for their own shift, which each action checks on top of this.
  "duty.self": { roles: ["officer"], owner: "the officer on the shift", what: "Confirming, booking on and making check calls for your own shift" },
  "rota.build": { roles: ["control", "operations_manager"], owner: "Control", what: "Building the rota: asking officers, putting shifts on as drafts and naming a post's regular officer" },
  "rota.change": { roles: ["control", "operations_manager"], owner: "Control", what: "Changing the rota once it is published: an officer off, cover, new hours or a cancelled shift" },
  // Control's, like the rest of the rota (24 September 2026). Every change is an event naming who made it.
  "officer.hours": { roles: ["control", "operations_manager"], owner: "Control", what: "Setting an officer's agreed weekly hours" },
  // Taking a task from the department's pool, or handing it back: so two
  // Control desks can see which of them is on what (25 September 2026).
  "work_item.take": { roles: STAFF, owner: "the department the task belongs to", what: "Taking or handing back a task" },
  // A device saying yes to alerts. Everybody's own, officers included.
  "alerts.subscribe": { roles: [...STAFF, "officer"], owner: "anyone signed in", what: "Turning alerts on for a phone or computer" },
  // Clients, sites and posts are Control's: a post's check-call rule, its
  // signal and its instructions are what the rota and the duty checks run on.
  "place.manage": { roles: ["control", "operations_manager"], owner: "Control", what: "Adding and changing clients, sites and posts" },
  "officer.exclude": { roles: ["control", "operations_manager"], owner: "Control", what: "Keeping an officer off a site, or lifting it" },
  // Step 3 of the ladder: sending a supervisor or the Operations Manager to
  // site, and recording what they found (25 September 2026).
  // HR self-service (25 September 2026). Recruitment sends the candidate their
  // application link, keeps their details right and books their interviews.
  "candidate.invite": { roles: ["recruitment", "recruitment_manager"], owner: "Recruitment", what: "Sending a candidate their application form or welcome pack" },
  "candidacy.edit": { roles: ["recruitment", "recruitment_manager"], owner: "Recruitment", what: "Correcting a candidate's details" },
  "interview.book": { roles: ["recruitment", "recruitment_manager"], owner: "Recruitment", what: "Booking an interview" },
  // The employee record is HR's and Admin's: contact, next of kin, contract,
  // training, leave and documents. Pay and the payroll reference go further only
  // to those who handle pay; ending someone's employment is a manager's decision.
  "employee.edit": { roles: ["recruitment", "recruitment_manager", "admin_officer", "admin_manager"], owner: "HR or Admin", what: "Keeping an employee's record up to date" },
  "employee.payroll": { roles: ["recruitment_manager", "admin_manager", "finance_officer"], owner: "the HR Manager, the Admin Manager or the Finance Officer", what: "Seeing or changing pay and the payroll reference" },
  "employee.leaver": { roles: ["recruitment_manager", "admin_manager", "top_management"], owner: "the HR Manager or the Admin Manager", what: "Recording that an employee is leaving" },
  "welfare.visit": { roles: ["control", "operations_manager"], owner: "Control or the Operations Manager", what: "Sending someone to site and recording what they found" },
  "screening.sweep": { roles: ["vetting_controller", "top_management"], owner: "a Screening Controller or higher management", what: "Running the screening clock check" },
  "account.review": { roles: ["admin_manager", "top_management"], owner: "the Admin Manager", what: "Approving, suspending or reactivating an account" },
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
