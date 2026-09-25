/**
 * Alerts and the work queue — the rules, with no database in sight.
 *
 * An alert is a work item that cannot wait: the duty sweep's missed check
 * calls and no-shows, a shift nobody is on that starts soon, an officer who
 * cannot attend or reports a problem. They are the items with a service level
 * of zero days — due the moment they exist — and they are what sounds the
 * alarm on Control's screens and buzzes the officer's phone.
 *
 * Everything else in the queue is ordinary work: it has a due date, not a
 * siren.
 *
 * Each kind is recognised by the start of its title, because the sweep finds
 * an open alert again the same way (lib/db/duty-sweep.ts): one open alert per
 * subject, per kind, per end.
 */

import type { Severity } from "@/lib/types";

export type AlertKind =
  | "missed"
  | "no_book_on"
  | "chase"
  | "cannot_attend"
  | "problem"
  | "uncovered"
  | "incident"
  | "running_late"
  | "away_from_site"
  | "welfare_overdue"
  | "no_photo"
  | "volunteer"
  | "licence"
  | "officer_missed"
  | "officer_book_on"
  | "officer_confirm"
  | "officer_licence"
  | "officer_decision"
  | "officer_leave"
  | "hub_critical"
  | "other";

interface KindSpec {
  /** Titles of this kind start with this. */
  prefix: string;
  /** Where the work is done. Filled in from the subject by openHref. */
  page: "check-calls" | "book-ons" | "chase-ups" | "rota" | "live" | "officer" | "me" | "hub";
  severity: Severity;
  /** Sounds the alarm and pushes to phones. */
  alarm: boolean;
  /** Closes itself when the thing is put right — nobody ticks it off by hand. */
  selfClosing: boolean;
}

/**
 * The kinds, most urgent first within each end. Prefixes are matched in this
 * order, so a longer prefix must come before a shorter one it starts with.
 */
export const ALERT_KIND_SPECS: Record<AlertKind, KindSpec> = {
  // Control's end.
  missed: { prefix: "Check call missed", page: "check-calls", severity: "critical", alarm: true, selfClosing: true },
  welfare_overdue: { prefix: "Welfare visit overdue", page: "check-calls", severity: "critical", alarm: true, selfClosing: true },
  no_book_on: { prefix: "Not booked on", page: "book-ons", severity: "critical", alarm: true, selfClosing: true },
  uncovered: { prefix: "Uncovered shift", page: "rota", severity: "critical", alarm: true, selfClosing: true },
  cannot_attend: { prefix: "Officer cannot attend", page: "chase-ups", severity: "critical", alarm: true, selfClosing: false },
  problem: { prefix: "Officer reports a problem", page: "check-calls", severity: "critical", alarm: true, selfClosing: false },
  incident: { prefix: "Incident reported", page: "live", severity: "serious", alarm: true, selfClosing: false },
  // A critical email on the Performance hub: closes itself when someone accepts it.
  hub_critical: { prefix: "Critical email", page: "hub", severity: "critical", alarm: true, selfClosing: true },
  away_from_site: { prefix: "Selfie away from the site", page: "book-ons", severity: "serious", alarm: true, selfClosing: false },
  no_photo: { prefix: "No selfie", page: "book-ons", severity: "warning", alarm: true, selfClosing: false },
  chase: { prefix: "Chase-up not confirmed", page: "chase-ups", severity: "serious", alarm: true, selfClosing: true },
  running_late: { prefix: "Running late", page: "book-ons", severity: "warning", alarm: true, selfClosing: true },
  volunteer: { prefix: "Offered to work", page: "rota", severity: "neutral", alarm: false, selfClosing: true },
  licence: { prefix: "SIA licence expir", page: "officer", severity: "warning", alarm: false, selfClosing: true },
  // The officer's end: addressed to their account, shown in their portal.
  officer_missed: { prefix: "Check call overdue", page: "me", severity: "critical", alarm: true, selfClosing: true },
  officer_book_on: { prefix: "You have not booked on", page: "me", severity: "critical", alarm: true, selfClosing: true },
  officer_confirm: { prefix: "Please confirm your shift", page: "me", severity: "serious", alarm: true, selfClosing: true },
  officer_licence: { prefix: "Your SIA licence expir", page: "me", severity: "warning", alarm: true, selfClosing: true },
  officer_decision: { prefix: "Control has", page: "me", severity: "neutral", alarm: true, selfClosing: false },
  officer_leave: { prefix: "Your leave", page: "me", severity: "neutral", alarm: true, selfClosing: false },
  other: { prefix: "", page: "live", severity: "neutral", alarm: false, selfClosing: false },
};

const ORDERED = (Object.keys(ALERT_KIND_SPECS) as AlertKind[])
  .filter((k) => k !== "other")
  .sort((a, b) => ALERT_KIND_SPECS[b].prefix.length - ALERT_KIND_SPECS[a].prefix.length);

export function alertKind(title: string): AlertKind {
  return ORDERED.find((k) => title.startsWith(ALERT_KIND_SPECS[k].prefix)) ?? "other";
}

export interface QueueItem {
  title: string;
  slaDays: number;
  personId?: string | null;
  screeningFileId?: string | null;
  requirementId?: string | null;
  assignmentId?: string | null;
  documentId?: string | null;
  adminItemId?: string | null;
  coverNeedId?: string | null;
  openShiftId?: string | null;
  incidentId?: string | null;
  hubTaskId?: string | null;
  ownerRole?: string | null;
}

/**
 * An alert: due the moment it exists. Ordinary work carries a service level
 * of a day or more and never sounds.
 */
export function isAlarm(w: QueueItem): boolean {
  return w.slaDays === 0 && ALERT_KIND_SPECS[alertKind(w.title)].alarm;
}

export function alertSeverity(w: QueueItem): Severity {
  return ALERT_KIND_SPECS[alertKind(w.title)].severity;
}

/** Whether a person may close it by hand, or it closes itself when put right. */
export function closesItself(w: QueueItem): boolean {
  return ALERT_KIND_SPECS[alertKind(w.title)].selfClosing;
}

/**
 * Where the work behind a task is done — the "Open" on the queue. Context the
 * item cannot carry itself (the rota week of a cover need, the post of an
 * open shift) is handed in by the caller.
 */
export function openHref(
  w: QueueItem,
  ctx: { rotaHref?: string | null; personHref?: string | null } = {},
): string {
  const spec = ALERT_KIND_SPECS[alertKind(w.title)];
  if (w.hubTaskId) return `/hub/${w.hubTaskId}`;
  if (w.coverNeedId || w.openShiftId) return ctx.rotaHref ?? "/scheduling";
  if (w.incidentId) return "/live#incidents";
  if (w.assignmentId) {
    if (spec.page === "check-calls" || spec.page === "book-ons" || spec.page === "chase-ups") return `/duty/${spec.page}`;
    return "/live";
  }
  if (w.requirementId) return `/requirements/${w.requirementId}`;
  if (w.screeningFileId) return `/vetting/${w.screeningFileId}`;
  if (w.adminItemId) return "/admin/requests";
  if (w.documentId) return "/compliance";
  if (w.personId) return ctx.personHref ?? (w.ownerRole === "control" || w.ownerRole === "operations_manager" ? `/officers/${w.personId}` : "/candidates");
  return "/tasks";
}

/** "starts in 1h 27m", "started 12 min ago" — for a shift nobody is on. */
export function startsIn(startsAt: Date, now: Date): string {
  const mins = Math.round((startsAt.getTime() - now.getTime()) / 60_000);
  const abs = Math.abs(mins);
  const text = abs < 60 ? `${abs} min` : `${Math.floor(abs / 60)}h${abs % 60 ? ` ${abs % 60}m` : ""}`;
  return mins >= 0 ? `starts in ${text}` : `started ${text} ago`;
}

/**
 * How urgent a shift with nobody on it is. Started, or within two hours, is
 * critical; today is serious; tomorrow is a warning. Further out it is
 * planning, not an alert.
 */
export const UNCOVERED_ALERT_HOURS = 24;

export function uncoveredSeverity(startsAt: Date, now: Date): Severity {
  const mins = (startsAt.getTime() - now.getTime()) / 60_000;
  if (mins <= 120) return "critical";
  if (mins <= 12 * 60) return "serious";
  return "warning";
}

/**
 * When an alert is pushed again to someone who has not acted on it. An
 * officer's phone is reminded every five minutes, three times at most; a
 * Control desk once — its screen keeps sounding until somebody acknowledges.
 */
export const PUSH_REPEAT = { officerEveryMinutes: 5, officerMaxTimes: 3, controlMaxTimes: 1 } as const;

export function pushDue(args: { sent: Date[]; now: Date; officer: boolean }): boolean {
  const max = args.officer ? PUSH_REPEAT.officerMaxTimes : PUSH_REPEAT.controlMaxTimes;
  if (args.sent.length >= max) return false;
  if (args.sent.length === 0) return true;
  const last = Math.max(...args.sent.map((d) => d.getTime()));
  return args.now.getTime() - last >= PUSH_REPEAT.officerEveryMinutes * 60_000;
}
