/**
 * Clients, sites and posts — the rules for entering them, with no database.
 *
 * Control enters them in the portal (25 September 2026), because a post's
 * check-call rule, its signal and its instructions are what the rota and the
 * duty checks run on, and a site's location is what an officer's selfie is
 * checked against. Nothing is deleted: a client, site or post the company no
 * longer covers is made inactive, and its history stays.
 */

import { parsePattern } from "./rota";

export const SCREENING_PERIODS = [5, 10] as const;
export const CHECK_CALL_RULES = ["always", "nights_and_weekends", "never"] as const;
export type CheckCallRuleId = (typeof CHECK_CALL_RULES)[number];

export const RADIUS_LIMITS = { min: 25, max: 5000, default: 200 } as const;

const name = (v: string, what: string) => {
  const t = v.trim();
  if (t.length < 2) return `Give the ${what} a name.`;
  if (t.length > 120) return `That ${what} name is too long — 120 characters at most.`;
  return null;
};

/** A UK phone number, loosely: digits, spaces and a leading +, ten or more digits. */
export function phoneProblem(v: string | null | undefined, what: string): string | null {
  if (!v || !v.trim()) return null;
  if (!/^\+?[\d\s()-]{10,20}$/.test(v.trim()) || v.replace(/\D/g, "").length < 10) return `The ${what} does not look like a phone number.`;
  return null;
}

export function clientProblem(c: { name: string; screeningPeriodYears: number; contractStart: string | null; contractEnd: string | null }): string | null {
  return (
    name(c.name, "client") ??
    (!SCREENING_PERIODS.includes(c.screeningPeriodYears as 5 | 10) ? "The screening period is 5 or 10 years, from the contract." : null) ??
    (c.contractStart && c.contractEnd && c.contractEnd < c.contractStart ? "The contract ends before it starts." : null)
  );
}

export function siteProblem(s: { name: string; address: string | null; contactPhone: string | null; radiusMetres: number; locationText: string; location: { lat: number; lng: number } | null }): string | null {
  return (
    name(s.name, "site") ??
    (s.address && s.address.length > 300 ? "That address is too long." : null) ??
    phoneProblem(s.contactPhone, "contact's phone") ??
    (s.locationText.trim() && !s.location ? "The location is not one we can read. Paste “51.5074, -0.1278”, or a Google Maps link to the place." : null) ??
    (!Number.isInteger(s.radiusMetres) || s.radiusMetres < RADIUS_LIMITS.min || s.radiusMetres > RADIUS_LIMITS.max
      ? `The radius is a whole number of metres from ${RADIUS_LIMITS.min} to ${RADIUS_LIMITS.max}.`
      : null)
  );
}

export function postProblem(p: { name: string; pattern: string | null; screeningPeriodYears: number; checkCalls: string; phone: string | null; instructions: string | null }): string | null {
  return (
    name(p.name, "post") ??
    (!SCREENING_PERIODS.includes(p.screeningPeriodYears as 5 | 10) ? "The screening period is 5 or 10 years." : null) ??
    (!CHECK_CALL_RULES.includes(p.checkCalls as CheckCallRuleId) ? "Choose when check calls are made on this post." : null) ??
    phoneProblem(p.phone, "post's phone") ??
    (p.instructions && p.instructions.length > 4000 ? "The instructions are too long — 4,000 characters at most." : null) ??
    (p.pattern && p.pattern.length > 80 ? "The pattern is too long." : null)
  );
}

/** A pattern the rota cannot read is allowed, and said so: it just draws no gaps. */
export function patternWarning(pattern: string | null): string | null {
  if (!pattern || !pattern.trim()) return null;
  return parsePattern(pattern) ? null : `The rota cannot read “${pattern}” as days and hours (e.g. “Mon–Fri 19:00–07:00”), so it will not suggest shifts from it.`;
}

/** "Name: a → b" for each field that changed — the event log's account of an edit. */
export function changes(before: Record<string, unknown>, after: Record<string, unknown>, labels: Record<string, string>): string[] {
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "yes" : "no") : String(v));
  return Object.keys(labels)
    .filter((k) => show(before[k]) !== show(after[k]))
    .map((k) => `${labels[k]}: ${show(before[k])} → ${show(after[k])}`);
}
