const LONG_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

export function formatDate(value: string | Date | null): string {
  if (!value) return "—";
  return LONG_DATE.format(typeof value === "string" ? new Date(value) : value);
}

export function formatShortDate(value: string | Date | null): string {
  if (!value) return "—";
  return SHORT_DATE.format(typeof value === "string" ? new Date(value) : value);
}

export function daysSince(value: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(value).getTime()) / 86_400_000);
}

/** "3 days", "1 day", "today" — reads better than a bare number in a table. */
export function formatDays(n: number): string {
  if (n === 0) return "today";
  const abs = Math.abs(n);
  const unit = abs === 1 ? "day" : "days";
  return n < 0 ? `${abs} ${unit} over` : `${abs} ${unit}`;
}

export function titleCase(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
