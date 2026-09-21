import type { Role } from "@/lib/types";

/**
 * Navigation, grouped the way the business is organised.
 *
 * A team should find the whole of its job in one group: Control's day starts on
 * the live board, a recruiter's on their queue, a director's on the dashboard.
 * Groups are the departments in docs/platform/01 §5.
 */
export type NavGroup = "Home" | "Operate" | "Grow" | "Assure" | "Run" | "See";

export const NAV_GROUPS: NavGroup[] = [
  "Home",
  "Operate",
  "Grow",
  "Assure",
  "Run",
  "See",
];

export interface NavItem {
  href: string;
  label: string;
  /** One-line purpose, shown on the module's own page and in the nav tooltip. */
  purpose: string;
  group: NavGroup;
  /**
   * Roles that see this item. Items a role cannot access are not rendered at
   * all, rather than shown disabled — see docs/proposal/06.
   */
  roles: Role[];
  /** False where the screens are an honest placeholder rather than built. */
  built: boolean;
}

const ALL: Role[] = [
  "control",
  "operations_manager",
  "recruitment",
  "recruitment_manager",
  "vetting_admin",
  "vetting_controller",
  "top_management",
  "auditor",
];

const MANAGEMENT: Role[] = [
  "operations_manager",
  "recruitment_manager",
  "vetting_controller",
  "top_management",
  "auditor",
];

const OPERATIONS: Role[] = [
  "control",
  "operations_manager",
  "recruitment_manager",
  "top_management",
  "auditor",
];

const HR: Role[] = [
  "recruitment",
  "recruitment_manager",
  "vetting_admin",
  "vetting_controller",
  "top_management",
  "auditor",
];

export const NAV: NavItem[] = [
  // --- Home ----------------------------------------------------------------
  {
    href: "/",
    label: "Dashboard",
    purpose: "Role-aware landing page: live cover, breach risk, delays and workload.",
    group: "Home",
    roles: ALL,
    built: true,
  },

  // --- Operate -------------------------------------------------------------
  {
    href: "/live",
    label: "Live board",
    purpose: "Every post on now: book-ons, check calls, welfare and what needs a phone call.",
    group: "Operate",
    roles: OPERATIONS,
    built: true,
  },
  {
    href: "/scheduling",
    label: "Scheduling",
    purpose: "The rota, shift changes with their history, and the compliance block on publication.",
    group: "Operate",
    roles: OPERATIONS,
    built: true,
  },
  {
    href: "/requirements",
    label: "Requirements",
    purpose: "Client staffing requirements, the officer pool check, and the timestamped handover to HR.",
    group: "Operate",
    roles: ALL,
    built: true,
  },

  // --- Grow ----------------------------------------------------------------
  {
    href: "/candidates",
    label: "Candidates",
    purpose: "The single candidate record and the recruitment pipeline, with duplicate checks at the point of entry.",
    group: "Grow",
    roles: HR,
    built: true,
  },
  {
    href: "/vetting",
    label: "Vetting",
    purpose: "BS 7858 screening files, checks, evidence, the clock and the controller review queue.",
    group: "Grow",
    roles: [
      "vetting_admin",
      "vetting_controller",
      "top_management",
      "auditor",
      "recruitment_manager",
    ],
    built: true,
  },
  {
    href: "/onboarding",
    label: "Onboarding",
    purpose: "The post-offer admin checklist: Recruitment Sheet, PIN, Casper, Watch List, Maps, notification.",
    group: "Grow",
    roles: ["recruitment", "recruitment_manager", "top_management", "auditor", "control"],
    built: true,
  },

  // --- Assure --------------------------------------------------------------
  {
    href: "/compliance",
    label: "Compliance",
    purpose: "Every licence, right to work and document with an expiry date, and who it blocks.",
    group: "Assure",
    roles: [...MANAGEMENT, "control", "vetting_admin"],
    built: true,
  },
  {
    href: "/quality",
    label: "Quality",
    purpose: "Site inspections, operational reports and the corrective actions they raise.",
    group: "Assure",
    roles: MANAGEMENT,
    built: false,
  },
  {
    href: "/clients",
    label: "Clients",
    purpose: "Contracts, service levels, feedback and satisfaction scores per client.",
    group: "Assure",
    roles: MANAGEMENT,
    built: false,
  },

  // --- Run -----------------------------------------------------------------
  {
    href: "/officers",
    label: "Officers",
    purpose: "The existing officer pool, availability, deployability and SIA licence expiry.",
    group: "Run",
    roles: ALL,
    built: true,
  },
  {
    href: "/people",
    label: "People",
    purpose: "The person record for life: applicant through officer to leaver and rehire.",
    group: "Run",
    roles: [...MANAGEMENT, "recruitment"],
    built: false,
  },
  {
    href: "/equipment",
    label: "Equipment",
    purpose: "Uniform measurements, issues and returns; radios, keys and PPE.",
    group: "Run",
    roles: [...MANAGEMENT, "recruitment", "control"],
    built: false,
  },
  {
    href: "/tasks",
    label: "My tasks",
    purpose: "Everything assigned to me, most overdue first, with the action one click away.",
    group: "Run",
    roles: ALL,
    built: true,
  },

  // --- See -----------------------------------------------------------------
  {
    href: "/reports",
    label: "Insight",
    purpose: "Department KPIs, delay analysis, source effectiveness and audit extracts.",
    group: "See",
    roles: MANAGEMENT,
    built: true,
  },
  {
    href: "/platform",
    label: "Platform map",
    purpose: "The domains, the shared engines and the single-source-of-truth register.",
    group: "See",
    roles: MANAGEMENT,
    built: true,
  },
  {
    href: "/admin",
    label: "Admin",
    purpose: "Users and roles, clients and sites, templates, service levels, retention and the audit log.",
    group: "See",
    roles: MANAGEMENT,
    built: true,
  },
];

export function navForRole(role: Role): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}

/** Grouped, in the fixed group order, skipping groups this role cannot see. */
export function navGroupsForRole(role: Role): { group: NavGroup; items: NavItem[] }[] {
  const items = navForRole(role);
  return NAV_GROUPS.map((group) => ({
    group,
    items: items.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);
}

export function navItemByHref(href: string): NavItem | undefined {
  return NAV.find((item) => item.href === href);
}
