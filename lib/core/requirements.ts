/**
 * Client requirements — Track A, as rules (docs/proposal/03 §3).
 *
 *   A1 Received ─> A2 Pool check ─> A3a Covered internally (closed)
 *                               └─> A3b Released to sourcing ─> A4 Allocated ─> A5 Filled
 *
 * Headcount is counted from allocations, so a requirement for three is two of
 * three filled rather than open or closed. Pure, so the test script reaches it.
 */

import type { RequirementStatus } from "@/lib/types";

export const OPEN_STATUSES: RequirementStatus[] = ["received", "pool_check", "released_to_sourcing", "allocated"];
export const CLOSED_STATUSES: RequirementStatus[] = ["covered_internally", "filled", "cancelled"];

export const STAGE_LABELS: Record<RequirementStatus, string> = {
  received: "A1 Received",
  pool_check: "A2 Pool check",
  covered_internally: "A3a Covered internally",
  released_to_sourcing: "A3b With HR for sourcing",
  allocated: "A4 Allocated",
  filled: "A5 Filled",
  cancelled: "Cancelled",
};

export interface Headcount {
  required: number;
  allocated: number;
  remaining: number;
  fromPool: number;
  recruited: number;
}

export function headcount(required: number, live: { source: "pool" | "recruited" }[]): Headcount {
  const fromPool = live.filter((a) => a.source === "pool").length;
  const recruited = live.length - fromPool;
  return { required, allocated: live.length, remaining: Math.max(required - live.length, 0), fromPool, recruited };
}

/**
 * Where a requirement stands once its allocations change. Fully covered from
 * the pool before anything went to HR closes it as covered internally (A3a);
 * fully covered with HR involved is allocated (A4), waiting for Control to
 * confirm the officers are on site (A5). Filled and cancelled are only ever
 * set by a person.
 */
export function statusAfterAllocation(args: {
  current: RequirementStatus;
  hc: Headcount;
  released: boolean;
}): RequirementStatus {
  if (CLOSED_STATUSES.includes(args.current) && args.current !== "covered_internally") return args.current;
  if (args.hc.remaining === 0) return args.released ? "allocated" : "covered_internally";
  if (args.released) return "released_to_sourcing";
  return args.hc.allocated > 0 || args.current === "pool_check" ? "pool_check" : "received";
}

export function releaseProblem(args: { status: RequirementStatus; hc: Headcount; note: string }): string | null {
  if (CLOSED_STATUSES.includes(args.status)) return "This requirement is closed.";
  if (args.status === "released_to_sourcing" || args.status === "allocated") return "It is already with HR.";
  if (args.hc.remaining === 0) return "Every place is already covered from the pool.";
  if (args.note.trim().length < 10) return "Say why the pool cannot cover it — that is what HR is handed.";
  return null;
}

export function fillProblem(args: { status: RequirementStatus; hc: Headcount }): string | null {
  if (args.status === "filled") return "Already filled.";
  if (args.status === "cancelled") return "This requirement was cancelled.";
  if (args.hc.remaining > 0) return `${args.hc.remaining} of ${args.hc.required} still to allocate.`;
  return null;
}

/** REQ-1050 after REQ-1049: the highest issued plus one, never reused. */
export function nextReference(existing: string[]): string {
  const max = existing
    .map((r) => /^REQ-(\d+)$/.exec(r)?.[1])
    .filter(Boolean)
    .reduce((m, n) => Math.max(m, Number(n)), 1000);
  return `REQ-${max + 1}`;
}

/** Starting soon with places still open: the requirements that turn into an uncovered post. */
export function atRisk(args: { status: RequirementStatus; startDate: Date; hc: Headcount }, now = new Date(), days = 7): boolean {
  if (!OPEN_STATUSES.includes(args.status) || args.hc.remaining === 0) return false;
  return args.startDate.getTime() - now.getTime() <= days * 86_400_000;
}
