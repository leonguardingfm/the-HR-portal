/** The period a performance view covers, in plain words, and time written for people. */

import { MANAGER_ROLE, type HubDepartment } from "./hub";
import { addDays, mondayOf, ukDate, ukInstant } from "./rota";

/**
 * Whose performance a role may see (26 September 2026). The Managing Director:
 * the whole company, every department and every person. The head of a
 * department — the Operations Manager for the Control Room, the HR Manager for
 * HR (with Vetting, which works the same mailbox), the Admin Manager for
 * Accounts & Admin — their own department and each person in it; nothing of
 * another department's. Nobody else.
 */
export type PerformanceScope = { all: true; department: null } | { all: false; department: HubDepartment };
export function performanceScope(role: string): PerformanceScope | null {
  if (role === "top_management") return { all: true, department: null };
  const d = (Object.keys(MANAGER_ROLE) as HubDepartment[]).find((k) => MANAGER_ROLE[k] === role);
  return d ? { all: false, department: d } : null;
}

export const PERIODS = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" },
  { id: "lastmonth", label: "Last month" },
  { id: "custom", label: "Choose dates" },
] as const;

export function periodRange(id: string, from: string | undefined, to: string | undefined, now = new Date()): { from: Date; to: Date; label: string } {
  const today = ukDate(now);
  const start = (d: string) => ukInstant(d, "00:00");
  const tomorrow = start(addDays(today, 1));
  const ym = today.slice(0, 7);
  switch (id) {
    case "week":
      return { from: start(mondayOf(today)), to: tomorrow, label: "This week" };
    case "7d":
      return { from: start(addDays(today, -6)), to: tomorrow, label: "Last 7 days" };
    case "30d":
      return { from: start(addDays(today, -29)), to: tomorrow, label: "Last 30 days" };
    case "month":
      return { from: start(`${ym}-01`), to: tomorrow, label: "This month" };
    case "lastmonth": {
      const first = `${ym}-01`;
      const prev = addDays(first, -1).slice(0, 7);
      return { from: start(`${prev}-01`), to: start(first), label: "Last month" };
    }
    case "custom":
      if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to) return { from: start(from), to: start(addDays(to, 1)), label: `${from} to ${to}` };
      return { from: start(today), to: tomorrow, label: "Today" };
    default:
      return { from: start(today), to: tomorrow, label: "Today" };
  }
}

/** 4 min · 2 h 5 min · 1 d 3 h */
export function minutesWords(n: number | null): string {
  if (n === null) return "—";
  if (n < 60) return `${Math.max(0, Math.round(n))} min`;
  const h = Math.floor(n / 60);
  if (h < 24) return `${h} h${n % 60 ? ` ${Math.round(n % 60)} min` : ""}`;
  return `${Math.floor(h / 24)} d${h % 24 ? ` ${h % 24} h` : ""}`;
}
