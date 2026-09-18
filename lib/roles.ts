/**
 * Roles, and the rules about who may do what.
 *
 * Deliberately no names in this file. Who holds which role is *data*, set up in
 * Admin and changed as people join, leave or move between teams — not a
 * constant compiled into the build. Headcount per team is likewise not fixed
 * anywhere: the rules below are expressed as conditions on whoever is assigned,
 * so a team of two and a team of ten both work without a code change.
 *
 * What is fixed is the set of roles a person can sign in as, because those come
 * from BS 7858's own vocabulary (screening administrator, screening controller,
 * top management) plus our own operational split.
 */

import type { Role } from "./types";

export interface RoleOption {
  id: Role;
  label: string;
  /** Shown under the option at sign-in, so people pick the right one. */
  description: string;
  /** Clause that defines the role, where the standard names it. */
  clause?: string;
}

/**
 * The predefined options offered at sign-in. A person may be set up with
 * several and choose which one they are working as for this session, which is
 * what makes "who is doing what right now" answerable.
 */
export const ROLE_OPTIONS: RoleOption[] = [
  {
    id: "control",
    label: "Control",
    description:
      "Raise requirements, check the officer pool, allocate officers and roster them.",
  },
  {
    id: "recruitment",
    label: "Recruitment",
    description:
      "Source, shortlist, invite, chase, hold the first interview, issue packs and onboard.",
  },
  {
    id: "recruitment_manager",
    label: "HR Manager",
    description:
      "All of Recruitment, plus the second interview and workload, reassignment and escalations.",
  },
  {
    id: "vetting_admin",
    label: "Screening Administrator",
    description:
      "Carry out checks, request and record evidence, and maintain the screening file.",
    clause: "3.10",
  },
  {
    id: "vetting_controller",
    label: "Screening Controller",
    description:
      "Review and sign off screening files; responsible for the process being carried out correctly.",
    clause: "3.11",
  },
  {
    id: "top_management",
    label: "Higher Management",
    description:
      "Accept risk, approve extensions and statutory declarations, and screen the controllers.",
    clause: "3.15",
  },
  {
    id: "auditor",
    label: "Auditor",
    description: "Read-only across everything, including the audit log.",
  },
];

export function roleOption(id: Role): RoleOption | undefined {
  return ROLE_OPTIONS.find((r) => r.id === id);
}

/**
 * Roles that count as being engaged in screening, and therefore attract the
 * clause 6.1 and 6.2 obligations: screened themselves, confidentiality
 * agreement signed, trained, and that training reviewed at least annually.
 */
export const SCREENING_ROLES: Role[] = [
  "vetting_admin",
  "vetting_controller",
  "top_management",
];

export function isScreeningRole(role: Role): boolean {
  return SCREENING_ROLES.includes(role);
}

// ---------------------------------------------------------------------------
// Assignment rules
// ---------------------------------------------------------------------------

/** A person as the assignment rules need to see them. No names in the rules. */
export interface Assignee {
  userId: string;
  personId: string;
  roles: Role[];
}

export interface AssignmentResult {
  permitted: boolean;
  reason: string | null;
}

/**
 * Whether a proposed administrator/controller pairing on a screening file is
 * allowed. Three rules, applied to whoever happens to hold the roles:
 *
 *  1. Nobody screens themselves, in either seat [6.1].
 *  2. The controller who reviews a file is not the administrator who built
 *     it [7.5.2b].
 *  3. Where the subject is themselves a screening controller, the file is
 *     administered by higher management — confirmed policy, and the only way
 *     to satisfy rules 1 and 2 without reaching outside the organisation.
 *
 * Rule 3 is what makes the arrangement scale. With any number of controllers,
 * a controller's own file goes to higher management and is reviewed by a
 * different controller; no named person is baked in anywhere.
 */
export function validateFileAssignment(args: {
  subject: Assignee;
  administrator: Assignee | null;
  controller: Assignee | null;
}): AssignmentResult {
  const { subject, administrator, controller } = args;

  if (administrator && administrator.personId === subject.personId) {
    return {
      permitted: false,
      reason: "An individual may not screen themselves (6.1)",
    };
  }
  if (controller && controller.personId === subject.personId) {
    return {
      permitted: false,
      reason: "An individual may not review their own screening file (6.1)",
    };
  }
  if (administrator && controller && administrator.userId === controller.userId) {
    return {
      permitted: false,
      reason:
        "The controller reviewing a file may not be the administrator who built it (7.5.2b)",
    };
  }
  if (
    subject.roles.includes("vetting_controller") &&
    administrator &&
    !administrator.roles.includes("top_management")
  ) {
    return {
      permitted: false,
      reason:
        "A screening controller's own file is administered by higher management",
    };
  }

  return { permitted: true, reason: null };
}

/**
 * Whether a role may be granted to a person at all.
 *
 * Anyone engaged in screening must be screened themselves, have signed a
 * confidentiality agreement, and hold training that is in date [6.1, 6.2]. The
 * portal blocks the grant rather than trusting it to be remembered.
 */
export function canGrantRole(args: {
  role: Role;
  ownScreeningComplete: boolean;
  confidentialityAgreementOnFile: boolean;
  trainingReviewedAt: string | null;
  now?: Date;
}): AssignmentResult {
  if (!isScreeningRole(args.role)) return { permitted: true, reason: null };

  if (!args.ownScreeningComplete) {
    return {
      permitted: false,
      reason: "Screening staff must themselves be screened to BS 7858 (6.1)",
    };
  }
  if (!args.confidentialityAgreementOnFile) {
    return {
      permitted: false,
      reason:
        "A confidentiality agreement covering employment and post-employment is required (6.1)",
    };
  }
  if (!args.trainingReviewedAt) {
    return {
      permitted: false,
      reason: "No training record on file (6.2)",
    };
  }

  const now = args.now ?? new Date();
  const reviewed = new Date(args.trainingReviewedAt);
  const monthsSince =
    (now.getTime() - reviewed.getTime()) / (1000 * 60 * 60 * 24 * 365.25 / 12);
  if (monthsSince > 12) {
    return {
      permitted: false,
      reason: "Training review is overdue — it must be reviewed at least annually (6.2)",
    };
  }

  return { permitted: true, reason: null };
}
