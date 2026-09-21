/**
 * Live operations rules — book-on windows, check calls, welfare escalation.
 *
 * These are OUR operational numbers, not a standard's. They are proposed
 * defaults pending decision E4 (docs/platform/04), and belong in Admin as
 * configuration once agreed. Kept out of lib/bs7858.ts for the same reason
 * lib/policy.ts is: a local preference must never be mistaken for a regulatory
 * requirement.
 *
 * A duty of care runs through all of it. A missed check call on a lone-working
 * post is a welfare question before it is an administrative one, which is why
 * the escalation ladder ends with a person and not with a red row on a screen.
 */

import type { Severity } from "../types";
import type { Assignment, BookOn, CheckCall, Post } from "./types";

/** Proposed defaults. Minutes throughout. */
export const OPS_RULES = {
  /** Late, but not yet a problem. */
  bookOnGraceMinutes: 15,
  /** Treated as a no-show, and escalated. */
  bookOnNoShowMinutes: 30,
  /** Client instruction on most sites is hourly. */
  checkCallIntervalMinutes: 60,
  /** Overdue but unremarkable. */
  checkCallGraceMinutes: 10,
  /** Missed. Someone rings the officer. */
  checkCallMissedMinutes: 20,
  /** Lone working shortens the tolerance: welfare, not admin. */
  loneWorkingMissedMinutes: 10,
} as const;

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export type AttendanceState =
  | "not_due"
  | "awaiting_book_on"
  | "late"
  | "no_show"
  | "on_post"
  | "booked_off";

export interface AttendanceStatus {
  state: AttendanceState;
  label: string;
  severity: Severity;
  /** Positive where the officer is late, negative where the shift is not due. */
  minutesLate: number;
}

const MS_PER_MIN = 60_000;

export function attendance(
  assignment: Assignment,
  bookOn: BookOn | undefined,
  now: Date = new Date(),
): AttendanceStatus {
  const start = new Date(assignment.startsAt).getTime();
  const end = new Date(assignment.endsAt).getTime();
  const t = now.getTime();
  const minutesLate = Math.round((t - start) / MS_PER_MIN);

  if (bookOn) {
    if (t >= end) {
      return { state: "booked_off", label: "Shift complete", severity: "neutral", minutesLate };
    }
    const lateBy = Math.round((new Date(bookOn.at).getTime() - start) / MS_PER_MIN);
    return {
      state: "on_post",
      label: lateBy > OPS_RULES.bookOnGraceMinutes ? `On post (booked on ${lateBy} min late)` : "On post",
      severity: "good",
      minutesLate: lateBy,
    };
  }

  if (t < start) {
    // Shown from an hour out, so Control sees what is about to need watching.
    const minutesUntil = Math.abs(minutesLate);
    return minutesUntil <= 60
      ? {
          state: "awaiting_book_on",
          label: `Due in ${minutesUntil} min`,
          severity: "neutral",
          minutesLate,
        }
      : { state: "not_due", label: "Not due", severity: "neutral", minutesLate };
  }

  if (minutesLate >= OPS_RULES.bookOnNoShowMinutes) {
    return {
      state: "no_show",
      label: `No show — ${minutesLate} min`,
      severity: "critical",
      minutesLate,
    };
  }

  if (minutesLate > OPS_RULES.bookOnGraceMinutes) {
    return { state: "late", label: `Late — ${minutesLate} min`, severity: "serious", minutesLate };
  }

  return {
    state: "awaiting_book_on",
    label: `Awaiting book-on — ${minutesLate} min`,
    severity: "warning",
    minutesLate,
  };
}

// ---------------------------------------------------------------------------
// Check calls
// ---------------------------------------------------------------------------

export type CheckCallState = "not_required" | "ok" | "due" | "overdue" | "missed";

export interface CheckCallStatus {
  state: CheckCallState;
  label: string;
  severity: Severity;
  minutesSinceLast: number | null;
  /** Escalation step, per the ladder below. Zero where nothing is needed. */
  escalation: 0 | 1 | 2 | 3;
}

/**
 * The ladder. Each step names who acts, because "overdue" with no named next
 * person is how a missed call becomes nobody's job.
 */
export const ESCALATION_LADDER = [
  { step: 1, action: "Control rings the officer", owner: "Control" },
  { step: 2, action: "Control rings the site supervisor", owner: "Control" },
  {
    step: 3,
    action: "Welfare procedure: operations manager attends or client is notified",
    owner: "Operations manager",
  },
] as const;

export function checkCallStatus(
  assignment: Assignment,
  post: Post,
  calls: CheckCall[],
  bookOn: BookOn | undefined,
  now: Date = new Date(),
): CheckCallStatus {
  if (!post.checkCallsRequired) {
    return {
      state: "not_required",
      label: "Not required on this post",
      severity: "neutral",
      minutesSinceLast: null,
      escalation: 0,
    };
  }

  const t = now.getTime();
  const start = new Date(assignment.startsAt).getTime();
  const end = new Date(assignment.endsAt).getTime();

  // Calls are expected only while the officer is actually on post.
  if (!bookOn || t < start || t >= end) {
    return {
      state: "not_required",
      label: "Not on post",
      severity: "neutral",
      minutesSinceLast: null,
      escalation: 0,
    };
  }

  const mine = calls
    .filter((c) => c.assignmentId === assignment.id)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // The clock runs from the book-on until the first call.
  const lastAt = mine.length > 0 ? new Date(mine[0].at).getTime() : new Date(bookOn.at).getTime();
  const minutesSinceLast = Math.round((t - lastAt) / MS_PER_MIN);
  const overdueBy = minutesSinceLast - OPS_RULES.checkCallIntervalMinutes;

  const missedThreshold = post.loneWorking
    ? OPS_RULES.loneWorkingMissedMinutes
    : OPS_RULES.checkCallMissedMinutes;

  if (overdueBy >= missedThreshold) {
    // Two intervals missed moves it up the ladder rather than repeating step 1.
    const intervalsMissed = Math.floor(overdueBy / OPS_RULES.checkCallIntervalMinutes) + 1;
    const escalation = Math.min(intervalsMissed, 3) as 1 | 2 | 3;
    return {
      state: "missed",
      label: `Missed — ${minutesSinceLast} min since last contact`,
      severity: "critical",
      minutesSinceLast,
      escalation,
    };
  }

  if (overdueBy >= OPS_RULES.checkCallGraceMinutes) {
    return {
      state: "overdue",
      label: `Overdue by ${overdueBy} min`,
      severity: "serious",
      minutesSinceLast,
      escalation: 1,
    };
  }

  if (overdueBy >= 0) {
    return {
      state: "due",
      label: "Due now",
      severity: "warning",
      minutesSinceLast,
      escalation: 0,
    };
  }

  return {
    state: "ok",
    label: `Next in ${Math.abs(overdueBy)} min`,
    severity: "good",
    minutesSinceLast,
    escalation: 0,
  };
}

/**
 * How much a contact record is worth as evidence.
 *
 * Relevant to decision E3: an SMS proves a phone sent a message, a QR tag at
 * the post proves someone was standing at it. Shown in the UI so the strength
 * of the record is visible rather than assumed.
 */
export const CHANNEL_EVIDENCE: Record<
  string,
  { label: string; strength: "strong" | "good" | "weak" }
> = {
  qr: { label: "QR tag at post", strength: "strong" },
  app: { label: "App", strength: "good" },
  phone: { label: "Phone call", strength: "good" },
  supervisor: { label: "Confirmed by supervisor", strength: "good" },
  sms: { label: "SMS", strength: "weak" },
};
