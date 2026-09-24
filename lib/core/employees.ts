/**
 * The employee record's rules (HR, 25 September 2026): why someone leaves,
 * how leave is counted, and what a leave request must say. Pure — the pages,
 * the actions and the tests share them.
 */

import { addDays, datesBetween, isDate } from "./rota";

export const CONTRACT_TYPES = [
  { id: "full_time", label: "Full time" },
  { id: "part_time", label: "Part time" },
  { id: "zero_hours", label: "Zero hours" },
  { id: "casual", label: "Casual" },
  { id: "fixed_term", label: "Fixed term" },
] as const;

export const contractLabel = (id: string | null) => CONTRACT_TYPES.find((c) => c.id === id)?.label ?? null;

/** Typed, so retention and turnover reporting work; the story goes in the note. */
export const LEAVER_REASONS = [
  { id: "resigned", label: "Resigned" },
  { id: "dismissed", label: "Dismissed" },
  { id: "end_of_contract", label: "End of contract" },
  { id: "failed_screening", label: "Failed screening or licence lost" },
  { id: "retired", label: "Retired" },
  { id: "other", label: "Other" },
] as const;

export const leaverLabel = (id: string | null) => LEAVER_REASONS.find((r) => r.id === id)?.label ?? id ?? "—";

/** The documents an employee record takes. Screening documents stay on the screening file [6.1]. */
export const EMPLOYEE_DOCUMENT_TYPES = [
  { id: "employment_contract", label: "Signed contract" },
  { id: "training_certificate", label: "Training certificate" },
  { id: "right_to_work", label: "Right to work" },
  { id: "visa", label: "Visa or permit" },
  { id: "sia_licence", label: "SIA licence" },
  { id: "welcome_pack", label: "Welcome pack" },
  { id: "cv", label: "CV" },
] as const;

export const LEAVE_RULES = {
  /** A day off with nothing rostered counts at the entitlement's basis: 28 days at 8 hours. */
  hoursPerDay: 8,
  /** Longer than this is a conversation, not a form. */
  maxDays: 28,
  /** How far ahead a request may be made. */
  aheadDays: 365,
};

/**
 * What a leave request costs, day by day. A day they are rostered costs the
 * shifts that start on it — eight hours or twelve, depending on the post; a
 * day they are not costs a day at the entitlement's basis.
 */
export function leaveHours(from: string, to: string, shiftHoursByDate: Record<string, number>): number {
  return Math.round(datesBetween(from, to).reduce((n, d) => n + (shiftHoursByDate[d] ?? LEAVE_RULES.hoursPerDay), 0));
}

export function leaveProblemFor(from: string, to: string, today: string): string | null {
  if (!isDate(from) || !isDate(to)) return "Give the first and last day of the leave.";
  if (to < from) return "The last day is before the first.";
  if (from < today) return "Leave starts today or later.";
  if (from > addDays(today, LEAVE_RULES.aheadDays)) return "That is more than a year ahead.";
  if (datesBetween(from, to).length > LEAVE_RULES.maxDays) return `One request covers up to ${LEAVE_RULES.maxDays} days. Speak to Administration about longer leave.`;
  return null;
}

/** How a training record or document stands against its expiry date. */
export function expiryState(expires: string | null, today: string): "ok" | "soon" | "expired" | null {
  if (!expires) return null;
  if (expires < today) return "expired";
  if (expires <= addDays(today, 60)) return "soon";
  return "ok";
}
