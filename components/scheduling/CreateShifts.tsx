"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { createShifts } from "@/lib/actions/rota";
import type { ActionResult } from "@/lib/actions/types";
import { DAY_SHORT, MAX_CREATE_DAYS, addDays, createProblem, dayLabel, datesBetween, slotsFor, weekday, type ShiftTime } from "@/lib/core/rota";
import type { RotaPost } from "@/lib/db/rota";
import { Drawer } from "./Drawer";
import { Result, field, inputStyle } from "./RotaForms";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const nextMonth = (first: string) => {
  const [y, m] = first.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};
const prevMonth = (first: string) => {
  const [y, m] = first.split("-").map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
};

const PRESETS: { label: string; times: ShiftTime[] }[] = [
  { label: "Day 07:00–19:00", times: [{ start: "07:00", end: "19:00" }] },
  { label: "Night 19:00–07:00", times: [{ start: "19:00", end: "07:00" }] },
  { label: "Day and night", times: [{ start: "07:00", end: "19:00" }, { start: "19:00", end: "07:00" }] },
  { label: "09:00–17:00", times: [{ start: "09:00", end: "17:00" }] },
];

/**
 * Create the rota before anyone is on it: choose the posts, mark the first
 * and last day on the calendar, the days of the week and the shift times,
 * and every one of those shifts is created at once, open.
 */
export function CreateShifts({
  posts,
  today,
  initialPostId,
  initialDate,
  onClose,
  onAssign,
  onCreated,
}: {
  posts: RotaPost[];
  today: string;
  initialPostId?: string;
  initialDate?: string;
  onClose: () => void;
  /** After creating: go to the shifts and start assigning officers to them. */
  onAssign: (from: string, days: number) => void;
  /** As soon as they exist: bring the roster behind round to them. */
  onCreated: (from: string, days: number) => void;
}) {
  const single = posts.find((p) => p.id === initialPostId);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(initialPostId ? [initialPostId] : []));
  const [from, setFrom] = useState<string | null>(initialDate ?? null);
  const [to, setTo] = useState<string | null>(initialDate ?? null);
  const [picking, setPicking] = useState<"from" | "to">(initialDate ? "to" : "from");
  const [month, setMonth] = useState(monthStart(initialDate ?? today));
  const [weekdays, setWeekdays] = useState<Set<number>>(() => new Set([0, 1, 2, 3, 4, 5, 6]));
  const [times, setTimes] = useState<ShiftTime[]>(() => [single?.parsed ? { start: single.parsed.start, end: single.parsed.end } : { start: "09:00", end: "17:00" }]);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<(ActionResult & { created: number }) | null>(null);
  const [pending, startCreating] = useTransition();

  // The calendar: a click marks the first day, the next the last.
  const pick = (d: string) => {
    setResult(null);
    if (picking === "from" || !from || d < from) {
      setFrom(d);
      setTo(d);
      setPicking("to");
    } else {
      setTo(d);
      setPicking("from");
    }
  };
  const quick = (a: string, b: string) => {
    setFrom(a);
    setTo(b);
    setPicking("from");
    setMonth(monthStart(a));
    setResult(null);
  };
  const monday = addDays(today, (7 - weekday(today)) % 7 || 7);

  const groups = useMemo(() => {
    const g: { site: string; posts: RotaPost[] }[] = [];
    for (const p of posts) {
      if (query && !`${p.name} ${p.siteName} ${p.clientName}`.toLowerCase().includes(query.toLowerCase())) continue;
      const last = g[g.length - 1];
      if (last && last.site === p.siteName) last.posts.push(p);
      else g.push({ site: p.siteName, posts: [p] });
    }
    return g;
  }, [posts, query]);
  const toggle = (ids: string[]) =>
    setChosen((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });

  const args = { postIds: [...chosen], from: from ?? "", to: to ?? "", weekdays: [...weekdays], times };
  const problem = createProblem(args);

  // Which step the problem is in, so the button can take you to it rather than sit greyed out.
  const timesProblem = createProblem({ postIds: ["any"], from: today, to: today, weekdays: [0, 1, 2, 3, 4, 5, 6], times });
  const needs: Record<Step, boolean> = {
    1: chosen.size === 0,
    2: !from || !to || to < from || to < today || datesBetween(from, to).length > MAX_CREATE_DAYS,
    3: weekdays.size === 0,
    4: !!timesProblem,
  };
  const problemStep: Step | null = !problem ? null : needs[1] ? 1 : needs[2] ? 2 : needs[3] ? 3 : needs[4] ? 4 : 2;
  const [attention, setAttention] = useState<Step | null>(null);
  const refs = { 1: useRef<HTMLElement>(null), 2: useRef<HTMLElement>(null), 3: useRef<HTMLElement>(null), 4: useRef<HTMLElement>(null) };
  const goTo = (step: Step) => {
    setAttention(step);
    refs[step].current?.scrollIntoView({ behavior: "smooth", block: "start" });
    refs[step].current?.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
  };
  const perPost = !problem && from && to ? slotsFor({ from, to, weekdays: [...weekdays], times }).length : 0;
  const total = perPost * chosen.size;
  const days = from && to ? datesBetween(from, to).length : 0;

  // Always clickable: with something missing, it takes you to it.
  const create = () => {
    if (problemStep) {
      goTo(problemStep);
      return;
    }
    setAttention(null);
    startCreating(async () => {
      const r = await createShifts(args);
      setResult(r);
      if (r.ok && from) onCreated(from, days);
    });
  };
  const stepProps = (step: Step) => ({ step, done: !needs[step], flagged: attention === step && needs[step], sectionRef: refs[step] });

  return (
    <Drawer title="Create shifts" subtitle="The rota first: the shifts are created open, and officers are put on them afterwards." wide onClose={onClose}>
      <StepSection
        {...stepProps(1)}
        title="Posts"
        detail={chosen.size ? `${chosen.size} chosen` : "tick the posts these shifts are for"}
        action={
          <button type="button" onClick={() => toggle(posts.map((p) => p.id))} className="text-[11px] underline-offset-2 hover:underline" style={{ color: "var(--series-1)" }}>
            {chosen.size === posts.length ? "Clear all" : "Every post"}
          </button>
        }
      >
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a post, site or client" aria-label="Find a post" className={`${field} mt-2 h-8 w-full`} style={inputStyle} />
        <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-md border p-2" style={{ borderColor: "var(--hairline)" }}>
          {groups.map((g) => (
            <div key={g.site}>
              <label className="flex items-center gap-2 text-[11px] font-semibold tracking-wide uppercase" style={{ color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={g.posts.every((p) => chosen.has(p.id))} onChange={() => toggle(g.posts.map((p) => p.id))} className="h-3.5 w-3.5" aria-label={`Every post at ${g.site}`} />
                {g.site}
              </label>
              <div className="mt-1 ml-5 flex flex-wrap gap-1.5">
                {g.posts.map((p) => (
                  <label key={p.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] has-[:checked]:border-[var(--series-1)] has-[:checked]:bg-[var(--roster-draft-wash)]" style={{ borderColor: "var(--hairline)" }}>
                    <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle([p.id])} className="h-3.5 w-3.5" />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <p className="py-2 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
              No post matches.
            </p>
          )}
        </div>
      </StepSection>

      <StepSection
        {...stepProps(2)}
        title="From and to"
        detail={from && to ? `${dayLabel(from)} to ${dayLabel(to)} ${to.slice(0, 4)}, ${days} day${days === 1 ? "" : "s"}` : "click the first day, then the last"}
      >
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            ["Next week", monday, addDays(monday, 6)],
            ["Next 2 weeks", monday, addDays(monday, 13)],
            ["Next 4 weeks", monday, addDays(monday, 27)],
            ["Rest of this month", today, addDays(nextMonth(monthStart(today)), -1)],
            ["Next month", nextMonth(monthStart(today)), addDays(nextMonth(nextMonth(monthStart(today))), -1)],
          ].map(([label, a, b]) => (
            <button key={label} type="button" onClick={() => quick(a, b)} className="h-7 rounded-md border px-2.5 text-[11px]" style={{ borderColor: "var(--hairline)" }}>
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button type="button" onClick={() => setMonth(prevMonth(month))} disabled={month <= monthStart(today)} aria-label="Earlier months" className="h-7 rounded-md border px-2.5 text-[12px] disabled:opacity-40" style={{ borderColor: "var(--hairline)" }}>
            ‹
          </button>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {picking === "to" ? "Now click the last day" : "Click the first day"}
          </span>
          <button type="button" onClick={() => setMonth(nextMonth(month))} aria-label="Later months" className="h-7 rounded-md border px-2.5 text-[12px]" style={{ borderColor: "var(--hairline)" }}>
            ›
          </button>
        </div>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {[month, nextMonth(month)].map((m) => (
            <Month key={m} first={m} today={today} from={from} to={to} weekdays={weekdays} onPick={pick} />
          ))}
        </div>
      </StepSection>

      <StepSection
        {...stepProps(3)}
        title="Which days"
        detail={weekdays.size === 7 ? "every day" : weekdays.size ? [...weekdays].sort().map((d) => DAY_SHORT[d]).join(", ") : "none chosen"}
        action={
          <div className="flex gap-2 text-[11px]">
            {[
              ["Every day", [0, 1, 2, 3, 4, 5, 6]],
              ["Weekdays", [0, 1, 2, 3, 4]],
              ["Weekends", [5, 6]],
            ].map(([label, set]) => (
              <button key={label as string} type="button" onClick={() => setWeekdays(new Set(set as number[]))} className="underline-offset-2 hover:underline" style={{ color: "var(--series-1)" }}>
                {label as string}
              </button>
            ))}
          </div>
        }
      >
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DAY_SHORT.map((d, i) => (
            <label key={d} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] has-[:checked]:border-[var(--series-1)] has-[:checked]:bg-[var(--roster-draft-wash)]" style={{ borderColor: "var(--hairline)" }}>
              <input
                type="checkbox"
                checked={weekdays.has(i)}
                onChange={() =>
                  setWeekdays((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
                className="h-3.5 w-3.5"
              />
              {d}
            </label>
          ))}
        </div>
      </StepSection>

      <StepSection {...stepProps(4)} title="Shift times" detail={timesProblem ?? times.map((t) => `${t.start}–${t.end}`).join(" and ")}>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...(single?.parsed ? [{ label: `${single.name}'s usual ${single.parsed.start}–${single.parsed.end}`, times: [{ start: single.parsed.start, end: single.parsed.end }] }] : []), ...PRESETS].map((p) => (
            <button key={p.label} type="button" onClick={() => setTimes(p.times)} className="h-7 rounded-md border px-2.5 text-[11px]" style={{ borderColor: "var(--hairline)" }}>
              {p.label}
            </button>
          ))}
        </div>
        <ul className="mt-2 space-y-2">
          {times.map((t, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <label className="text-[11px] font-medium">
                From
                <input type="time" value={t.start} onChange={(e) => setTimes((all) => all.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className={`${field} mt-1 h-8 w-28`} style={inputStyle} />
              </label>
              <label className="text-[11px] font-medium">
                To
                <input type="time" value={t.end} onChange={(e) => setTimes((all) => all.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className={`${field} mt-1 h-8 w-28`} style={inputStyle} />
              </label>
              <span className="pb-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                {t.end <= t.start ? "finishes the next morning" : ""}
              </span>
              {times.length > 1 && (
                <button type="button" onClick={() => setTimes((all) => all.filter((_, j) => j !== i))} className="pb-2 text-[11px] underline-offset-2 hover:underline" style={{ color: "var(--text-secondary)" }}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setTimes((all) => [...all, { start: "19:00", end: "07:00" }])} className="mt-2 text-[11px] underline-offset-2 hover:underline" style={{ color: "var(--series-1)" }}>
          + Another shift time on the same days
        </button>
      </StepSection>

      <section className="sticky bottom-0 -mx-5 border-t px-5 pt-3 pb-1" style={{ borderColor: "var(--hairline)", background: "var(--surface-1)" }}>
        {result?.ok ? (
          <div className="space-y-2">
            <Result state={result} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => from && onAssign(from, days)} className="h-9 rounded-md px-4 text-[12px] font-semibold text-white" style={{ background: "var(--series-1)" }}>
                Assign officers to them
              </button>
              <button type="button" onClick={() => setResult(null)} className="h-9 rounded-md border px-3 text-[12px]" style={{ borderColor: "var(--hairline)" }}>
                Create more
              </button>
              <button type="button" onClick={onClose} className="h-9 rounded-md px-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {problem && problemStep ? (
              <p role="status" className="flex min-w-0 flex-1 items-center gap-2 text-[13px] font-medium" style={{ color: "var(--status-serious)" }}>
                <span aria-hidden="true" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: "var(--status-serious)" }}>
                  {problemStep}
                </span>
                <span>
                  {problem}{" "}
                  <button type="button" onClick={() => goTo(problemStep)} className="font-semibold underline underline-offset-2">
                    Go to step {problemStep}
                  </button>
                </span>
              </p>
            ) : (
              <p className="min-w-0 flex-1 text-[13px]">
                <strong>{total} shift{total === 1 ? "" : "s"}</strong>: {chosen.size} post{chosen.size === 1 ? "" : "s"} × {perPost / times.length} day
                {perPost / times.length === 1 ? "" : "s"}
                {times.length > 1 ? ` × ${times.length} times` : ""}. Any already on the rota are skipped.
              </p>
            )}
            <button type="button" disabled={pending} onClick={create} className="h-9 rounded-md px-4 text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--series-1)" }}>
              {pending ? "Creating…" : problem ? "Create shifts" : `Create ${total} shift${total === 1 ? "" : "s"}`}
            </button>
            {result && !result.ok && (
              <div className="w-full">
                <Result state={result} />
              </div>
            )}
          </div>
        )}
      </section>
    </Drawer>
  );
}

/** One month, Monday first. Days in the range are shaded; days it leaves out are shown so. */
function Month({
  first,
  today,
  from,
  to,
  weekdays,
  onPick,
}: {
  first: string;
  today: string;
  from: string | null;
  to: string | null;
  weekdays: Set<number>;
  onPick: (d: string) => void;
}) {
  const [y, m] = first.split("-").map(Number);
  const last = addDays(nextMonth(first), -1);
  const days = datesBetween(first, last);
  const lead = weekday(first);
  return (
    <div>
      <p className="mb-1 text-center text-[12px] font-semibold">
        {MONTHS[m - 1]} {y}
      </p>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px]" style={{ color: "var(--text-muted)" }}>
        {DAY_SHORT.map((d) => (
          <span key={d}>{d.slice(0, 2)}</span>
        ))}
      </div>
      <div className="mt-0.5 grid grid-cols-7 gap-0.5">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {days.map((d) => {
          const inRange = !!from && !!to && d >= from && d <= to;
          const end = d === from || d === to;
          const counted = inRange && weekdays.has(weekday(d));
          const past = d < today;
          return (
            <button
              key={d}
              type="button"
              disabled={past}
              onClick={() => onPick(d)}
              aria-label={`${dayLabel(d)} ${y}${inRange ? (counted ? ", in the range" : ", in the range but not a chosen day") : ""}`}
              aria-pressed={inRange}
              className="tnum h-8 rounded text-[12px] tabular-nums disabled:opacity-30"
              style={{
                background: end ? "var(--series-1)" : counted ? "var(--roster-draft-wash)" : inRange ? "var(--wash-neutral)" : undefined,
                color: end ? "#fff" : inRange && !counted ? "var(--text-muted)" : undefined,
                fontWeight: end || d === today ? 600 : undefined,
                textDecoration: inRange && !counted ? "line-through" : undefined,
                outline: d === today && !end ? "1px solid var(--series-1)" : undefined,
              }}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Step = 1 | 2 | 3 | 4;

/** One numbered step, saying whether it is done — and, when the button was pressed too early, lit up. */
function StepSection({
  step,
  title,
  detail,
  done,
  flagged,
  action,
  sectionRef,
  children,
}: {
  step: Step;
  title: string;
  detail: string;
  done: boolean;
  flagged: boolean;
  action?: ReactNode;
  sectionRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  return (
    <section
      ref={sectionRef}
      aria-labelledby={`cs-step-${step}`}
      className="scroll-mt-4 rounded-lg p-3 transition-colors"
      style={{
        outline: flagged ? "2px solid var(--status-serious)" : "1px solid var(--hairline)",
        background: flagged ? "var(--wash-serious)" : undefined,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`cs-step-${step}`} className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
            style={done ? { background: "var(--status-good)", color: "#fff" } : { background: "var(--wash-neutral)", color: "var(--text-secondary)" }}
          >
            {done ? "✓" : step}
          </span>
          {title}
          <span className="text-[12px] font-normal" style={{ color: "var(--text-muted)" }}>
            · {detail}
          </span>
          {!done && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: "var(--wash-serious)", color: "var(--status-serious)" }}>
              Needed
            </span>
          )}
        </h3>
        {action}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}
