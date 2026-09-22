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
  | "reminder.send";

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
  "vetting_admin",
  "vetting_controller",
  "top_management",
];

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
