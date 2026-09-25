/**
 * The audit log, grouped for searching (26 September 2026). Every action in the
 * portal writes an event; these groups are how a person asks "what happened"
 * without knowing the internal names.
 */

export const AUDIT_GROUPS: { id: string; label: string; prefixes: string[] }[] = [
  { id: "access", label: "Sign-in, accounts and roles", prefixes: ["session.", "account.", "role.", "security.", "delegation.", "audit."] },
  { id: "hub", label: "Performance hub (emails and tasks)", prefixes: ["hub."] },
  { id: "duty", label: "Control Room: duty, check calls, rota", prefixes: ["duty.", "book_on.", "check_call.", "chase_up.", "contact_attempt.", "welfare.", "rota.", "assignment.", "incident.", "no_signal.", "availability.", "officer.", "place."] },
  { id: "hr", label: "HR: candidates, screening, employees", prefixes: ["candidate.", "candidacy.", "interview.", "screening.", "history.", "onboarding.", "employee.", "leave.", "gate.", "licence.", "requirement."] },
  { id: "admin", label: "Admin: requests, payments, stock", prefixes: ["admin_", "payment.", "asset.", "stock.", "accreditation.", "authority_matter."] },
  { id: "documents", label: "Documents and data", prefixes: ["document.", "data.", "disposal."] },
];

export const auditGroupOf = (type: string) => AUDIT_GROUPS.find((g) => g.prefixes.some((p) => type.startsWith(p)))?.label ?? "Other";

/** "hub.priority_changed" → "Priority changed". */
export const typeWords = (type: string) => {
  const last = type.includes(".") ? type.slice(type.indexOf(".") + 1) : type;
  const words = last.replace(/[._]/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : type;
};

/** A field for a CSV file: quoted, and never starting with a formula character a spreadsheet would run. */
export function csvField(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
