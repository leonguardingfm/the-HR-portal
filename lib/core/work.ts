/**
 * The work queue's departments — which roles work which part of it. Kept as a
 * rule rather than on each task, so that moving a role between departments is
 * one change here and not a rewrite of every open item.
 */

import type { Role } from "@/lib/types";

export type QueueDepartment = "control" | "recruitment" | "vetting" | "administration" | "management";

export const QUEUE_DEPARTMENTS: { id: QueueDepartment; label: string; roles: Role[]; event: "control" | "recruitment" | "vetting" | "administration" }[] = [
  { id: "control", label: "Control Room", roles: ["control", "shift_supervisor", "operations_manager"], event: "control" },
  { id: "recruitment", label: "HR", roles: ["recruitment", "recruitment_manager"], event: "recruitment" },
  { id: "vetting", label: "Vetting", roles: ["vetting_admin", "vetting_controller"], event: "vetting" },
  { id: "administration", label: "Admin", roles: ["admin_officer", "admin_manager", "finance_officer"], event: "administration" },
  { id: "management", label: "Higher management", roles: ["top_management"], event: "administration" },
];

export function departmentOfRole(role: Role) {
  return QUEUE_DEPARTMENTS.find((d) => d.roles.includes(role)) ?? QUEUE_DEPARTMENTS[QUEUE_DEPARTMENTS.length - 1];
}

/**
 * What a manager may see across people (26 September 2026): the Managing
 * Director — and the auditor, who checks everything — see every department
 * and every person; every other manager sees only their own department, as
 * team totals. Departments stay separate, and individual figures are the
 * Managing Director's.
 */
export function oversightScope(role: Role): { all: boolean; roles: Role[]; perPerson: boolean } {
  if (role === "top_management" || role === "auditor") return { all: true, roles: [], perPerson: true };
  return { all: false, roles: departmentOfRole(role).roles, perPerson: false };
}

export function rolesOfDepartment(d: { id: QueueDepartment }): Role[] {
  return QUEUE_DEPARTMENTS.find((x) => x.id === d.id)?.roles ?? [];
}
