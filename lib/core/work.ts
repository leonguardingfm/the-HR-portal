/**
 * The work queue's departments — which roles work which part of it. Kept as a
 * rule rather than on each task, so that moving a role between departments is
 * one change here and not a rewrite of every open item.
 */

import type { Role } from "@/lib/types";

export type QueueDepartment = "control" | "recruitment" | "vetting" | "administration" | "management";

export const QUEUE_DEPARTMENTS: { id: QueueDepartment; label: string; roles: Role[]; event: "control" | "recruitment" | "vetting" | "administration" }[] = [
  { id: "control", label: "Control Room", roles: ["control", "operations_manager"], event: "control" },
  { id: "recruitment", label: "HR", roles: ["recruitment", "recruitment_manager"], event: "recruitment" },
  { id: "vetting", label: "Vetting", roles: ["vetting_admin", "vetting_controller"], event: "vetting" },
  { id: "administration", label: "Admin", roles: ["admin_officer", "admin_manager", "finance_officer"], event: "administration" },
  { id: "management", label: "Higher management", roles: ["top_management"], event: "administration" },
];

export function departmentOfRole(role: Role) {
  return QUEUE_DEPARTMENTS.find((d) => d.roles.includes(role)) ?? QUEUE_DEPARTMENTS[QUEUE_DEPARTMENTS.length - 1];
}

export function rolesOfDepartment(d: { id: QueueDepartment }): Role[] {
  return QUEUE_DEPARTMENTS.find((x) => x.id === d.id)?.roles ?? [];
}
