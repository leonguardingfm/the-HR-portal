/**
 * Duty checks — the three things Control does to know an officer is where
 * the rota says, and safe (Control, 24 September 2026):
 *
 *   Duty confirmed → Chase-up (2 hours before) → Officer confirms
 *     → Book-on at site → Hourly check calls → Alert if one is missed
 *
 * The book-on and check-call rules are the confirmed process in ./ops (E4,
 * E10); this module adds the chase-up in front of them and reads the three
 * together, per shift, so every screen — the chase-up list, the book-on list,
 * the check-call list and the dashboard — tells the same story from the same
 * rules. Pure: the rows come in, the states go out.
 */

import type { Severity } from "../types";
import { OPS_RULES, attendance, checkCallStatus, type AttendanceStatus, type CheckCallStatus, type NoSignalHandover } from "./ops";
import { addDays, ukDate, ukInstant, weekday } from "./rota";
import type { Assignment, BookOn, CheckCall, ContactAttempt, Post } from "./types";

/** Minutes throughout. Ours, not a standard's: they belong in Admin as configuration. */
export const DUTY_RULES = {
  /** The chase-up opens two hours before the shift starts. */
  chaseUpLeadMinutes: 120,
  /** Under an hour to go and still not confirmed: the chase is urgent. */
  chaseUpUrgentMinutes: 60,
  /** A book-on this much before the start is too early to be a book-on. */
  bookOnEarliestMinutes: 60,
} as const;

const MIN = 60_000;

// ---------------------------------------------------------------------------
// 1. Chase-up
// ---------------------------------------------------------------------------

export type ChaseUpOutcome = "confirmed" | "no_answer" | "cannot_attend";

export type ChaseUpState =
  /** More than two hours to go. */
  | "not_due"
  /** Inside the two hours, nobody has tried yet. */
  | "due"
  /** Tried, no answer yet. */
  | "no_answer"
  /** Under an hour to go and not confirmed. */
  | "urgent"
  /** The officer knows and will be there. */
  | "confirmed"
  /** Started without a confirmation: the book-on is now the question. */
  | "missed"
  /** The officer has said, in their portal, that they cannot make it: Control takes them off and finds cover. */
  | "cannot_attend";

export interface ChaseUpStatus {
  state: ChaseUpState;
  label: string;
  severity: Severity;
  /** When the chase-up opens: two hours before the start. */
  dueAt: Date;
  minutesToStart: number;
  noAnswers: number;
  confirmedAt: Date | null;
}

export function chaseUpStatus(
  startsAt: Date,
  attempts: { at: Date; outcome: ChaseUpOutcome }[],
  now: Date = new Date(),
): ChaseUpStatus {
  const dueAt = new Date(startsAt.getTime() - DUTY_RULES.chaseUpLeadMinutes * MIN);
  const minutesToStart = Math.round((startsAt.getTime() - now.getTime()) / MIN);
  const sorted = [...attempts].sort((a, b) => a.at.getTime() - b.at.getTime());
  const confirmed = sorted.find((a) => a.outcome === "confirmed");
  const noAnswers = sorted.filter((a) => a.outcome === "no_answer" && (!confirmed || a.at < confirmed.at)).length;
  const base = { dueAt, minutesToStart, noAnswers, confirmedAt: confirmed?.at ?? null };

  const latest = sorted.at(-1);
  if (latest?.outcome === "cannot_attend") {
    return { ...base, state: "cannot_attend", label: "Says they cannot attend — take them off and find cover", severity: "critical" };
  }
  if (confirmed) return { ...base, state: "confirmed", label: "Confirmed", severity: "good" };
  if (minutesToStart <= 0) {
    return { ...base, state: "missed", label: "Started without a confirmation", severity: "serious" };
  }
  if (minutesToStart > DUTY_RULES.chaseUpLeadMinutes) {
    return { ...base, state: "not_due", label: "Not due yet", severity: "neutral" };
  }
  if (minutesToStart <= DUTY_RULES.chaseUpUrgentMinutes) {
    return {
      ...base,
      state: "urgent",
      label: noAnswers ? `Not confirmed — ${noAnswers} tr${noAnswers === 1 ? "y" : "ies"}, starts in ${minutesToStart} min` : `Not confirmed — starts in ${minutesToStart} min`,
      severity: "critical",
    };
  }
  if (noAnswers > 0) {
    return { ...base, state: "no_answer", label: `No answer ×${noAnswers} — try again`, severity: "serious" };
  }
  return { ...base, state: "due", label: "Chase up now", severity: "warning" };
}

// ---------------------------------------------------------------------------
// 3. Check calls: whether this shift makes them
// ---------------------------------------------------------------------------

export type CheckCallRule = "always" | "nights_and_weekends" | "never";

export const CHECK_CALL_RULE_LABELS: Record<CheckCallRule, string> = {
  always: "Every shift",
  nights_and_weekends: "Night duty and weekends",
  never: "Not required",
};

/** Night duty: any hours in this window, UK time. Ours: it belongs in Admin as configuration. */
export const NIGHT_HOURS = { from: "22:00", to: "06:00" } as const;

/**
 * Whether one shift on a post makes check calls. On a nights-and-weekends
 * post (Control, 24 September 2026) that is a shift with any hours between
 * 22:00 and 06:00, or any hours on a Saturday or Sunday — so 07:00–19:00 on a
 * Tuesday makes none, and the same hours on a Saturday make them all day.
 */
export function callsRequiredFor(rule: CheckCallRule, startsAt: Date, endsAt: Date): { required: boolean; why: string } {
  if (rule === "always") return { required: true, why: "Every shift on this post" };
  if (rule === "never") return { required: false, why: "Not required on this post" };
  const overlaps = (a: Date, b: Date) => startsAt < b && a < endsAt;
  const first = addDays(ukDate(startsAt), -1);
  const last = ukDate(new Date(endsAt.getTime() - 1));
  let night = false;
  let weekend = false;
  for (let d = first; d <= last; d = addDays(d, 1)) {
    if (overlaps(ukInstant(d, NIGHT_HOURS.from), ukInstant(addDays(d, 1), NIGHT_HOURS.to))) night = true;
    if (weekday(d) >= 5 && overlaps(ukInstant(d, "00:00"), ukInstant(addDays(d, 1), "00:00"))) weekend = true;
  }
  if (night) return { required: true, why: "Night duty" };
  if (weekend) return { required: true, why: "Weekend" };
  return { required: false, why: "Weekday day shift — none needed" };
}

// ---------------------------------------------------------------------------
// 3b. Check calls, as a timeline
// ---------------------------------------------------------------------------

export type CallSlotKind =
  /** Made inside the hour. */
  | "done"
  /** The hour passed first; the call came in late. */
  | "late"
  /** The hour has passed and nothing has come in: the alert. */
  | "missed"
  /** Still to come, projected hourly from the last contact to the end of the shift. */
  | "upcoming";

export interface CallSlot {
  /** When it was, or is, due. */
  dueAt: Date;
  kind: CallSlotKind;
  /** When the call actually came, for done and late. */
  callAt?: Date;
  /** How late, for late and missed. */
  minutesLate?: number;
}

/**
 * The hourly check calls of one shift, from the book-on to the end. The
 * clock runs from the last contact (E4): a call made early resets it, and a
 * missed call is missed from the moment the hour passes — no grace — until
 * the officer is reached. Upcoming calls are projected from the last contact,
 * hourly, to the end of the shift, so the schedule follows the duty's length.
 */
export function checkCallSchedule(bookOnAt: Date, endsAt: Date, callTimes: Date[], now: Date = new Date()) {
  const hour = OPS_RULES.checkCallIntervalMinutes * MIN;
  const calls = callTimes.filter((c) => c >= bookOnAt && c <= endsAt).sort((a, b) => a.getTime() - b.getTime());
  const slots: CallSlot[] = [];
  let anchor = bookOnAt;
  for (const c of calls) {
    const due = new Date(anchor.getTime() + hour);
    slots.push(
      c <= due
        ? { dueAt: due, kind: "done", callAt: c }
        : { dueAt: due, kind: "late", callAt: c, minutesLate: Math.round((c.getTime() - due.getTime()) / MIN) },
    );
    anchor = c;
  }
  let due = new Date(anchor.getTime() + hour);
  const end = endsAt.getTime();
  if (due.getTime() < end && due <= now) {
    slots.push({ dueAt: due, kind: "missed", minutesLate: Math.round((now.getTime() - due.getTime()) / MIN) });
  } else {
    while (due.getTime() < end) {
      slots.push({ dueAt: due, kind: "upcoming" });
      due = new Date(due.getTime() + hour);
    }
  }
  const nextDue = slots.find((s) => s.kind === "missed" || s.kind === "upcoming")?.dueAt ?? null;
  return {
    slots,
    nextDue,
    done: slots.filter((s) => s.kind === "done").length,
    late: slots.filter((s) => s.kind === "late").length,
    missed: slots.filter((s) => s.kind === "missed").length,
    upcoming: slots.filter((s) => s.kind === "upcoming").length,
  };
}

// ---------------------------------------------------------------------------
// The whole duty, read together
// ---------------------------------------------------------------------------

/** Where a shift is in the flow — one place, so every screen counts it the same. */
export type DutyStage =
  | "scheduled"
  | "chase_up"
  | "awaiting_book_on"
  | "late"
  | "no_show"
  | "on_duty"
  | "alert"
  | "client_held"
  | "complete";

export const DUTY_STAGE_LABELS: Record<DutyStage, string> = {
  scheduled: "Duty confirmed",
  chase_up: "Chase-up",
  awaiting_book_on: "Awaiting book-on",
  late: "Late",
  no_show: "No show",
  on_duty: "On duty",
  alert: "Check call missed",
  client_held: "Client holding contact",
  complete: "Complete",
};

export interface DutyInput {
  assignment: Assignment;
  post: Post;
  bookOn: BookOn | undefined;
  calls: CheckCall[];
  attempts: ContactAttempt[];
  noSignal?: NoSignalHandover;
  chaseUps: { at: string; outcome: ChaseUpOutcome }[];
}

export interface DutyStatus {
  stage: DutyStage;
  chase: ChaseUpStatus;
  attendance: AttendanceStatus;
  call: CheckCallStatus;
  schedule: ReturnType<typeof checkCallSchedule> | null;
  /** The worst of the three, for ordering the work. */
  severity: Severity;
  /** Whether the officer booked on themselves, and how many calls they made themselves. */
  selfBookOn: boolean;
  selfCalls: number;
}

const RANK: Record<Severity, number> = { critical: 0, serious: 1, warning: 2, good: 3, neutral: 4 };
export const worst = (...s: Severity[]) => s.reduce((a, b) => (RANK[a] <= RANK[b] ? a : b));

export function dutyStatus(r: DutyInput, now: Date = new Date()): DutyStatus {
  const start = new Date(r.assignment.startsAt);
  const end = new Date(r.assignment.endsAt);
  const chase = chaseUpStatus(start, r.chaseUps.map((c) => ({ at: new Date(c.at), outcome: c.outcome })), now);
  const att = attendance(r.assignment, r.bookOn, now);
  const call = checkCallStatus(r.assignment, r.post, r.calls, r.bookOn, r.attempts, now, r.noSignal);
  const schedule =
    r.bookOn && r.post.checkCallsRequired && r.post.mobileSignal
      ? checkCallSchedule(new Date(r.bookOn.at), end, r.calls.map((c) => new Date(c.at)), now)
      : null;

  let stage: DutyStage;
  if (now >= end) stage = "complete";
  else if (r.bookOn) stage = call.escalation > 0 ? "alert" : call.state === "client_held" ? "client_held" : "on_duty";
  else if (att.state === "no_show") stage = "no_show";
  else if (att.state === "late") stage = "late";
  else if (now >= start || att.state === "awaiting_book_on") stage = chase.state === "confirmed" || now >= start ? "awaiting_book_on" : "chase_up";
  else if (chase.state === "not_due" || chase.state === "confirmed") stage = "scheduled";
  else stage = "chase_up";

  // Before the start only the chase-up matters; after it, the book-on and the calls.
  const severity = now < start ? chase.severity : worst(att.severity, call.severity);
  return {
    stage,
    chase,
    attendance: att,
    call,
    schedule,
    severity,
    selfBookOn: !!r.bookOn?.byOfficer,
    selfCalls: r.calls.filter((c) => c.byOfficer).length,
  };
}

/** Counts for the flow strip and the dashboard, from the same statuses the pages show. */
export function dutyCounts(statuses: DutyStatus[], now: Date = new Date()) {
  const n = (f: (s: DutyStatus) => boolean) => statuses.filter(f).length;
  return {
    confirmed: statuses.length,
    chase: {
      toDo: n((s) => ["due", "no_answer", "urgent", "cannot_attend"].includes(s.chase.state)),
      urgent: n((s) => s.chase.state === "urgent" || s.chase.state === "cannot_attend"),
      confirmed: n((s) => s.chase.state === "confirmed"),
      notDue: n((s) => s.chase.state === "not_due"),
    },
    bookOn: {
      bookedOn: n((s) => ["on_duty", "alert", "client_held"].includes(s.stage)),
      awaiting: n((s) => s.stage === "awaiting_book_on"),
      late: n((s) => s.stage === "late"),
      noShow: n((s) => s.stage === "no_show"),
      byOfficer: n((s) => s.selfBookOn),
    },
    calls: {
      inContact: n((s) => s.stage === "on_duty" && s.call.state === "ok"),
      missed: n((s) => s.stage === "alert"),
      welfare: n((s) => s.call.escalation === 3),
      clientHeld: n((s) => s.stage === "client_held"),
      made: statuses.reduce((t, s) => t + (s.schedule ? s.schedule.done + s.schedule.late : 0), 0),
      byOfficer: statuses.reduce((t, s) => t + s.selfCalls, 0),
      dueNextHour: n((s) => !!s.schedule?.nextDue && s.call.state === "ok" && s.schedule.nextDue.getTime() - now.getTime() <= 60 * MIN),
    },
  };
}
