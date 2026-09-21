/**
 * Live operations rules — book-on windows, check calls, welfare escalation.
 *
 * These are OUR operational numbers, not a standard's, so they are kept out of
 * lib/bs7858.ts for the same reason lib/policy.ts is: a local preference must
 * never be mistaken for a regulatory requirement. They belong in Admin as
 * configuration.
 *
 * The check-call rule is the confirmed process (E4): check calls are hourly,
 * and at one hour without one the escalation starts. Control then tries to
 * reach the officer; if contact cannot be made, a member of the operational
 * team goes to site to check they are safe.
 *
 * That last step is why the ladder ends with a person attending rather than
 * with a red row on a screen. It is a duty of care, not an administrative
 * chase.
 */

import type { Severity } from "../types";
import type { Assignment, BookOn, CheckCall, ContactChannel, Post } from "./types";

/** Minutes throughout. */
export const OPS_RULES = {
  /** Late, but not yet a problem. */
  bookOnGraceMinutes: 15,
  /** Treated as a no-show, and escalated. */
  bookOnNoShowMinutes: 30,
  /**
   * Hourly, per client instruction. At one hour without a check call the
   * escalation starts — confirmed process, not a chosen threshold.
   */
  checkCallIntervalMinutes: 60,
  /**
   * Minutes PAST the hour at which Control stops trying the officer alone and
   * widens to the other contact routes. ASSUMED: the process says "further
   * measures" without naming a time. Worth confirming.
   */
  contactAttemptMinutes: 15,
  /**
   * Minutes PAST the hour at which someone from the operational team sets off
   * for site. ASSUMED, as above, and the one worth agreeing deliberately: it is
   * the point at which this stops being an administrative problem.
   *
   * Both are measured from the missed hour, not from each other, so the ladder
   * has one clock rather than three.
   */
  attendSiteMinutes: 30,
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

export type CheckCallState =
  | "not_required"
  | "ok"
  | "overdue"
  | "no_contact"
  | "welfare";

export interface CheckCallStatus {
  state: CheckCallState;
  label: string;
  severity: Severity;
  minutesSinceLast: number | null;
  /** Step on the ladder below. Zero where nothing is needed yet. */
  escalation: 0 | 1 | 2 | 3;
}

/**
 * The escalation ladder — the confirmed process.
 *
 * Each step names who acts, because "overdue" with no named next person is how
 * a missed call becomes nobody's job. The third step is a person getting in a
 * car; that is the point of the whole mechanism.
 */
export const ESCALATION_LADDER = [
  {
    step: 1,
    action: "Control tries the officer — personal mobile, then the site phone where the post has one",
    owner: "Control",
    afterMinutes: 0,
  },
  {
    step: 2,
    action:
      "Further measures to make contact — the site phone, other officers on site, the client's on-site contact",
    owner: "Control",
    afterMinutes: OPS_RULES.contactAttemptMinutes,
  },
  {
    step: 3,
    action: "A member of the operational team attends site to check the officer is safe",
    owner: "Operations team",
    afterMinutes: OPS_RULES.attendSiteMinutes,
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

  if (overdueBy < 0) {
    return {
      state: "ok",
      label: `Next in ${Math.abs(overdueBy)} min`,
      severity: "good",
      minutesSinceLast,
      escalation: 0,
    };
  }

  // Past the hour. The ladder starts immediately — there is no grace period,
  // because the hour IS the tolerance.
  if (overdueBy >= OPS_RULES.attendSiteMinutes) {
    return {
      state: "welfare",
      label: `No contact for ${minutesSinceLast} min — attend site`,
      severity: "critical",
      minutesSinceLast,
      escalation: 3,
    };
  }

  if (overdueBy >= OPS_RULES.contactAttemptMinutes) {
    return {
      state: "no_contact",
      label: `No contact — ${minutesSinceLast} min since last call`,
      severity: "critical",
      minutesSinceLast,
      escalation: 2,
    };
  }

  return {
    state: "overdue",
    label: `Check call overdue by ${overdueBy} min`,
    severity: "serious",
    minutesSinceLast,
    escalation: 1,
  };
}

/** The step the ladder is on, as a sentence Control can act on. */
export function escalationAction(step: 0 | 1 | 2 | 3): string | null {
  if (step === 0) return null;
  return ESCALATION_LADDER.find((l) => l.step === step)?.action ?? null;
}

/**
 * How much a contact record is worth as evidence.
 *
 * Officers use their own phones, and some posts have a site phone. The site
 * phone is the better record of the two: a call from the site's own line shows
 * the officer was at the site, where a mobile shows they had a mobile. Shown on
 * the board so the strength of the record is visible rather than assumed.
 */
export const CHANNEL_EVIDENCE: Record<
  ContactChannel,
  { label: string; strength: "strong" | "good" | "weak" }
> = {
  qr: { label: "QR tag at post", strength: "strong" },
  site_phone: { label: "Site phone", strength: "strong" },
  app: { label: "App on own phone", strength: "good" },
  phone: { label: "Call from own mobile", strength: "good" },
  supervisor: { label: "Confirmed by supervisor", strength: "good" },
  sms: { label: "SMS", strength: "weak" },
};
