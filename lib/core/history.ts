/**
 * Career and history, as rules [7.5.2a, 7.7].
 *
 * The timeline arithmetic the file's figures come from: the screening window,
 * which days the stated periods cover, which the verified ones do, and so
 * which unverified stretches are longer than the 31 days the standard allows.
 * Pure, so the test script reaches it without a database.
 *
 * Days are whole UTC days and every interval is inclusive of both ends, the
 * way a person states "January 2022 to June 2024".
 */

import { LIMITED_SCREENING_YEARS, MAX_UNVERIFIED_GAP_DAYS } from "@/lib/bs7858";

export type HistoryKind =
  | "employment"
  | "self_employment"
  | "education"
  | "unemployment"
  | "career_break"
  | "residence_abroad"
  | "gap";

export type HistoryMethod = "reference" | "documentary" | "government_record";

export const KIND_LABELS: Record<HistoryKind, string> = {
  employment: "Employment",
  self_employment: "Self-employment",
  education: "Education",
  unemployment: "Registered unemployment",
  career_break: "Career break",
  residence_abroad: "Residence abroad",
  gap: "Other gap",
};

export const KIND_CLAUSES: Record<HistoryKind, string> = {
  employment: "7.7b",
  self_employment: "7.7d",
  education: "7.7a",
  unemployment: "7.7c",
  career_break: "7.7e",
  residence_abroad: "7.7f",
  gap: "7.7h",
};

export const METHOD_LABELS: Record<HistoryMethod, string> = {
  reference: "Reference from the verifier",
  documentary: "Documentary evidence",
  government_record: "Government record (e.g. DWP, HMRC)",
};

/** Periods verified by documents rather than a referee: nobody to write to. */
export const DOCUMENT_ONLY: HistoryKind[] = ["career_break", "residence_abroad", "gap"];

export interface Period {
  id: string;
  kind: HistoryKind;
  organisation?: string | null;
  statedFrom: Date;
  statedTo: Date | null;
  confirmedFrom?: Date | null;
  confirmedTo?: Date | null;
  isCurrent: boolean;
  permissionToContact: boolean | null;
  contactVerifiedHow?: string | null;
  firstRequestAt: Date | null;
  secondRequestAt: Date | null;
  verifiedAt: Date | null;
}

/** An inclusive run of whole days, as day numbers. */
export interface Span {
  from: number;
  to: number;
}

const DAY = 86_400_000;
export const dayOf = (d: Date) => Math.floor(d.getTime() / DAY);
export const dateOf = (n: number) => new Date(n * DAY);
export const spanDays = (s: Span) => s.to - s.from + 1;

function yearsBefore(d: Date, years: number): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear() - years, d.getUTCMonth(), d.getUTCDate()));
  return x;
}

/**
 * The period to account for: the five years before the reference date, or
 * back to the 16th birthday if that is later [3.13]. The reference date is
 * when screening began.
 */
export function screeningWindow(args: { reference: Date; dateOfBirth: Date | null; years: number }): Span {
  const to = dayOf(args.reference);
  let from = dayOf(yearsBefore(args.reference, args.years));
  if (args.dateOfBirth) {
    const sixteen = dayOf(yearsBefore(new Date(args.dateOfBirth.getTime()), -16));
    from = Math.max(from, sixteen);
  }
  return { from, to };
}

/** Merge overlapping or touching spans. */
export function merge(spans: Span[]): Span[] {
  const sorted = spans.filter((s) => s.to >= s.from).sort((a, b) => a.from - b.from);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.from <= last.to + 1) last.to = Math.max(last.to, s.to);
    else out.push({ ...s });
  }
  return out;
}

/** The parts of the window no span covers. */
export function uncovered(window: Span, covered: Span[]): Span[] {
  const out: Span[] = [];
  let cursor = window.from;
  for (const s of merge(covered)) {
    if (s.to < window.from || s.from > window.to) continue;
    if (s.from > cursor) out.push({ from: cursor, to: Math.min(s.from - 1, window.to) });
    cursor = Math.max(cursor, s.to + 1);
    if (cursor > window.to) break;
  }
  if (cursor <= window.to) out.push({ from: cursor, to: window.to });
  return out;
}

/** What the individual stated a period covers; a continuing one runs to the window's end. */
export function statedSpan(p: Period, windowEnd: number): Span {
  return { from: dayOf(p.statedFrom), to: p.statedTo ? dayOf(p.statedTo) : windowEnd };
}

/** What verification confirmed, where it was verified. */
export function verifiedSpan(p: Period, windowEnd: number): Span | null {
  if (!p.verifiedAt) return null;
  const from = p.confirmedFrom ?? p.statedFrom;
  const to = p.confirmedTo ?? p.statedTo;
  return { from: dayOf(from), to: to ? dayOf(to) : windowEnd };
}

export interface HistoryAnalysis {
  window: Span;
  limitedWindow: Span;
  /** Days of the window the stated timeline does not account for at all. */
  holes: Span[];
  /** Stretches not yet verified, of any length. */
  unverified: Span[];
  /** The ones the standard does not allow: longer than 31 days [7.7]. */
  overLimit: Span[];
  /** Days inside those. What the file's "unverified days" means. */
  unverifiedDays: number;
  /** Limited screening: the last three years with nothing over 31 days unverified [7.5.2a]. */
  limitedDone: boolean;
  /** Full screening: the whole window with nothing over 31 days unverified [7.7]. */
  fullDone: boolean;
  /** Share of the window verified, for a progress bar. */
  verifiedShare: number;
}

/**
 * The whole calculation. An approved statutory declaration covers its period
 * as verification would [7.7i].
 */
export function analyseHistory(args: {
  periods: Period[];
  window: Span;
  reference: Date;
  declarations?: { from: Date; to: Date }[];
}): HistoryAnalysis {
  const { window } = args;
  const limitedFrom = Math.max(window.from, dayOf(yearsBefore(args.reference, LIMITED_SCREENING_YEARS)));
  const limitedWindow = { from: limitedFrom, to: window.to };

  const stated = args.periods.map((p) => statedSpan(p, window.to));
  const verified = [
    ...args.periods.map((p) => verifiedSpan(p, window.to)).filter((s): s is Span => s !== null),
    ...(args.declarations ?? []).map((d) => ({ from: dayOf(d.from), to: dayOf(d.to) })),
  ];

  const holes = uncovered(window, stated);
  const unverified = uncovered(window, verified);
  const overLimit = unverified.filter((s) => spanDays(s) > MAX_UNVERIFIED_GAP_DAYS);
  const limitedOver = uncovered(limitedWindow, verified).filter((s) => spanDays(s) > MAX_UNVERIFIED_GAP_DAYS);
  const windowDays = spanDays(window);
  const unverifiedTotal = unverified.reduce((n, s) => n + spanDays(s), 0);

  return {
    window,
    limitedWindow,
    holes,
    unverified,
    overLimit,
    unverifiedDays: overLimit.reduce((n, s) => n + spanDays(s), 0),
    limitedDone: limitedOver.length === 0,
    fullDone: overLimit.length === 0,
    verifiedShare: windowDays > 0 ? (windowDays - unverifiedTotal) / windowDays : 0,
  };
}

// ---------------------------------------------------------------------------
// Requests and chasing
// ---------------------------------------------------------------------------

/** Monday to Friday after `from`, up to and including `to`. Bank holidays are not counted out. */
export function workingDaysBetween(from: Date, to: Date): number {
  let n = 0;
  for (let d = dayOf(from) + 1; d <= dayOf(to); d++) {
    const wd = dateOf(d).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

/**
 * Where the chasing rhythm has got to (docs/proposal/03 §5): a 2nd request at
 * 10 working days, the documentary route at 20, escalation at 30.
 */
export function chaseState(
  p: Period,
  now = new Date(),
): { next: string; severity: "good" | "warning" | "serious" | "critical" | "neutral" } | null {
  if (p.verifiedAt) return null;
  if (!p.firstRequestAt) {
    return DOCUMENT_ONLY.includes(p.kind)
      ? { next: "Ask for two documents, one dated at each end", severity: "neutral" }
      : { next: "Not requested yet", severity: "neutral" };
  }
  const wd = workingDaysBetween(p.firstRequestAt, now);
  if (wd >= 30) return { next: "Escalate to the controller; consider a statutory declaration (7.7i)", severity: "critical" };
  if (wd >= 20) return { next: "Switch to the documentary route: two documents, one at each end", severity: "serious" };
  if (wd >= 10 && !p.secondRequestAt) return { next: "Send the 2nd request", severity: "serious" };
  if (wd >= 10) return { next: `2nd request sent · documentary route at 20 working days (${wd} so far)`, severity: "warning" };
  return { next: `${10 - wd} working day${10 - wd === 1 ? "" : "s"} to the 2nd request`, severity: "good" };
}

/** Why a reference request cannot go yet, or null. */
export function requestProblem(p: Period, contactVerifiedHow: string): string | null {
  if (p.verifiedAt) return "This period is already verified.";
  if (DOCUMENT_ONLY.includes(p.kind)) {
    return `${KIND_LABELS[p.kind]} is verified from documents, not a reference.`;
  }
  if (p.isCurrent && p.permissionToContact !== true) {
    return p.permissionToContact === false
      ? "Permission to contact the current employer was withheld. Verify this period from documents for now, and tell the individual the offer can be withdrawn if screening does not conclude (7.3.3a)."
      : "A current employer is not approached without the individual's prior written permission (7.7b). Record it first.";
  }
  if (contactVerifiedHow.trim().length < 10) {
    return "Record how the verifier's contact details were established independently — a number or address the individual supplied is not relied on (7.5.2a).";
  }
  return null;
}

/** Why a period cannot be marked verified this way, or null. */
export function verifyProblem(args: {
  period: Period;
  method: string;
  contactVerifiedHow: string | null;
  documentStart: string;
  documentEnd: string;
  confirmedFrom: Date | null;
  confirmedTo: Date | null;
}): string | null {
  const { period: p, method } = args;
  if (p.verifiedAt) return "This period is already verified.";
  if (!["reference", "documentary", "government_record"].includes(method)) return "Choose how it was verified.";
  if (method === "reference") {
    if (DOCUMENT_ONLY.includes(p.kind)) return `${KIND_LABELS[p.kind]} is verified from documents, not a reference.`;
    if ((args.contactVerifiedHow ?? "").trim().length < 10) {
      return "A reference only counts once the verifier's contact details were established independently (7.5.2a, 7.7).";
    }
  }
  if (method === "documentary") {
    const a = args.documentStart.trim().toLowerCase();
    const b = args.documentEnd.trim().toLowerCase();
    if (!a || !b) return "Name the two documents: one dated at the start of the period and one at the end.";
    if (a === b) return "The two documents must be of different types — a payslip and a P60, not two payslips.";
  }
  if (args.confirmedFrom && args.confirmedTo && args.confirmedFrom > args.confirmedTo) {
    return "The confirmed dates run backwards.";
  }
  return null;
}

/**
 * The two history checks on Form 2, read off the timeline once it exists:
 * three years (7.5.2a) and the whole period (7.7).
 */
export function historyCheckStatus(
  done: boolean,
  periods: Period[],
): { status: "verified" | "chased" | "requested" | "received" | "not_started"; firstRequestAt: Date | null; secondRequestAt: Date | null } {
  const firsts = periods.map((p) => p.firstRequestAt).filter(Boolean) as Date[];
  const seconds = periods.map((p) => p.secondRequestAt).filter(Boolean) as Date[];
  const firstRequestAt = firsts.length ? new Date(Math.min(...firsts.map((d) => d.getTime()))) : null;
  const secondRequestAt = seconds.length ? new Date(Math.max(...seconds.map((d) => d.getTime()))) : null;
  if (done) return { status: "verified", firstRequestAt, secondRequestAt };
  if (secondRequestAt) return { status: "chased", firstRequestAt, secondRequestAt };
  if (firstRequestAt) return { status: "requested", firstRequestAt, secondRequestAt };
  if (periods.some((p) => p.verifiedAt)) return { status: "received", firstRequestAt, secondRequestAt };
  return { status: "not_started", firstRequestAt, secondRequestAt };
}
