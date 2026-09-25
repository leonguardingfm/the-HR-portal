"use client";

import { categoryLabel, currentClock, priorityOf, spanWords, statusOf, type ClockInput, type SlaPolicy, type Tone } from "@/lib/core/hub";

/**
 * The hub's small pieces. Colour never works alone: every badge carries its
 * words and an icon too (Control, 25 September 2026).
 *   red — critical, over time, failed, something missing
 *   amber — deadline coming, waiting on someone
 *   blue — accepted, in progress
 *   green — done within the SLA
 *   grey — cancelled, duplicate, nothing needed
 */
export const TONE: Record<Tone, { fg: string; bg: string }> = {
  red: { fg: "var(--critical-text)", bg: "var(--wash-critical)" },
  amber: { fg: "var(--warning-text)", bg: "var(--wash-warning)" },
  blue: { fg: "var(--accent-text)", bg: "color-mix(in srgb, var(--series-1) 12%, transparent)" },
  green: { fg: "var(--good-text)", bg: "var(--wash-good)" },
  grey: { fg: "var(--text-secondary)", bg: "var(--wash-neutral)" },
};

export function Chip({ tone, icon, children, title }: { tone: Tone; icon?: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap" style={{ background: TONE[tone].bg, color: "var(--text-primary)" }}>
      {icon && (
        <span aria-hidden style={{ color: TONE[tone].fg, fontSize: "10px" }}>
          {icon}
        </span>
      )}
      {children}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const p = priorityOf(priority);
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-semibold whitespace-nowrap" style={{ color: TONE[p.tone].fg }}>
      <span aria-hidden className="text-[10px]">
        {p.icon}
      </span>
      {p.label}
    </span>
  );
}

export function StatusBadge({ status, outcome, withinSla }: { status: string; outcome?: string | null; withinSla?: boolean | null }) {
  const s = statusOf(status);
  const late = status === "completed" && withinSla === false;
  const quiet = outcome === "no_action_required" || outcome === "duplicate_or_mistake";
  return (
    <Chip tone={late ? "amber" : quiet ? "grey" : s.tone} icon={s.icon}>
      {s.label}
      {late ? " · late" : ""}
    </Chip>
  );
}

export function CategoryChip({ category, note, review }: { category: string; note?: string | null; review?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap" style={{ borderColor: "var(--hairline)", background: "var(--surface-1)" }} title={note ?? undefined}>
        {category === "other" && note ? `Other: ${note}` : categoryLabel(category)}
      </span>
      {review && (
        <Chip tone="amber" icon="?" title="Sorted automatically and not yet checked by a person">
          Check
        </Chip>
      )}
    </span>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function Owner({ name, me }: { name: string | null; me?: boolean }) {
  if (!name) return <span className="text-[12px] font-semibold" style={{ color: "var(--warning-text)" }}>○ Unassigned</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap">
      <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold" style={{ background: me ? "var(--series-1)" : "var(--wash-neutral)", color: me ? "#fff" : "var(--text-secondary)" }}>
        {initials(name)}
      </span>
      {me ? "You" : name}
    </span>
  );
}

/** The clock that matters now, ticking. */
export function ClockBadge({ t, now, office, policy, compact = false }: { t: Omit<ClockInput, "receivedAt" | "ackDueAt" | "actionDueAt" | "updateDueAt" | "followUpAt" | "firstActionAt"> & { receivedAt: string; ackDueAt: string; actionDueAt: string; updateDueAt: string | null; followUpAt: string | null; firstActionAt: string | null }; now: Date; office: boolean; policy: SlaPolicy; compact?: boolean }) {
  const c = currentClock(
    {
      ...t,
      receivedAt: new Date(t.receivedAt),
      ackDueAt: new Date(t.ackDueAt),
      actionDueAt: new Date(t.actionDueAt),
      updateDueAt: t.updateDueAt ? new Date(t.updateDueAt) : null,
      followUpAt: t.followUpAt ? new Date(t.followUpAt) : null,
      firstActionAt: t.firstActionAt ? new Date(t.firstActionAt) : null,
    },
    now,
    office,
    policy,
  );
  if (c.clock === "closed") return <Chip tone={c.state === "late" ? "amber" : "green"} icon={c.state === "late" ? "⚠" : "✓"}>{c.label}</Chip>;
  const ms = c.dueAt ? c.dueAt.getTime() - now.getTime() : 0;
  const tone: Tone = c.state === "breached" ? "red" : c.state === "warning" ? "amber" : c.state === "waiting" ? "grey" : "green";
  const words = !c.dueAt ? "—" : ms >= 0 ? `${spanWords(ms)} left` : `${spanWords(ms)} over`;
  return (
    <span className="inline-flex flex-col leading-tight">
      {!compact && <span className="text-[10px] tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>{c.label}</span>}
      <span className="tnum text-[12px] font-semibold whitespace-nowrap" style={{ color: TONE[tone].fg }}>
        <span aria-hidden>{c.state === "breached" ? "⏰ " : c.state === "waiting" ? "⏸ " : ""}</span>
        {compact ? `${c.label} · ` : ""}
        {words}
      </span>
    </span>
  );
}

export const ukTimeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
export const ukDateTimeOf = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** For a datetime-local input: the UK wall-clock time of an instant. */
export const localInput = (iso: string | null) => {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const g = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
};
