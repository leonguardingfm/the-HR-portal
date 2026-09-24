/**
 * Live operations rules — book-on windows, check calls, welfare escalation.
 *
 * These are OUR operational numbers, not a standard's, so they are kept out of
 * lib/bs7858.ts for the same reason lib/policy.ts is: a local preference must
 * never be mistaken for a regulatory requirement. They belong in Admin as
 * configuration.
 *
 * The check-call rule is the confirmed process (E4): check calls are hourly,
 * and the moment the hour is crossed it triggers. There is no grace period and
 * no timer between the steps — Control tries to reach the officer, and if
 * contact cannot be made, a member of the operational team goes to site.
 *
 * So the ladder advances on FAILED CONTACT ATTEMPTS, not on elapsed minutes.
 * That is what actually happens: Control does not wait fifteen minutes to try
 * the site phone, it tries the site phone because the mobile did not answer.
 *
 * The ladder ending with a person attending rather than with a red row on a
 * screen is the point of the whole mechanism. It is a duty of care, not an
 * administrative chase.
 *
 * THERE ARE TWO REGIMES, not one with a tolerance (E10):
 *
 *   Officer-initiated, on a post with a mobile signal. The officer calls
 *   hourly; missing one triggers the ladder above.
 *
 *   Client-held, on a post with none. The officer books on BEFORE going in —
 *   the only moment they have a signal to do it with — the helpdesk emails the
 *   client to say they have arrived and cannot be reached by mobile, and the
 *   client holds contact on the site phone. If the client cannot reach them,
 *   they tell us and somebody attends.
 *
 * Counting hours against an officer who cannot call is not a stricter reading
 * of the rule, it is a wrong one: it would put a missed check call on the board
 * every hour, all night, and a board that is always red is a board nobody
 * reads. So `mobileSignal: false` selects a different state machine, and what
 * is watched is the handover rather than the calls.
 */

import type { Severity } from "../types";
import type {
  Assignment,
  BookOn,
  CheckCall,
  ContactAttempt,
  ContactChannel,
  Post,
} from "./types";

/** Minutes throughout. */
export const OPS_RULES = {
  /** Late, but not yet a problem. */
  bookOnGraceMinutes: 15,
  /** Treated as a no-show, and escalated. */
  bookOnNoShowMinutes: 30,
  /**
   * Hourly, per client instruction. The moment the hour is crossed it
   * triggers — confirmed process, and the only threshold in the rule. There is
   * deliberately no grace period: the hour IS the tolerance.
   */
  checkCallIntervalMinutes: 60,
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

/**
 * `client_held` is the no-signal case, and it is a state rather than a variant
 * of "ok" because the obligation has genuinely moved. Nobody here is waiting
 * for the officer to call: the client is holding contact on the site phone, and
 * what we are watching is whether the client has been told and whether they
 * have come back to say they cannot reach them.
 */
export type CheckCallState = "not_required" | "ok" | "triggered" | "client_held";

/**
 * The no-signal handover, as the rules need to see it.
 *
 * Two timestamps that matter, in order: when the helpdesk told the client the
 * officer was on site without a signal, and — if it happens — when the client
 * came back to say they had lost contact. The second is what starts the
 * attend-site step, because on a post with no signal the client noticing is the
 * only way anyone finds out.
 */
export interface NoSignalHandover {
  assignmentId: string;
  notifiedAt: string | null;
  lossReportedAt: string | null;
}

export interface CheckCallStatus {
  state: CheckCallState;
  label: string;
  severity: Severity;
  minutesSinceLast: number | null;
  /** Minutes past the hour. Zero or less means nothing is due. */
  minutesOver: number;
  /** Step on the ladder — driven by failed attempts, not by elapsed time. */
  escalation: 0 | 1 | 2 | 3;
  /** Attempts made since the last successful contact. */
  attemptsMade: number;
}

/**
 * The escalation ladder — the confirmed process.
 *
 * Each step names who acts, because "overdue" with no named next person is how
 * a missed call becomes nobody's job. Steps advance when an attempt fails, so
 * nothing sits waiting for a clock: if Control tries the mobile and gets no
 * answer, the board is already on step 2.
 */
export const ESCALATION_LADDER = [
  {
    step: 1,
    action: "Control tries the officer — personal mobile, then the site phone where the post has one",
    owner: "Control",
    reached: "No answer",
  },
  {
    step: 2,
    action:
      "Further measures to make contact — the site phone, other officers on site, the client's on-site contact",
    owner: "Control",
    reached: "Still no contact",
  },
  {
    step: 3,
    action: "A supervisor or the Operations Manager attends site to check the officer is safe — alarm if not there within 2 minutes of the time given",
    owner: "Supervisor or Operations Manager",
    reached: "Contact cannot be made",
  },
] as const;

export function checkCallStatus(
  assignment: Assignment,
  post: Post,
  calls: CheckCall[],
  bookOn: BookOn | undefined,
  attempts: ContactAttempt[] = [],
  now: Date = new Date(),
  /** Only read on a post with no mobile signal. */
  handover?: NoSignalHandover,
): CheckCallStatus {
  const idle = (label: string): CheckCallStatus => ({
    state: "not_required",
    label,
    severity: "neutral",
    minutesSinceLast: null,
    minutesOver: 0,
    escalation: 0,
    attemptsMade: 0,
  });

  if (!post.checkCallsRequired) return idle("Not required on this post");

  const t = now.getTime();
  const start = new Date(assignment.startsAt).getTime();
  const end = new Date(assignment.endsAt).getTime();

  // Calls are expected only while the officer is actually on post.
  if (!bookOn || t < start || t >= end) return idle("Not on post");

  // --- The no-signal regime ------------------------------------------------
  //
  // The officer cannot call, so counting the hours against them is meaningless
  // and showing it as a missed call is worse than meaningless. What is being
  // watched instead is the handover: has the client been told, and have they
  // come back to say they cannot reach the officer.
  if (!post.mobileSignal) {
    const minutesOnPost = Math.round((t - new Date(bookOn.at).getTime()) / MS_PER_MIN);

    if (handover?.lossReportedAt) {
      // The client noticing is the only way anybody finds out on a post like
      // this, so their report goes straight to the end of the ladder.
      return {
        state: "triggered",
        label: "Client cannot reach the officer — attend site",
        severity: "critical",
        minutesSinceLast: minutesOnPost,
        minutesOver: 0,
        escalation: 3,
        attemptsMade: 0,
      };
    }

    if (!handover?.notifiedAt) {
      // Until the client has been told, nobody is holding contact with this
      // officer at all. That is the gap, and it opens the moment they go in.
      const late = minutesOnPost > OPS_RULES.bookOnGraceMinutes;
      return {
        state: "client_held",
        label: late
          ? `Client not yet told the officer is on site with no signal — ${minutesOnPost} min`
          : "No signal on this post — tell the client the officer has arrived",
        severity: late ? "serious" : "warning",
        minutesSinceLast: minutesOnPost,
        minutesOver: 0,
        escalation: 0,
        attemptsMade: 0,
      };
    }

    return {
      state: "client_held",
      label: "No signal — client holding contact on the site phone",
      severity: "good",
      minutesSinceLast: minutesOnPost,
      minutesOver: 0,
      escalation: 0,
      attemptsMade: 0,
    };
  }

  const mine = calls
    .filter((c) => c.assignmentId === assignment.id)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // The clock runs from the book-on until the first call.
  const lastAt = mine.length > 0 ? new Date(mine[0].at).getTime() : new Date(bookOn.at).getTime();
  const minutesSinceLast = Math.round((t - lastAt) / MS_PER_MIN);
  const minutesOver = minutesSinceLast - OPS_RULES.checkCallIntervalMinutes;

  // Attempts only count if they were made after the call went missing —
  // anything earlier belongs to a check call that was since satisfied.
  const failedAttempts = attempts.filter(
    (a) => a.assignmentId === assignment.id && !a.reached && new Date(a.at).getTime() > lastAt,
  ).length;

  if (minutesOver <= 0) {
    return {
      state: "ok",
      label: `Next in ${Math.abs(minutesOver)} min`,
      severity: "good",
      minutesSinceLast,
      minutesOver,
      escalation: 0,
      attemptsMade: failedAttempts,
    };
  }

  // Past the hour: triggered, immediately. The step is decided by what has
  // already been tried, so it opens at step 1 and moves up as attempts fail.
  const escalation = Math.min(failedAttempts + 1, 3) as 1 | 2 | 3;

  // Severity separates "just triggered" from "we have tried and failed", which
  // is what lets the board sort the work. It is not a second set of thresholds:
  // both are actionable now, and both are red or amber the moment they appear.
  const severity: Severity = escalation === 1 ? "serious" : "critical";

  const label =
    escalation === 3
      ? `Contact not made after ${failedAttempts} attempts — attend site`
      : escalation === 2
        ? `No answer after ${failedAttempts} attempt${failedAttempts === 1 ? "" : "s"} — widen contact`
        : `Check call missed — ${minutesOver} min over`;

  return {
    state: "triggered",
    label,
    severity,
    minutesSinceLast,
    minutesOver,
    escalation,
    attemptsMade: failedAttempts,
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
