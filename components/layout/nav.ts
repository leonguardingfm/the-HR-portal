import type { Role } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  /** One-line purpose, shown on the module's own page and in the nav tooltip. */
  purpose: string;
  /**
   * Roles that see this item. Items a role cannot access are not rendered at
   * all, rather than shown disabled — see docs/proposal/06.
   */
  roles: Role[];
}

const ALL: Role[] = [
  "control",
  "recruitment",
  "recruitment_manager",
  "vetting_admin",
  "vetting_controller",
  "top_management",
  "auditor",
];

export const NAV: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    purpose: "Role-aware landing page: outstanding cover, breach risk, delays and workload.",
    roles: ALL,
  },
  {
    href: "/tasks",
    label: "My Tasks",
    purpose: "Everything assigned to me, most overdue first, with the action one click away.",
    roles: ALL,
  },
  {
    href: "/requirements",
    label: "Requirements",
    purpose: "Client staffing requirements, the officer pool check, and the timestamped handover to HR.",
    roles: ALL,
  },
  {
    href: "/officers",
    label: "Officers",
    purpose: "The existing officer pool, availability, deployability and SIA licence expiry.",
    roles: ALL,
  },
  {
    href: "/candidates",
    label: "Candidates",
    purpose: "The single candidate record and the recruitment pipeline, with duplicate checks at the point of entry.",
    roles: [
      "recruitment",
      "recruitment_manager",
      "vetting_admin",
      "vetting_controller",
      "top_management",
      "auditor",
    ],
  },
  {
    href: "/vetting",
    label: "Vetting",
    purpose: "BS 7858 screening files, checks, evidence, the clock and the controller review queue.",
    roles: [
      "vetting_admin",
      "vetting_controller",
      "top_management",
      "auditor",
      "recruitment_manager",
    ],
  },
  {
    href: "/onboarding",
    label: "Onboarding",
    purpose: "The post-offer admin checklist: Recruitment Sheet, PIN, Casper, Watch List, Maps, notification.",
    roles: ["recruitment", "recruitment_manager", "top_management", "auditor", "control"],
  },
  {
    href: "/reports",
    label: "Reports",
    purpose: "KPIs, delay analysis, source effectiveness and audit extracts.",
    roles: ["recruitment_manager", "vetting_controller", "top_management", "auditor"],
  },
  {
    href: "/admin",
    label: "Admin",
    purpose: "Users and roles, clients and sites, templates, service levels, retention and the audit log.",
    roles: ["recruitment_manager", "vetting_controller", "top_management", "auditor"],
  },
];

export function navForRole(role: Role): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}

export function navItemByHref(href: string): NavItem | undefined {
  return NAV.find((item) => item.href === href);
}
