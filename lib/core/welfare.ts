/**
 * Step 3 of the escalation ladder: the welfare visit — the rules, with no
 * database (Control, 25 September 2026).
 *
 *   - A supervisor or the Operations Manager goes to site.
 *   - Control gives the time they should be there. If they are not marked
 *     arrived within two minutes of it, the alarm goes to Control and the
 *     Operations Manager.
 *   - What they find is recorded. The police are called when an incident
 *     needs them — a judgement on the spot, not a timer.
 */

import type { Severity } from "@/lib/types";

export const WELFARE_RULES = {
  /** Past the time they should be there, before it is an alarm. */
  overdueGraceMinutes: 2,
  /** How long until they are there, as Control picks it. */
  etaChoices: [5, 10, 15, 20, 30, 45, 60, 90] as const,
} as const;

export const WELFARE_ATTENDEES = ["supervisor", "operations_manager"] as const;
export type WelfareAttendee = (typeof WELFARE_ATTENDEES)[number];

export const ATTENDEE_LABELS: Record<WelfareAttendee, string> = {
  supervisor: "Supervisor",
  operations_manager: "Operations Manager",
};

export const WELFARE_OUTCOMES = ["safe_and_well", "unwell_ambulance", "post_abandoned", "not_found_police", "stood_down"] as const;
export type WelfareOutcome = (typeof WELFARE_OUTCOMES)[number];

export const OUTCOME_SPECS: Record<WelfareOutcome, { label: string; hint: string; officerComesOff: boolean; needsArrival: boolean }> = {
  safe_and_well: { label: "Safe and well — on post", hint: "Say why they could not be reached: phone dead, no signal where they were…", officerComesOff: false, needsArrival: true },
  unwell_ambulance: { label: "Unwell or hurt — ambulance called", hint: "They come off the shift, and it goes on the cover list.", officerComesOff: true, needsArrival: true },
  post_abandoned: { label: "Not on site — post left", hint: "They come off the shift, and it goes on the cover list. Tell the client.", officerComesOff: true, needsArrival: true },
  not_found_police: { label: "Not found — police told", hint: "They come off the shift. The police reference is needed.", officerComesOff: true, needsArrival: true },
  stood_down: { label: "Officer got in touch first — visit called off", hint: "Say how they made contact.", officerComesOff: false, needsArrival: false },
};

export interface VisitFacts {
  dispatchedAt: Date;
  expectedBy: Date;
  arrivedAt: Date | null;
  closedAt: Date | null;
}

export type VisitState = "en_route" | "overdue" | "arrived" | "closed";

/** Where a visit is, in words and a severity, at a moment. */
export function visitStatus(v: VisitFacts, now: Date): { state: VisitState; label: string; severity: Severity; minutes: number } {
  if (v.closedAt) return { state: "closed", label: "Closed", severity: "neutral", minutes: 0 };
  if (v.arrivedAt) {
    const m = Math.round((now.getTime() - v.arrivedAt.getTime()) / 60_000);
    return { state: "arrived", label: `On site ${m} min — record what they found`, severity: "serious", minutes: m };
  }
  const late = Math.round((now.getTime() - v.expectedBy.getTime()) / 60_000);
  if (isOverdue(v, now)) return { state: "overdue", label: `Not arrived — ${late} min past the time given`, severity: "critical", minutes: late };
  const left = -late;
  return { state: "en_route", label: left > 0 ? `On the way — due in ${left} min` : "Due now", severity: "warning", minutes: left };
}

/** Not marked arrived within two minutes of the time given. */
export function isOverdue(v: VisitFacts, now: Date): boolean {
  return !v.closedAt && !v.arrivedAt && now.getTime() > v.expectedBy.getTime() + WELFARE_RULES.overdueGraceMinutes * 60_000;
}

/** Why a visit cannot be sent like this, or null. */
export function dispatchProblem(d: { kind: string; name: string; phone: string | null; etaMinutes: number }): string | null {
  if (!WELFARE_ATTENDEES.includes(d.kind as WelfareAttendee)) return "Choose who is going: a supervisor or the Operations Manager.";
  if (d.name.trim().length < 2) return "Say who is going.";
  if (d.kind === "supervisor" && !(d.phone && d.phone.replace(/\D/g, "").length >= 10)) return "Give the supervisor's phone, so Control can reach them on the way.";
  if (!Number.isInteger(d.etaMinutes) || d.etaMinutes < 1 || d.etaMinutes > 180) return "Say how long until they are there.";
  return null;
}

/** Why this outcome cannot be recorded, or null. */
export function outcomeProblem(o: { outcome: string; note: string; policeCalled: boolean; arrived: boolean }): string | null {
  if (!WELFARE_OUTCOMES.includes(o.outcome as WelfareOutcome)) return "Choose what was found.";
  const spec = OUTCOME_SPECS[o.outcome as WelfareOutcome];
  if (spec.needsArrival && !o.arrived) return "Mark them arrived first — what was found needs somebody there to find it.";
  if (o.note.trim().length < 3) return "Say what happened. This is the welfare record for the shift.";
  if (o.outcome === "not_found_police" && !o.policeCalled) return "Not found means the police are told — tick it and give their reference.";
  return null;
}
