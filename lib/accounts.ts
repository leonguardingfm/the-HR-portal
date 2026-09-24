/**
 * Self-registration, by department.
 *
 * People register against a department, not a role, because "which team are
 * you in" is a question anyone can answer and "which BS 7858 role do you hold"
 * is not. Each department maps onto exactly one Role, so the permission model
 * underneath stays the Role enum and nothing in lib/auth/permissions.ts has to
 * know that registration exists.
 *
 * Imported by proxy.ts, so nothing here may touch the database or node APIs.
 */

import type { Role } from "@/lib/types";

export type AccountDepartment =
  | "control_room"
  | "hr_recruitment"
  | "hr_vetting"
  | "sales"
  | "administration"
  | "client_portal"
  | "officer";

export type AccountStatus = "pending" | "active" | "suspended" | "rejected";

export interface DepartmentSpec {
  id: AccountDepartment;
  label: string;
  /** The role granted when the account is activated. */
  role: Role;
  /** One line, shown under the option at sign-up. */
  description: string;
  /**
   * Why the account waits for an administrator, or null when it is active on
   * registration. Two departments cannot be self-granted:
   *   - Administration, because it can see and manage every account.
   *   - HR – Vetting, because a screening role needs clause 6.1/6.2 evidence
   *     (screened, NDA, training) before it is granted, and a person cannot
   *     vouch for their own.
   */
  needsApproval: string | null;
}

export const DEPARTMENTS: DepartmentSpec[] = [
  {
    id: "control_room",
    label: "Control Room",
    role: "control",
    description: "Live board, book-ons, check calls and the rota.",
    needsApproval: null,
  },
  {
    id: "hr_recruitment",
    label: "HR – Recruitment",
    role: "recruitment",
    description: "Candidates, interviews, forms and onboarding.",
    needsApproval: null,
  },
  {
    id: "hr_vetting",
    label: "HR – Vetting",
    role: "vetting_admin",
    description: "BS 7858 screening files, checks and evidence.",
    needsApproval:
      "Screening roles need your own screening, a confidentiality agreement and training confirmed first (BS 7858, 6.1 and 6.2).",
  },
  {
    id: "sales",
    label: "Sales",
    role: "sales",
    description: "Clients, their sites and open requirements.",
    needsApproval: null,
  },
  {
    id: "administration",
    label: "Administration",
    role: "admin_manager",
    description: "Admin work, approvals and user management.",
    needsApproval: "Administration can see and manage every account, so an administrator approves it.",
  },
  {
    id: "client_portal",
    label: "Client Portal",
    role: "client",
    description: "For client contacts. No access to internal screens.",
    needsApproval: null,
  },
  {
    // Not offered on the ordinary sign-up: an officer already exists as a
    // person, with a PIN, and their account attaches to that record after they
    // prove who they are (/signup/officer).
    id: "officer",
    label: "Officers",
    role: "officer",
    description: "Security officers: their own duties, book-on and check calls.",
    needsApproval: null,
  },
];

/** The departments the ordinary sign-up offers. Officers have their own. */
export const SIGNUP_DEPARTMENTS = DEPARTMENTS.filter((d) => d.id !== "officer");

export const DEPARTMENT_LABELS = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.id, d.label]),
) as Record<AccountDepartment, string>;

export function departmentSpec(id: string): DepartmentSpec | undefined {
  return DEPARTMENTS.find((d) => d.id === id);
}

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  pending: "Pending approval",
  active: "Active",
  suspended: "Suspended",
  rejected: "Rejected",
};

/** Roles that may see and manage registered accounts. */
export const USER_ADMIN_ROLES: Role[] = ["admin_manager", "top_management"];

/** Where each role lands after signing in, and when sent away from a page. */
export function roleHome(role: Role): string {
  if (role === "client") return "/client-portal";
  if (role === "officer") return "/me";
  if (role === "sales") return "/sales";
  return "/";
}

/** Lower-case, trimmed. Letters, digits, dot, dash and underscore, 3–32. */
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
export const PASSWORD_MIN = 10;

/**
 * The password `npm run db:seed` gives the demonstration accounts. Development
 * only: shown on the sign-in page outside production so the seeded roles stay
 * easy to try, and never used by anything else.
 */
export const DEV_SEED_PASSWORD = "leon-portal-dev";
