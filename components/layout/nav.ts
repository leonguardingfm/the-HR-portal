import { USER_ADMIN_ROLES } from "@/lib/accounts";
import type { Role } from "@/lib/types";

/**
 * Navigation, grouped by the department responsible for the work.
 *
 * Two rules govern what goes where, and they are what keep the sidebar from
 * growing into a list of everything twice:
 *
 *  1. A function appears under the department that OWNS it, once. Officers are
 *     under Control Room because the pool is an operational view; the person
 *     record behind them is under HR, because HR owns the person. Same people,
 *     two questions, two places — not two records.
 *
 *  2. Where the business names several things that are one screen, the
 *     navigation links to the view, not to a copy. Departmental task lists are
 *     the one queue, filtered. A second page would only be the same data with
 *     a second chance to disagree with itself. (Chase-ups, book-ons and check
 *     calls were views of the live board once; they are pages of their own
 *     now, because each is a different job.)
 *
 * Groups collapse, and which are open is remembered per person in the browser.
 */
export type NavGroup =
  | "Dashboard"
  | "Sales"
  | "Client"
  | "My duties"
  | "Control Room"
  | "HR"
  | "Admin"
  | "Management"
  | "System"
  | "Settings";

export interface NavGroupSpec {
  id: NavGroup;
  /** Whether the group starts open before anyone has collapsed anything. */
  defaultOpen: boolean;
  /** One line, shown as the heading's title attribute. */
  purpose: string;
}

/**
 * The order is the approved order: Dashboard, Control Room, HR, Admin, then
 * Management and the rest. Management is deliberately no longer at the top —
 * the day's work comes first and oversight follows it.
 */
export const NAV_GROUP_SPECS: NavGroupSpec[] = [
  {
    id: "Dashboard",
    defaultOpen: true,
    purpose: "Where everyone lands: what is mine, what is late, what is at risk.",
  },
  {
    id: "Sales",
    defaultOpen: true,
    purpose: "Clients, their sites and what they have asked us to cover.",
  },
  {
    id: "Client",
    defaultOpen: true,
    purpose: "Your account with us.",
  },
  {
    id: "My duties",
    defaultOpen: true,
    purpose: "Your own shifts, and nothing else.",
  },
  {
    id: "Control Room",
    defaultOpen: true,
    purpose: "Everything operational: the live picture, the rota, the pool and the client's requirements.",
  },
  {
    id: "HR",
    defaultOpen: true,
    purpose: "Recruitment through screening to confirmed employment, and the records that prove it.",
  },
  {
    id: "Admin",
    defaultOpen: true,
    purpose: "Payments, premises, people admin, penalties, uniform stock and accreditations.",
  },
  {
    id: "Management",
    defaultOpen: false,
    purpose: "Oversight across every department, and the client relationship.",
  },
  {
    id: "System",
    defaultOpen: false,
    purpose: "Who holds which role, our own service levels, and the audit trail.",
  },
  {
    id: "Settings",
    defaultOpen: true,
    purpose: "Your own theme, notifications and password.",
  },
];

export const NAV_GROUPS: NavGroup[] = NAV_GROUP_SPECS.map((g) => g.id);

export function navGroupSpec(group: NavGroup): NavGroupSpec {
  const found = NAV_GROUP_SPECS.find((g) => g.id === group);
  if (!found) throw new Error(`Unknown nav group: ${group}`);
  return found;
}

export interface NavItem {
  /** May carry a query string, where the item is a view of another screen. */
  href: string;
  label: string;
  /** One-line purpose, shown on the module's own page and in the nav tooltip. */
  purpose: string;
  group: NavGroup;
  /**
   * Roles that see this item. Items a role cannot access are not rendered at
   * all, rather than shown disabled — see docs/proposal/06. Note this is who
   * may SEE the screen; who may press the buttons on it is
   * lib/auth/permissions.ts, checked again on the server.
   */
  roles: Role[];
  /** False where the screens are an honest placeholder rather than built. */
  built: boolean;
}

const ALL: Role[] = [
  "control",
  "shift_supervisor",
  "operations_manager",
  "recruitment",
  "recruitment_manager",
  "admin_officer",
  "admin_manager",
  "finance_officer",
  "vetting_admin",
  "vetting_controller",
  "top_management",
  "auditor",
];

/** Anyone whose job is the operational picture. */
const CONTROL_ROOM: Role[] = [
  "control",
  "shift_supervisor",
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

/** The Admin department, plus the two roles that approve its decisions. */
const ADMIN: Role[] = [
  "admin_officer",
  "admin_manager",
  "finance_officer",
  "top_management",
  "auditor",
];

/**
 * People admin — holidays, suspensions, external authority matters — is HR
 * territory that Admin keeps the records for. The Finance Officer is
 * deliberately absent: approving spend does not come with access to someone's
 * leave or their suspension file.
 */
const PEOPLE_ADMIN: Role[] = [
  "admin_officer",
  "admin_manager",
  "recruitment_manager",
  "top_management",
  "auditor",
];

/** Anything to do with money. */
const MONEY: Role[] = [
  "admin_officer",
  "admin_manager",
  "finance_officer",
  "top_management",
  "auditor",
];

const MANAGEMENT: Role[] = [
  "operations_manager",
  "recruitment_manager",
  "admin_manager",
  "vetting_controller",
  "finance_officer",
  "top_management",
  "auditor",
];

const SYSTEM: Role[] = [
  "operations_manager",
  "recruitment_manager",
  "admin_manager",
  "vetting_controller",
  "top_management",
  "auditor",
];

export const NAV: NavItem[] = [
  // --- Dashboard -----------------------------------------------------------
  {
    href: "/",
    label: "Dashboard",
    purpose: "Role-aware landing page: live cover, breach risk, delays and workload.",
    group: "Dashboard",
    roles: ALL,
    built: true,
  },
  {
    href: "/tasks",
    label: "My tasks",
    purpose: "Everything assigned to me, most overdue first, with the action one click away.",
    group: "Dashboard",
    roles: ALL,
    built: true,
  },

  // --- Control Room --------------------------------------------------------
  // Operations no longer exists as a section. Everything it held is here.
  {
    href: "/live",
    label: "Live board",
    purpose: "Every post on now: attendance, contact, welfare and what needs a phone call.",
    group: "Control Room",
    roles: CONTROL_ROOM,
    built: true,
  },
  {
    href: "/duty/chase-ups",
    label: "Chase-ups",
    purpose: "Two hours before each shift: does the officer know, and will they be on site.",
    group: "Control Room",
    roles: CONTROL_ROOM,
    built: true,
  },
  {
    href: "/duty/book-ons",
    label: "Book-ons",
    purpose: "The officer at site and on duty: who should be there and is not, who is due, who is on.",
    group: "Control Room",
    roles: CONTROL_ROOM,
    built: true,
  },
  {
    href: "/duty/check-calls",
    label: "Check calls",
    purpose: "Hourly calls through the duty: made, missed and due, and the escalation when one is missed.",
    group: "Control Room",
    roles: CONTROL_ROOM,
    built: true,
  },
  {
    href: "/scheduling",
    label: "Scheduling & shift changes",
    purpose: "Build the week post by post: ask officers, record what they said, and publish through the compliance block.",
    group: "Control Room",
    roles: CONTROL_ROOM,
    built: true,
  },
  {
    href: "/clients",
    label: "Clients, sites & posts",
    purpose: "Every client, their sites and posts: check-call rules, signal, phones, instructions, and where each site is.",
    group: "Control Room",
    roles: [...CONTROL_ROOM, ...MANAGEMENT, "sales"],
    built: true,
  },
  {
    href: "/requirements",
    label: "Client requirements",
    purpose: "Client staffing requirements, the officer pool check, and the timestamped handover to HR.",
    group: "Control Room",
    roles: [...ALL, "sales"],
    built: true,
  },
  {
    href: "/officers",
    label: "Officers",
    purpose: "The deployable pool: availability, deployability and licence expiry. The person behind the officer is under HR.",
    group: "Control Room",
    roles: ALL,
    built: true,
  },
  {
    href: "/hub/templates",
    label: "Reply templates",
    purpose: "The agreed wording for replies, by category — written by each department's manager.",
    group: "Control Room",
    roles: ["operations_manager", "recruitment_manager", "admin_manager", "top_management"],
    built: true,
  },
  {
    href: "/hub",
    label: "Performance hub",
    purpose: "Every email to the shared mailboxes, and every call logged, as a task with one owner and a clock: accepted in minutes, acted on, kept up to date.",
    group: "Control Room",
    roles: ["control", "shift_supervisor", "operations_manager", "top_management", "auditor"],
    built: true,
  },

  // --- HR ------------------------------------------------------------------
  {
    href: "/candidates",
    label: "Candidates",
    purpose: "Every candidate from first contact to onboarding: application by email link, interviews, offers. Interviews are a filter here, not a screen of their own.",
    group: "HR",
    roles: HR,
    built: true,
  },
  {
    href: "/hub",
    label: "Performance hub",
    purpose: "The HR mailbox as tasks: each email owned, timed and followed through.",
    group: "HR",
    roles: ["recruitment", "recruitment_manager", "vetting_admin", "vetting_controller"],
    built: true,
  },
  {
    href: "/vetting",
    label: "Vetting (BS 7858)",
    purpose: "Screening files, checks, evidence, the clock and the controller review queue. One entry, not two.",
    group: "HR",
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
    group: "HR",
    roles: ["recruitment", "recruitment_manager", "top_management", "auditor", "control", "shift_supervisor"],
    built: true,
  },
  {
    href: "/people",
    label: "Employees",
    purpose: "Everyone employed: contact details, next of kin, contract, payroll, training, leave, documents — and the leaver process.",
    group: "HR",
    roles: ["recruitment", "recruitment_manager", "admin_officer", "admin_manager", "operations_manager", "top_management", "auditor"],
    built: true,
  },  {
    href: "/compliance",
    label: "Right to work & SIA",
    purpose: "Every licence, right to work and document with an expiry date, and who it blocks.",
    group: "HR",
    roles: [...MANAGEMENT, "control", "shift_supervisor", "vetting_admin", "recruitment"],
    built: true,
  },


  // --- Sales ---------------------------------------------------------------
  {
    href: "/sales",
    label: "Sales overview",
    purpose: "Every client, their sites, and the requirements still open against them.",
    group: "Sales",
    roles: ["sales", "top_management", "auditor"],
    built: true,
  },

  // --- Officer -------------------------------------------------------------
  // Everything an officer can reach. Nothing else in NAV lists the role, and a
  // path NAV does not list is closed to it (canAccessPath), so this is the fence.
  {
    href: "/me",
    label: "My duties",
    purpose: "Your shifts: where and when, confirm, book on and make your check calls.",
    group: "My duties",
    roles: ["officer"],
    built: true,
  },

  // --- Client --------------------------------------------------------------
  {
    href: "/client-portal",
    label: "Client portal",
    purpose: "Your account, and what the client portal will show you as it is built.",
    group: "Client",
    roles: ["client"],
    built: true,
  },

  // --- Admin ---------------------------------------------------------------
  {
    href: "/admin/users",
    label: "Users & registrations",
    purpose: "Every registered account, by department, with pending registrations to approve.",
    group: "Admin",
    roles: [...USER_ADMIN_ROLES, "auditor"],
    built: true,
  },
  {
    href: "/admin",
    label: "Admin overview",
    purpose: "Urgent, upcoming and overdue Admin work, with costs, stock and departmental performance.",
    group: "Admin",
    roles: ADMIN,
    built: true,
  },
  {
    href: "/hub",
    label: "Performance hub",
    purpose: "The Accounts mailbox as tasks: each email owned, timed and followed through.",
    group: "Admin",
    roles: ["admin_officer", "admin_manager", "finance_officer"],
    built: true,
  },
  {
    href: "/admin/requests",
    label: "Requests & approvals",
    purpose: "Everything awaiting a decision, and who it is waiting for. The requester is never the approver.",
    group: "Admin",
    roles: [...ADMIN, "recruitment_manager"],
    built: true,
  },
  {
    href: "/admin/payments",
    label: "Payments & contracts",
    purpose: "Office rent, recurring payments, suppliers and the contracts behind them.",
    group: "Admin",
    roles: MONEY,
    built: true,
  },
  {
    href: "/admin/premises",
    label: "Premises & equipment",
    purpose: "Office appliances and equipment, their service schedule, faults and repairs.",
    group: "Admin",
    roles: ADMIN,
    built: true,
  },
  {
    href: "/admin/people",
    label: "People admin",
    purpose: "Holiday entitlement and requests, external authority matters, suspensions and employee forms.",
    group: "Admin",
    roles: PEOPLE_ADMIN,
    built: true,
  },
  {
    href: "/admin/decisions",
    label: "Penalties & decisions",
    purpose: "Fines and penalties, decision forms, and vouchers issued or redeemed.",
    group: "Admin",
    roles: [...MONEY, "recruitment_manager"],
    built: true,
  },
  {
    href: "/admin/uniform",
    label: "Uniform & stock",
    purpose: "Stock on hand, allocation to officers, and returns from leavers.",
    group: "Admin",
    roles: [...ADMIN, "recruitment", "control", "shift_supervisor"],
    built: true,
  },
  {
    href: "/admin/accreditations",
    label: "Accreditations",
    purpose: "Accreditations held, when each is next due, and the evidence behind it.",
    group: "Admin",
    roles: [...ADMIN, "vetting_controller"],
    built: true,
  },
  {
    href: "/tasks?department=administration",
    label: "Admin tasks",
    purpose: "The one work queue, filtered to Admin.",
    group: "Admin",
    roles: ADMIN,
    built: true,
  },

  // --- Management ----------------------------------------------------------
  {
    href: "/reports",
    label: "Department board",
    purpose: "Every department's KPIs in one place, each a query over the event log. The management portal.",
    group: "Management",
    roles: MANAGEMENT,
    built: true,
  },
  {
    href: "/performance",
    label: "Performance",
    purpose: "Every person, every department and the whole company: how fast work is taken on and finished, within SLA, and why not when it is not. The Managing Director's.",
    group: "Management",
    roles: ["top_management"],
    built: true,
  },
  {
    href: "/quality",
    label: "Quality & inspections",
    purpose: "Site inspections, operational reports and the corrective actions they raise.",
    group: "Management",
    roles: MANAGEMENT,
    built: false,
  },

  // --- System --------------------------------------------------------------
  {
    href: "/system",
    label: "Users, roles & rules",
    purpose: "Who holds which role, our own service levels, retention, and the audit log.",
    group: "System",
    roles: SYSTEM,
    built: true,
  },
  {
    href: "/system/go-live",
    label: "Go-live checklist",
    purpose: "Everything that must be true before real people and real data go in — each checked by the portal where it can be, ticked by you where it cannot.",
    group: "System",
    roles: ["top_management"],
    built: true,
  },
  {
    href: "/system/audit",
    label: "Audit log",
    purpose: "Everything done in the portal — who, what, when — searchable, and downloadable. For the Managing Director and the auditor.",
    group: "System",
    roles: ["top_management", "auditor"],
    built: true,
  },
  {
    href: "/system/permissions",
    label: "Permissions",
    purpose: "Every action in the platform and which roles may take it. The same table the server enforces.",
    group: "System",
    roles: [...ALL, "sales"],
    built: true,
  },
  {
    href: "/platform",
    label: "Platform map",
    purpose: "The domains, the shared engines and the single-source-of-truth register.",
    group: "System",
    roles: SYSTEM,
    built: true,
  },

  // --- Settings: everyone's own ------------------------------------------------
  {
    href: "/settings",
    label: "My settings",
    purpose: "Your theme, your notifications and your password — yours only.",
    group: "Settings",
    roles: [...ALL, "sales", "client", "officer"],
    built: true,
  },
];

export function navForRole(role: Role): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}

/** Grouped, in the fixed group order, skipping groups this role cannot see. */
export function navGroupsForRole(
  role: Role,
): { group: NavGroup; spec: NavGroupSpec; items: NavItem[] }[] {
  const items = navForRole(role);
  return NAV_GROUPS.map((group) => ({
    group,
    spec: navGroupSpec(group),
    items: items.filter((i) => i.group === group),
  })).filter((g) => g.items.length > 0);
}

export function navItemByHref(href: string): NavItem | undefined {
  return NAV.find((item) => item.href === href);
}

/**
 * The nav item a page sits under: an exact match, or else the most specific
 * item whose path contains it, so /candidates/123 reads as Recruitment.
 */
export function navItemForPath(pathname: string): NavItem | undefined {
  const exact = navItemByHref(pathname);
  if (exact) return exact;
  return NAV.filter((item) => {
    const path = item.href.split("?")[0]!;
    return !item.href.includes("?") && path !== "/" && pathname.startsWith(`${path}/`);
  }).sort((a, b) => b.href.length - a.href.length)[0];
}

/**
 * Whether an item is the one currently being looked at.
 *
 * Items that are views of another screen carry a query string, so a path-only
 * comparison would light up three Control Room entries at once. The rule:
 * an item with a query matches only when every one of its parameters matches;
 * an item without one matches on path, and loses to any sibling view that is
 * an exact match.
 */
export function isActive(item: NavItem, pathname: string, search: string): boolean {
  const [itemPath, itemQuery] = item.href.split("?");

  const matchesPath = (path: string) =>
    path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);

  if (!matchesPath(itemPath)) return false;

  // The most specific path wins. Without this, "Admin overview" at /admin is
  // also highlighted while you are looking at /admin/payments, and two entries
  // claim to be the page you are on.
  const somethingDeeperMatches = NAV.some((other) => {
    const otherPath = other.href.split("?")[0];
    return otherPath.length > itemPath.length && matchesPath(otherPath);
  });
  if (somethingDeeperMatches) return false;

  const current = new URLSearchParams(search);

  if (itemQuery) {
    const wanted = new URLSearchParams(itemQuery);
    for (const [key, value] of wanted) {
      if (current.get(key) !== value) return false;
    }
    return true;
  }

  // A plain item yields to a sibling view when the URL carries the parameter
  // that view is keyed on, so "Live board" is not also highlighted while you
  // are looking at "Book-ons".
  const siblingKeys = NAV.filter((i) => i !== item && i.href.startsWith(`${itemPath}?`))
    .flatMap((i) => [...new URLSearchParams(i.href.split("?")[1] ?? "").keys()]);
  return !siblingKeys.some((key) => current.has(key));
}

/**
 * Whether a role may open a path at all.
 *
 * The navigation was only ever who may SEE a link; this makes it who may open
 * the page, so typing a URL is no way round it. The rule is the nav itself:
 * the most specific nav path that covers the URL decides, so /officers/123 is
 * governed by /officers. Paths no nav item covers are staff-only, which keeps
 * the Sales and Client roles inside the screens listed for them.
 *
 * Checked in proxy.ts. Actions are still checked again by requirePermission.
 */
export function canAccessPath(role: Role, pathname: string): boolean {
  const covers = (path: string) =>
    path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);

  let best = -1;
  let allowed = false;
  for (const item of NAV) {
    const path = item.href.split("?")[0];
    if (!covers(path)) continue;
    if (path.length > best) {
      best = path.length;
      allowed = item.roles.includes(role);
    } else if (path.length === best && item.roles.includes(role)) {
      allowed = true;
    }
  }
  return best >= 0 ? allowed : ALL.includes(role);
}
