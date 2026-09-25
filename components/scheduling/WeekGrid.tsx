"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "@/components/ui/StatusPill";
import { bulkAssign, bulkPublish, bulkTakeOff, removeOpenShifts } from "@/lib/actions/rota";
import { CreateShifts } from "./CreateShifts";
import { Drawer } from "./Drawer";
import type { ActionResult } from "@/lib/actions/types";
import { evaluateDeployability } from "@/lib/core/deployability";
import {
  ANSWER_LABELS,
  ASK_CHANNELS,
  CHANNEL_LABELS,
  DAY_SHORT,
  MIN_REST_HOURS,
  OFF_REASON_LABELS,
  ROSTER_STATES,
  busiestWeek,
  candidateOrder,
  clashWith,
  dayLabel,
  fromNow,
  hoursProblem,
  hoursWithin,
  leavePending,
  leaveProblem,
  mondayOf,
  planBatch,
  rosterState,
  suggestOfficers,
  shortestRest,
  restProblem,
  ukDate,
  weekday,
  type AskChannel,
  type Busy,
  type PlanItem,
  type RosterState,
} from "@/lib/core/rota";
import type { RotaCoverNeed, RotaOfficer, RotaOpenShift, RotaPost, RotaShift, RotaWeek } from "@/lib/db/rota";
import { formatShortDate, formatTime } from "@/lib/format";
import {
  AskForm,
  CancelShiftForm,
  ChangeHoursForm,
  LeaveUncoveredForm,
  OfficerOffForm,
  RegularOfficerForm,
  Result,
  TakeOffDraftForm,
  WeeklyHoursForm,
  field,
  input,
  inputStyle,
} from "./RotaForms";

// ---------------------------------------------------------------------------
// How each state looks. Colour is never the only signal: every chip also
// carries its state in words.
// ---------------------------------------------------------------------------

interface Look {
  stripe: string;
  bg: string;
  /** Text colour on a solid chip. */
  ink?: string;
  dashed?: boolean;
  strike?: boolean;
  muted?: boolean;
}

const LOOK: Record<RosterState, Look> = {
  cover_needed: { stripe: "var(--status-critical)", bg: "var(--status-critical)", ink: "#fff" },
  open: { stripe: "var(--status-warning)", bg: "var(--wash-warning)", dashed: true },
  draft: { stripe: "var(--series-1)", bg: "var(--roster-draft-wash)", dashed: true },
  blocked: { stripe: "var(--status-critical)", bg: "var(--wash-critical)", dashed: true },
  published: { stripe: "var(--status-good)", bg: "var(--wash-good)" },
  cover: { stripe: "var(--roster-cover)", bg: "var(--roster-cover-wash)" },
  changed: { stripe: "var(--roster-changed)", bg: "var(--roster-changed-wash)" },
  on_shift: { stripe: "var(--roster-live)", bg: "var(--roster-live)", ink: "#fff" },
  done: { stripe: "var(--baseline)", bg: "var(--wash-neutral)", muted: true },
  off: { stripe: "var(--baseline)", bg: "transparent", dashed: true, strike: true, muted: true },
  uncovered: { stripe: "var(--status-serious)", bg: "var(--wash-serious)" },
};

const LABEL = Object.fromEntries(ROSTER_STATES.map((s) => [s.id, s.label])) as Record<RosterState, string>;

/** Each side set on its own: React warns when a shorthand and a side of it change together. */
function edges(look: Look) {
  const colour = look.ink ? look.bg : look.stripe;
  const style = look.dashed ? "dashed" : "solid";
  return {
    background: look.bg,
    borderTopColor: colour,
    borderRightColor: colour,
    borderBottomColor: colour,
    borderLeftColor: look.stripe,
    borderTopStyle: style,
    borderRightStyle: style,
    borderBottomStyle: style,
    borderLeftStyle: "solid",
  } as const;
}

/** The colour a state's label is written in, off the chip. */
const inkOf = (st: RosterState) => (LOOK[st].muted ? "var(--text-muted)" : LOOK[st].stripe);

function Chip({
  state,
  title,
  line1,
  line2,
  note,
  onClick,
  selected,
}: {
  state: RosterState;
  title: string;
  line1: string;
  line2: string;
  note?: string;
  onClick?: () => void;
  /** In planning mode: whether it is in the selection. */
  selected?: boolean;
}) {
  const look = LOOK[state];
  const ink = look.ink ?? (look.muted ? "var(--text-secondary)" : "var(--text-primary)");
  const body = (
    <>
      <span className="block truncate text-[12px] font-semibold" style={{ color: ink, textDecoration: look.strike ? "line-through" : undefined }}>
        {line1}
      </span>
      <span className="tnum block text-[11px] tabular-nums" style={{ color: look.ink ?? "var(--text-secondary)" }}>
        {line2}
      </span>
      <span className="block truncate text-[10px] font-semibold tracking-wide uppercase" style={{ color: look.ink ?? inkOf(state) }}>
        {note ?? LABEL[state]}
      </span>
    </>
  );
  const style = { ...edges(look), outline: selected ? "2px solid var(--series-1)" : undefined, outlineOffset: 1 };
  const cls = "block w-full rounded-md border border-l-4 px-2 py-1 text-left";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={selected === undefined ? undefined : selected}
      className={`${cls} hover:brightness-95`}
      style={style}
    >
      {body}
    </button>
  ) : (
    <div title={title} className={cls} style={style}>
      {body}
    </div>
  );
}

function Swatch({ state }: { state: RosterState }) {
  const look = LOOK[state];
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-5 shrink-0 rounded-sm border border-l-4"
      style={edges(look)}
    />
  );
}

const shortName = (name: string) => {
  const parts = name.split(" ");
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;
};

function shiftState(s: RotaShift, now: Date): RosterState {
  return rosterState(
    {
      state: s.state,
      startsAt: new Date(s.startsAt),
      endsAt: new Date(s.endsAt),
      blocked: !!s.check && !s.check.allowed,
      cameOff: !!s.cameOff,
      isCover: !!s.coverFor,
      amended: s.amended,
    },
    now,
  );
}

function shiftNote(s: RotaShift, state: RosterState): string {
  if (state === "off" && s.cameOff) return `Off · ${OFF_REASON_LABELS[s.cameOff.reason]}`;
  if (state === "cover" && s.coverFor) return `Cover for ${shortName(s.coverFor.name)}`;
  if (state === "on_shift") return s.bookedOn ? "On shift · booked on" : "On shift · not booked on";
  return LABEL[state];
}

type Open = { kind: "post"; postId: string; date: string } | { kind: "cover"; id: string };

/** An open shift that can still be filled: on the rota, nobody on it, not finished. */
interface Gap {
  /** The open shift's id. */
  key: string;
  post: RotaPost;
  date: string;
  start: string;
  end: string;
  startsAt: Date;
  endsAt: Date;
}

/** Planning mode: what has been typed, chosen and checked, shared by every cell. */
interface Planning {
  typed: Record<string, string>;
  /** The page's own check of each typed entry, before anything is sent. */
  preview: Record<string, { name?: string; reason?: string }>;
  /** What the server refused on the last save, by cell. */
  errors: Record<string, string>;
  selected: Set<string>;
  setTyped: (key: string, value: string) => void;
  toggle: (keys: string[]) => void;
  fillRegular: (post: RotaPost) => void;
}

const gapKey = (postId: string, date: string) => `${postId}|${date}`;
const selGap = (openShiftId: string) => `gap:${openShiftId}`;
const selShift = (id: string) => `shift:${id}`;

/** An officer from what was typed: a PIN, a full name, or the start of one name. */
function resolver(officers: RotaOfficer[]) {
  return (text: string): { officer: RotaOfficer } | { error: string } => {
    const t = text.trim().toLowerCase();
    const byPin = officers.find((o) => o.pin && (t === o.pin || t.startsWith(`${o.pin} `)));
    if (byPin) return { officer: byPin };
    const exact = officers.find((o) => o.name.toLowerCase() === t);
    if (exact) return { officer: exact };
    const starts = officers.filter((o) => o.name.toLowerCase().startsWith(t) || o.name.toLowerCase().split(" ").some((w) => w.startsWith(t)));
    if (starts.length === 1) return { officer: starts[0] };
    return { error: starts.length ? `${starts.length} officers match — type more` : "No officer on the books matches" };
  };
}

/** A Monday that is not the first day shown starts a new week: a heavier rule marks it. */
const weekEdge = (d: string, days: string[]) => (d !== days[0] && weekday(d) === 0 ? "2px solid var(--baseline)" : undefined);

// ---------------------------------------------------------------------------
// The roster
// ---------------------------------------------------------------------------

/**
 * The week, in colour. Two ways to read it: by post, which is how Control
 * fills it, and by officer, which is how an officer reads it — "where am I
 * this week?" — with each officer's hours against their agreed week.
 */
export function WeekGrid({
  week,
  today,
  now: nowIso,
  buildDenied,
  changeDenied,
  hoursDenied,
  openCover,
  openPost: openAt,
}: {
  week: RotaWeek;
  today: string;
  now: string;
  buildDenied: string | null;
  changeDenied: string | null;
  hoursDenied: string | null;
  openCover?: string | null;
  /** A post and day to open on arrival — from an alert, a task or the uncovered list. */
  openPost?: { postId: string; date: string } | null;
}) {
  // The server's clock, so the page and the browser agree on what is live.
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [view, setView] = useState<"post" | "officer">("post");
  const [open, setOpen] = useState<Open | null>(
    openCover ? { kind: "cover", id: openCover } : openAt ? { kind: "post", postId: openAt.postId, date: openAt.date } : null,
  );

  // Which view to read by is a per-person convenience, kept in this browser.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("rota-view");
      if (saved === "officer" || saved === "post") setView(saved);
    } catch {}
  }, []);
  const choose = (v: "post" | "officer") => {
    setView(v);
    try {
      window.localStorage.setItem("rota-view", v);
    } catch {}
  };

  useEffect(() => {
    if (openCover) setOpen({ kind: "cover", id: openCover });
  }, [openCover]);
  const openPostKey = openAt ? `${openAt.postId}|${openAt.date}` : null;
  useEffect(() => {
    if (openPostKey) {
      const [postId, date] = openPostKey.split("|");
      setOpen({ kind: "post", postId, date });
      setView("post");
    }
  }, [openPostKey]);

  const close = useCallback(() => {
    setOpen(null);
    // A ?cover= link has done its job once the panel is closed.
    const url = new URL(window.location.href);
    if (url.searchParams.has("cover") || url.searchParams.has("post")) {
      url.searchParams.delete("cover");
      url.searchParams.delete("post");
      url.searchParams.delete("day");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  const byCell = useMemo(() => {
    const m = new Map<string, RotaShift[]>();
    for (const s of week.shifts) {
      const k = `${s.postId}|${s.date}`;
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  }, [week.shifts]);

  const needsByCell = useMemo(() => {
    const m = new Map<string, RotaCoverNeed[]>();
    for (const c of week.coverNeeds.filter((c) => c.status !== "covered")) {
      const k = `${c.postId}|${c.date}`;
      m.set(k, [...(m.get(k) ?? []), c]);
    }
    return m;
  }, [week.coverNeeds]);

  // What the legend counts: every chip the grid draws.
  const counts = useMemo(() => {
    const c = Object.fromEntries(ROSTER_STATES.map((s) => [s.id, 0])) as Record<RosterState, number>;
    for (const s of week.shifts) c[shiftState(s, now)]++;
    for (const n of week.coverNeeds) {
      if (n.status === "open") c.cover_needed++;
      if (n.status === "closed") c.uncovered++;
    }
    return c;
  }, [week, now]);

  const keyRef = useRef<HTMLDivElement>(null);
  const [keyHeight, setKeyHeight] = useState(52);
  useEffect(() => {
    const el = keyRef.current;
    if (!el) return;
    const measure = () => setKeyHeight(el.offsetHeight);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const openPost = open?.kind === "post" ? week.posts.find((p) => p.id === open.postId) : undefined;
  const openNeed = open?.kind === "cover" ? week.coverNeeds.find((c) => c.id === open.id) : undefined;

  // ---- Planning in bulk --------------------------------------------------
  const [planning, setPlanning] = useState(false);
  const [typed, setTypedAll] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<AskChannel>("phone");
  const [assignTo, setAssignTo] = useState("");
  const [bulkResult, setBulkResult] = useState<ActionResult | null>(null);
  const [saving, startSaving] = useTransition();
  const resolve = useMemo(() => resolver(week.officers), [week.officers]);

  const gaps = useMemo(() => {
    const postOf = new Map(week.posts.map((p) => [p.id, p]));
    return week.openShifts
      .filter((o) => new Date(o.endsAt) > now && postOf.has(o.postId))
      .map((o): Gap => ({ key: o.id, post: postOf.get(o.postId)!, date: o.date, start: o.start, end: o.end, startsAt: new Date(o.startsAt), endsAt: new Date(o.endsAt) }));
  }, [week, now]);
  const gapOf = useMemo(() => new Map(gaps.map((g) => [g.key, g])), [gaps]);
  // Every open shift, finished ones too: a finished one nobody filled reads "Not covered".
  const openByCell = useMemo(() => {
    const m = new Map<string, RotaOpenShift[]>();
    for (const o of week.openShifts) m.set(gapKey(o.postId, o.date), [...(m.get(gapKey(o.postId, o.date)) ?? []), o]);
    return m;
  }, [week.openShifts]);
  const [creating, setCreating] = useState<{ postId?: string; date?: string } | null>(null);
  const closeCreate = useCallback(() => setCreating(null), []);
  const router = useRouter();
  // New open shifts are read by post: that is where they show. And if they
  // start outside the weeks on screen, the roster moves to them, so closing
  // the panel never lands on a roster that looks unchanged.
  const showCreated = (from: string, days: number) => {
    setView("post");
    if (!week.days.includes(from)) router.push(`/scheduling?week=${mondayOf(from)}${days > 7 ? "&span=4" : ""}`);
  };
  const gapsByCell = useMemo(() => {
    const m = new Map<string, Gap[]>();
    for (const g of gaps) m.set(gapKey(g.post.id, g.date), [...(m.get(gapKey(g.post.id, g.date)) ?? []), g]);
    return m;
  }, [gaps]);

  // Who is free: the same checks the server makes, shared by the preview,
  // the suggestions and the "who is free" list.
  const availability = useMemo(() => {
    const officerOf = new Map(week.officers.map((o) => [o.id, o]));
    const postOf = new Map(week.posts.map((p) => [p.id, p]));
    const leaveOf = new Map(week.officers.map((o) => [o.id, o.leave.map((l) => ({ startsAt: new Date(l.startsAt), endsAt: new Date(l.endsAt), approved: l.approved }))]));
    const busyByPerson = new Map(week.officers.map((o) => [o.id, o.busy.map((b) => ({ startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt), label: b.label }))]));
    const busyByPost = new Map<string, Busy[]>();
    for (const x of week.shifts.filter((x) => !x.cameOff && x.state !== "cancelled")) {
      busyByPost.set(x.postId, [...(busyByPost.get(x.postId) ?? []), { startsAt: new Date(x.startsAt), endsAt: new Date(x.endsAt) }]);
    }
    return {
      busyByPerson,
      busyByPost,
      weeklyHoursOf: (id: string) => officerOf.get(id)?.weeklyHours ?? 48,
      blockerFor: (item: PlanItem) => {
        const o = officerOf.get(item.personId);
        if (!o) return "Only officers on the books can be put on the rota.";
        const away = leaveProblem(leaveOf.get(item.personId) ?? [], item);
        if (away) return away;
        const post = postOf.get(item.postId);
        if (post && o.excludedSites.includes(post.siteId)) return `Kept off ${post.siteName}.`;
        const d = evaluateDeployability({ ...o.input, postRequiresSiaLicence: post?.requiresSiaLicence ?? true }, item.endsAt);
        return d.deployable ? null : d.blockers[0].label;
      },
      preference: (personId: string, postId: string) => {
        const p = postOf.get(postId);
        const o = officerOf.get(personId);
        return (
          (p?.regular?.id === personId ? 100 : 0) +
          (p?.allocated.some((a) => a.personId === personId) ? 50 : 0) +
          // Offered for a shift on this post, or said they are free: asked early.
          (week.openShifts.some((x) => x.postId === postId && x.offeredBy.includes(personId)) ? 40 : 0) +
          (o && Object.values(o.said).includes("available") ? 5 : 0) +
          (o?.shiftsHere[postId] ?? 0)
        );
      },
    };
  }, [week]);

  // The same checks the server makes, run as the PINs are typed.
  const preview = useMemo(() => {
    const out: Planning["preview"] = {};
    const items: PlanItem[] = [];
    for (const [key, text] of Object.entries(typed)) {
      const gap = gapOf.get(key);
      if (!gap || !text.trim()) continue;
      const r = resolve(text);
      if ("error" in r) {
        out[key] = { reason: r.error };
        continue;
      }
      out[key] = { name: r.officer.name };
      items.push({ key, postId: gap.post.id, personId: r.officer.id, ...fromNow({ startsAt: gap.startsAt, endsAt: gap.endsAt }, now), label: `${gap.post.name}, ${dayLabel(gap.date)}` });
    }
    const plan = planBatch(items, {
      busyByPerson: availability.busyByPerson,
      busyByPost: availability.busyByPost,
      weeklyHoursOf: availability.weeklyHoursOf,
      blockerFor: availability.blockerFor,
      now,
    });
    for (const r of plan.refused) out[r.item.key] = { ...out[r.item.key], reason: r.reason };
    return out;
  }, [typed, gapOf, resolve, week, now, availability]);

  const plan: Planning | null = planning
    ? {
        typed,
        preview,
        errors,
        selected,
        setTyped: (key, value) => {
          setTypedAll((t) => ({ ...t, [key]: value }));
          setErrors((e) => {
            const { [key]: _, ...rest } = e;
            return rest;
          });
        },
        toggle: (keys) =>
          setSelected((prev) => {
            const next = new Set(prev);
            const allOn = keys.every((k) => next.has(k));
            keys.forEach((k) => (allOn ? next.delete(k) : next.add(k)));
            return next;
          }),
        fillRegular: (post) => {
          if (!post.regular) return;
          const reg = week.officers.find((o) => o.id === post.regular!.id);
          const token = reg?.pin ? `${reg.pin} ${reg.name}` : post.regular.name;
          setTypedAll((t) => {
            const next = { ...t };
            gaps.filter((g) => g.post.id === post.id && !next[g.key]?.trim()).forEach((g) => (next[g.key] = token));
            return next;
          });
        },
      }
    : null;

  const ready = Object.keys(preview).filter((k) => preview[k].name && !preview[k].reason);
  const problems = Object.keys(preview).filter((k) => preview[k].reason);
  const selectedGaps = [...selected].filter((k) => k.startsWith("gap:")).map((k) => k.slice(4)).filter((k) => gapOf.has(k));
  const selectedDrafts = [...selected]
    .filter((k) => k.startsWith("shift:"))
    .map((k) => k.slice(6))
    .filter((id) => week.shifts.some((x) => x.id === id && x.state === "draft"));

  function send(entries: { key: string; openShiftId: string; personId: string }[]) {
    startSaving(async () => {
      const r = await bulkAssign({ entries, channel });
      setBulkResult(r);
      const refused = Object.fromEntries(r.refused.map((x) => [x.key, x.reason]));
      setErrors(refused);
      const sent = new Set(entries.map((e) => e.key));
      setTypedAll((t) => Object.fromEntries(Object.entries(t).filter(([k]) => !sent.has(k) || refused[k])));
      setSelected((prev) => new Set([...prev].filter((k) => !(k.startsWith("gap:") && sent.has(k.slice(4)) && !refused[k.slice(4)]))));
    });
  }
  const saveTyped = () =>
    send(
      ready.map((key) => ({ key, openShiftId: key, personId: (resolve(typed[key]) as { officer: RotaOfficer }).officer.id })),
    );
  const assignSelected = () => {
    const r = resolve(assignTo);
    if ("error" in r) {
      setBulkResult({ ok: false, message: `Assign to whom? ${r.error}.` });
      return;
    }
    send(selectedGaps.map((key) => ({ key, openShiftId: key, personId: r.officer.id })));
  };
  // Suggest: the ticked open shifts, or every one on screen, filled with
  // whoever is free — typed in for Control to look over, never saved unseen.
  const suggest = () => {
    const pool = selectedGaps.length ? selectedGaps.map((k) => gapOf.get(k)!) : gaps;
    const open = pool.filter((g) => !typed[g.key]?.trim());
    // What is already typed counts as taken, so suggestions do not collide with it.
    const busyByPerson = new Map([...availability.busyByPerson].map(([k, v]) => [k, [...v]]));
    const busyByPost = new Map([...availability.busyByPost].map(([k, v]) => [k, [...v]]));
    for (const [key, text] of Object.entries(typed)) {
      const g = gapOf.get(key);
      const r = g && text.trim() ? resolve(text) : null;
      if (!g || !r || "error" in r) continue;
      busyByPerson.set(r.officer.id, [...(busyByPerson.get(r.officer.id) ?? []), { startsAt: g.startsAt, endsAt: g.endsAt, label: g.post.name }]);
      busyByPost.set(g.post.id, [...(busyByPost.get(g.post.id) ?? []), { startsAt: g.startsAt, endsAt: g.endsAt }]);
    }
    const picks = suggestOfficers(
      open.map((g) => ({ key: g.key, postId: g.post.id, ...fromNow({ startsAt: g.startsAt, endsAt: g.endsAt }, now), label: `${g.post.name}, ${dayLabel(g.date)}` })),
      {
        officerIds: week.officers.map((o) => o.id),
        busyByPerson,
        busyByPost,
        weeklyHoursOf: availability.weeklyHoursOf,
        // Somebody who said in their portal they are not free that day is not
        // suggested; Control can still type them in after a call.
        blockerFor: (item) =>
          availability.blockerFor(item) ?? (week.officers.find((o) => o.id === item.personId)?.said[ukDate(item.startsAt)] === "unavailable" ? "Said they are not free that day." : null),
        preference: availability.preference,
        now,
      },
    );
    const officerOf = new Map(week.officers.map((o) => [o.id, o]));
    setTypedAll((t) => {
      const next = { ...t };
      for (const [key, id] of picks) {
        const o = officerOf.get(id)!;
        next[key] = o.pin ? `${o.pin} ${o.name}` : o.name;
      }
      return next;
    });
    setBulkResult({
      ok: picks.size > 0,
      message: picks.size
        ? `Suggested officers for ${picks.size} of ${open.length} open shift${open.length === 1 ? "" : "s"}${picks.size < open.length ? ` — nobody free for the other ${open.length - picks.size}` : ""}. Look them over, change any, then save.`
        : "Nobody is free for those open shifts.",
    });
  };

  // Who is free for the ticked open shifts, and for how many of them.
  const free = useMemo(() => {
    if (selectedGaps.length === 0) return [];
    const ticked = selectedGaps.map((k) => gapOf.get(k)!).filter(Boolean);
    return week.officers
      .map((officer) => {
        const plan = planBatch(
          ticked.map((g) => ({ key: g.key, postId: g.post.id, personId: officer.id, ...fromNow({ startsAt: g.startsAt, endsAt: g.endsAt }, now) })),
          { busyByPerson: availability.busyByPerson, busyByPost: availability.busyByPost, weeklyHoursOf: availability.weeklyHoursOf, blockerFor: availability.blockerFor, now },
        );
        return { officer, can: plan.accepted.length };
      })
      .sort((a, b) => b.can - a.can || a.officer.name.localeCompare(b.officer.name));
    // selectedGaps is worked out from the selection and the open shifts, so those are what it follows.
  }, [selected, gapOf, week.officers, availability, now]);

  const removeSelected = () =>
    startSaving(async () => {
      setBulkResult(await removeOpenShifts(selectedGaps));
      setSelected(new Set());
    });

  const publishSelected = () =>
    startSaving(async () => {
      setBulkResult(await bulkPublish(selectedDrafts));
      setSelected(new Set());
    });
  const takeOffSelected = () =>
    startSaving(async () => {
      setBulkResult(await bulkTakeOff(selectedDrafts));
      setSelected(new Set());
    });
  const selectDay = (d: string) =>
    plan?.toggle([
      ...gaps.filter((g) => g.date === d).map((g) => selGap(g.key)),
      ...week.shifts.filter((x) => x.date === d && x.state === "draft").map((x) => selShift(x.id)),
    ]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div role="group" aria-label="Read the roster" className="inline-flex rounded-md border p-0.5" style={{ borderColor: "var(--hairline)" }}>
          {(["post", "officer"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => choose(v)}
              className="h-8 rounded px-3 text-[12px] font-medium"
              style={view === v ? { background: "var(--text-primary)", color: "var(--page)" } : { color: "var(--text-secondary)" }}
            >
              {v === "post" ? "By post" : "By officer"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {!buildDenied && (
            <button
              type="button"
              onClick={() => setCreating({})}
              className="h-8 rounded-md px-3 text-[12px] font-semibold text-white"
              style={{ background: "var(--series-1)" }}
            >
              Create shifts
            </button>
          )}
          {!buildDenied && (
            <button
              type="button"
              aria-pressed={planning}
              onClick={() => {
                setPlanning((v) => !v);
                setView("post");
                setBulkResult(null);
              }}
              className="h-8 rounded-md border px-3 text-[12px] font-semibold"
              style={planning ? { background: "var(--series-1)", color: "#fff", borderColor: "var(--series-1)" } : { borderColor: "var(--series-1)", color: "var(--accent-text)", background: "var(--surface-1)" }}
            >
              {planning ? "Done assigning" : "Assign in bulk"}
            </button>
          )}
          <button type="button" onClick={() => window.print()} className="h-8 rounded-md border px-3 text-[12px]" style={{ borderColor: "var(--hairline)", background: "var(--surface-1)" }}>
            Print {week.weeks === 1 ? "this week" : "these weeks"}
          </button>
        </div>
      </div>

      {planning && (
        <p className="mb-3 rounded-md px-3 py-2 text-[12px] leading-relaxed print:hidden" style={{ background: "var(--roster-draft-wash)" }}>
          <strong>Assigning in bulk.</strong> Type a PIN or name into any open shift, let <em>Suggest officers</em> fill them with whoever is
          free, or tick shifts and pick from who is free for all of them. Each entry is checked as you type — cleared to deploy, not on
          leave, no clash, inside their weekly hours — and saved together as drafts. Tick drafts to publish or take them off together.
        </p>
      )}
      <datalist id="rota-officers">
        {week.officers.map((o) => (
          <option key={o.id} value={o.pin ? `${o.pin} ${o.name}` : o.name} />
        ))}
      </datalist>

      {/* The roster scrolls in its own frame, like a spreadsheet with frozen panes:
          the colour key and the day row stay at the top as the posts scroll up
          under them, and the post names stay on the left as the days scroll across. */}
      {/* isolate: the frozen rows' layering stays inside this frame, so the whole frame
          scrolls under the portal's top bar instead of its key and day row passing over it. */}
      <div
        className="relative isolate max-h-[calc(100dvh-6rem)] overflow-auto rounded-md print:max-h-none print:overflow-visible"
        style={{
          ["--key-h" as string]: `${keyHeight}px`,
          // Tabbing through the PIN boxes never lands one under the frozen rows or the post column.
          scrollPaddingTop: `${keyHeight + 44}px`,
          scrollPaddingLeft: "15.5rem",
        }}
      >
      <div ref={keyRef} className="sticky top-0 left-0 z-40 pb-3" style={{ background: "var(--surface-1)" }}>
      <ul aria-label="What the colours mean" className="flex flex-wrap gap-x-4 gap-y-2">
        {ROSTER_STATES.map((s) => (
          <li key={s.id} className="flex items-center gap-1.5 text-[11px]" title={s.meaning} style={{ opacity: (s.id === "open" ? gaps.length : counts[s.id]) ? 1 : 0.5 }}>
            <Swatch state={s.id} />
            <span className="font-medium">{s.label}</span>
            <span className="tnum tabular-nums" style={{ color: "var(--text-muted)" }}>
              {s.id === "open" ? gaps.length : counts[s.id]}
            </span>
          </li>
        ))}
      </ul>
      </div>

      {view === "post" ? (
        <ByPost
          week={week}
          today={today}
          now={now}
          byCell={byCell}
          needsByCell={needsByCell}
          buildDenied={buildDenied}
          onOpen={setOpen}
          plan={plan}
          gapOf={gapOf}
          openByCell={openByCell}
          onSelectDay={selectDay}
          onCreate={(post, date) => setCreating({ postId: post.id, date })}
        />
      ) : (
        <ByOfficer week={week} today={today} now={now} onOpen={setOpen} />
      )}
      </div>

      {planning && (
        <div className="sticky bottom-0 z-20 mt-3 -mx-5 border-t px-5 py-3 shadow-[0_-4px_12px_rgb(0_0_0/0.06)] print:hidden" style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-1.5 text-[12px]">
              Asked by
              <select value={channel} onChange={(e) => setChannel(e.target.value as AskChannel)} className={`${field} h-8 w-28`} style={inputStyle}>
                {ASK_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNEL_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button type="button" disabled={saving || ready.length === 0} onClick={saveTyped} className="h-8 rounded-md px-3 text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--series-1)" }}>
                {saving ? "Saving…" : `Save ${ready.length} typed`}
              </button>
              {problems.length > 0 && (
                <span className="text-[12px]" style={{ color: "var(--critical-text)" }}>
                  {problems.length} with a problem
                </span>
              )}
              <button
                type="button"
                onClick={suggest}
                disabled={gaps.length === 0}
                className="h-8 rounded-md border px-3 text-[12px] font-medium disabled:opacity-50"
                style={{ borderColor: "var(--series-1)", color: "var(--accent-text)" }}
                title="Types a free officer into each open shift — the ticked ones, or all of them — for you to look over and save"
              >
                Suggest officers
              </button>
              <button
                type="button"
                onClick={() => week.posts.filter((p) => p.regular).forEach((p) => plan!.fillRegular(p))}
                disabled={!week.posts.some((p) => p.regular)}
                className="h-8 rounded-md border px-3 text-[12px] disabled:opacity-50"
                style={{ borderColor: "var(--hairline)" }}
                title="Types each post's regular officer into its empty open shifts, ready to check and save"
              >
                Fill regular officers
              </button>
            </div>
            <span className="hidden h-6 border-l sm:block" style={{ borderColor: "var(--hairline)" }} />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium">
                {selectedGaps.length} open shift{selectedGaps.length === 1 ? "" : "s"} · {selectedDrafts.length} draft{selectedDrafts.length === 1 ? "" : "s"} ticked
              </span>
              <button type="button" onClick={() => plan!.toggle(gaps.map((g) => selGap(g.key)))} className="h-8 rounded-md border px-2.5 text-[12px]" style={{ borderColor: "var(--hairline)" }}>
                All open shifts
              </button>
              <select
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value)}
                disabled={selectedGaps.length === 0}
                aria-label="Who is free for the ticked open shifts"
                className={`${field} h-8 w-64`}
                style={inputStyle}
              >
                <option value="">{selectedGaps.length ? `Who is free for these ${selectedGaps.length}…` : "Tick open shifts first"}</option>
                {free.map((f) => (
                  <option key={f.officer.id} value={f.officer.pin ? `${f.officer.pin} ${f.officer.name}` : f.officer.name} disabled={f.can === 0}>
                    {f.officer.name} — {f.can === selectedGaps.length ? `free for all ${f.can}` : `free for ${f.can} of ${selectedGaps.length}`}
                  </option>
                ))}
              </select>
              <button type="button" disabled={saving || selectedGaps.length === 0 || !assignTo.trim()} onClick={assignSelected} className="h-8 rounded-md border px-3 text-[12px] font-medium disabled:opacity-50" style={{ borderColor: "var(--series-1)", color: "var(--accent-text)" }}>
                Give them the ticked shifts
              </button>
              <button type="button" disabled={saving || selectedGaps.length === 0} onClick={removeSelected} className="h-8 rounded-md border px-3 text-[12px] disabled:opacity-50" style={{ borderColor: "var(--hairline)" }} title="Take ticked open shifts off the rota — created by mistake, or not needed">
                Remove ticked open shifts
              </button>
              <button type="button" disabled={saving || selectedDrafts.length === 0} onClick={publishSelected} className="h-8 rounded-md border px-3 text-[12px] font-medium disabled:opacity-50" style={{ borderColor: "var(--status-good)", color: "var(--good-text)" }}>
                Publish ticked drafts
              </button>
              <button type="button" disabled={saving || selectedDrafts.length === 0} onClick={takeOffSelected} className="h-8 rounded-md border px-3 text-[12px] disabled:opacity-50" style={{ borderColor: "var(--hairline)" }}>
                Take off ticked drafts
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelected(new Set());
                  setTypedAll({});
                  setErrors({});
                  setBulkResult(null);
                }}
                className="h-8 rounded-md px-2 text-[12px]"
                style={{ color: "var(--text-secondary)" }}
              >
                Clear
              </button>
            </div>
          </div>
          {bulkResult && <Result state={bulkResult} />}
        </div>
      )}

      {creating && (
        <CreateShifts
          posts={week.posts}
          today={today}
          initialPostId={creating.postId}
          initialDate={creating.date}
          onClose={closeCreate}
          onAssign={(from, days) => {
            // Straight to the shifts just made, ready to put officers on them.
            setCreating(null);
            setPlanning(true);
            showCreated(from, days);
          }}
          onCreated={showCreated}
        />
      )}

      {openPost && open?.kind === "post" && (
        <FillPanel
          key={`${open.postId}|${open.date}`}
          post={openPost}
          date={open.date}
          week={week}
          today={today}
          now={now}
          buildDenied={buildDenied}
          changeDenied={changeDenied}
          hoursDenied={hoursDenied}
          onClose={close}
          onOpenCover={(id) => setOpen({ kind: "cover", id })}
          onCreate={() => setCreating({ postId: openPost.id, date: open.date })}
        />
      )}
      {openNeed && (
        <CoverPanel
          key={openNeed.id}
          need={openNeed}
          post={week.posts.find((p) => p.id === openNeed.postId)!}
          week={week}
          now={now}
          buildDenied={buildDenied}
          changeDenied={changeDenied}
          hoursDenied={hoursDenied}
          onClose={close}
        />
      )}
    </>
  );
}

const pinned = "sticky left-0 z-10";

function DayHeads({ days, today, first, onSelectDay }: { days: string[]; today: string; first: string; onSelectDay?: (d: string) => void }) {
  return (
    <thead>
      <tr>
        <th
          className="sticky left-0 z-30 w-36 pb-2 text-left text-[11px] font-medium sm:w-60 print:static"
          style={{ top: "var(--key-h)", color: "var(--text-muted)", background: "var(--surface-1)", boxShadow: "inset 0 -1px 0 var(--hairline)" }}
        >
          {first}
        </th>
        {days.map((d) => (
          <th
            key={d}
            scope="col"
            className="sticky z-20 px-1.5 pt-1 pb-2 text-left text-[12px] font-semibold print:static"
            style={{
              top: "var(--key-h)",
              color: d === today ? "var(--accent-text)" : d < today ? "var(--text-muted)" : "var(--text-secondary)",
              // Solid underneath, so the rows scrolling up under the day row do not show through.
              background: d === today ? "linear-gradient(var(--roster-draft-wash), var(--roster-draft-wash)), var(--surface-1)" : "var(--surface-1)",
              borderLeft: weekEdge(d, days),
              boxShadow: "inset 0 -1px 0 var(--hairline)",
            }}
          >
            <span className="flex items-center justify-between gap-1">
              <span>
                {DAY_SHORT[weekday(d)]} {Number(d.slice(8))}
                {weekday(d) === 0 || d === days[0] ? <span className="ml-1 text-[11px] font-normal">{dayLabel(d).split(" ")[2]}</span> : null}
                {d === today && <span className="ml-1 text-[11px] font-normal">today</span>}
              </span>
              {onSelectDay && d >= today && (
                <button type="button" onClick={() => onSelectDay(d)} className="text-[10px] font-medium underline-offset-2 hover:underline print:hidden" style={{ color: "var(--accent-text)" }} aria-label={`Tick every gap and draft on ${dayLabel(d)}`}>
                  tick
                </button>
              )}
            </span>
          </th>
        ))}
      </tr>
    </thead>
  );
}

const dayCellStyle = (d: string, today: string, days: string[]) => ({
  background: d === today ? "var(--roster-draft-wash)" : undefined,
  opacity: d < today ? 0.7 : 1,
  borderLeft: weekEdge(d, days),
});

/** A week reads at a comfortable width; four weeks scroll, with the post pinned. */
const tableWidth = (days: number) => (days > 7 ? `${16 + days * 7}rem` : "64rem");

function ByPost({
  week,
  today,
  now,
  byCell,
  needsByCell,
  buildDenied,
  onOpen,
  plan,
  gapOf,
  openByCell,
  onSelectDay,
  onCreate,
}: {
  week: RotaWeek;
  today: string;
  now: Date;
  byCell: Map<string, RotaShift[]>;
  needsByCell: Map<string, RotaCoverNeed[]>;
  buildDenied: string | null;
  onOpen: (o: Open) => void;
  plan: Planning | null;
  gapOf: Map<string, Gap>;
  openByCell: Map<string, RotaOpenShift[]>;
  onSelectDay: (d: string) => void;
  onCreate: (post: RotaPost, date: string) => void;
}) {
  const groups = useMemo(() => {
    const g: { site: string; client: string; posts: RotaPost[] }[] = [];
    for (const p of week.posts) {
      const last = g[g.length - 1];
      if (last && last.site === p.siteName) last.posts.push(p);
      else g.push({ site: p.siteName, client: p.clientName, posts: [p] });
    }
    return g;
  }, [week.posts]);

  if (week.posts.length === 0) {
    return (
      <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
        No active posts. Posts come from the sites Control covers.
      </p>
    );
  }

  return (
    <div>
      <table className="w-full table-fixed border-collapse text-[12px]" style={{ minWidth: tableWidth(week.days.length) }}>
        <DayHeads days={week.days} today={today} first="Post" onSelectDay={plan ? onSelectDay : undefined} />
        <tbody>
          {groups.map((g) => (
            <SiteGroup
              key={g.site}
              group={g}
              week={week}
              today={today}
              now={now}
              byCell={byCell}
              needsByCell={needsByCell}
              buildDenied={buildDenied}
              onOpen={onOpen}
              onCreate={onCreate}
              plan={plan}
              gapOf={gapOf}
              openByCell={openByCell}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A gap in planning mode: tick it, or type the officer straight in. */
function GapCell({ gap, plan, underway }: { gap: Gap; plan: Planning; underway: boolean }) {
  const ticked = plan.selected.has(selGap(gap.key));
  const value = plan.typed[gap.key] ?? "";
  const check = plan.preview[gap.key];
  const refused = check?.reason ?? plan.errors[gap.key];
  return (
    <div
      className="rounded-md border border-dashed p-1"
      style={{ borderColor: ticked ? "var(--series-1)" : refused ? "var(--status-critical)" : "var(--status-warning)", background: "var(--wash-warning)", outline: ticked ? "2px solid var(--series-1)" : undefined, outlineOffset: 1 }}
    >
      <label className="flex items-center gap-1 text-[10px] font-medium">
        <input type="checkbox" checked={ticked} onChange={() => plan.toggle([selGap(gap.key)])} className="h-3 w-3" aria-label={`Tick ${gap.post.name}, ${dayLabel(gap.date)}`} />
        <span className="tnum tabular-nums" style={{ color: underway ? "var(--critical-text)" : "var(--text-secondary)" }}>
          {underway ? "Now" : `${gap.start}–${gap.end}`}
        </span>
      </label>
      <input
        list="rota-officers"
        value={value}
        onChange={(e) => plan.setTyped(gap.key, e.target.value)}
        placeholder="PIN or name"
        aria-label={`Officer for ${gap.post.name}, ${dayLabel(gap.date)}`}
        className="mt-0.5 h-7 w-full rounded border px-1.5 text-[11px] outline-none focus:border-[var(--series-1)]"
        style={{ background: "var(--surface-1)", borderColor: refused ? "var(--status-critical)" : "var(--hairline)" }}
      />
      {refused ? (
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight" style={{ color: "var(--critical-text)" }} title={refused}>
          {refused}
        </p>
      ) : check?.name ? (
        <p className="mt-0.5 truncate text-[10px] font-semibold" style={{ color: "var(--good-text)" }} title={check.name}>
          ✓ {shortName(check.name)}
        </p>
      ) : null}
    </div>
  );
}

function SiteGroup({
  group,
  week,
  today,
  now,
  byCell,
  needsByCell,
  buildDenied,
  onOpen,
  onCreate,
  plan,
  gapOf,
  openByCell,
}: {
  group: { site: string; client: string; posts: RotaPost[] };
  week: RotaWeek;
  today: string;
  now: Date;
  byCell: Map<string, RotaShift[]>;
  needsByCell: Map<string, RotaCoverNeed[]>;
  buildDenied: string | null;
  onOpen: (o: Open) => void;
  onCreate: (post: RotaPost, date: string) => void;
  plan: Planning | null;
  gapOf: Map<string, Gap>;
  openByCell: Map<string, RotaOpenShift[]>;
}) {
  return (
    <>
      <tr>
        <th colSpan={week.days.length + 1} scope="rowgroup" className="pt-5 pb-1.5 text-left text-[11px] font-semibold tracking-wide uppercase" style={{ color: "var(--text-secondary)" }}>
          <span className="sticky left-0">
            {group.site}
            <span className="ml-2 font-normal tracking-normal normal-case" style={{ color: "var(--text-muted)" }}>
              {group.client}
            </span>
          </span>
        </th>
      </tr>
      {group.posts.map((p) => {
        const filled = week.shifts.filter((x) => x.postId === p.id && !x.cameOff).length;
        const open = week.openShifts.filter((o) => o.postId === p.id).length;
        const rowKeys = [
          ...week.openShifts.filter((o) => o.postId === p.id && gapOf.has(o.id)).map((o) => selGap(o.id)),
          ...week.shifts.filter((x) => x.postId === p.id && x.state === "draft").map((x) => selShift(x.id)),
        ];
        return (
          <tr key={p.id} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
            <th scope="row" className={`${pinned} py-2 pr-3 text-left font-normal`} style={{ background: "var(--surface-1)" }}>
              <p className="text-[13px] font-semibold">{p.name}</p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {p.siteName.split(" — ")[0]}
                {p.loneWorking && " · lone working"}
              </p>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {filled + open > 0 ? (
                  <span className="font-medium" style={{ color: open === 0 ? "var(--good-text)" : "var(--text-secondary)" }}>
                    {filled} of {filled + open} filled
                  </span>
                ) : (
                  <span style={{ color: "var(--text-muted)" }}>No shifts yet</span>
                )}
                {p.regular && <span> · Regular: {shortName(p.regular.name)}</span>}
              </p>
              {plan && (
                <div className="mt-1.5 flex flex-wrap gap-1 print:hidden">
                  <button type="button" disabled={rowKeys.length === 0} onClick={() => plan.toggle(rowKeys)} className="h-6 rounded border px-1.5 text-[10px] font-medium disabled:opacity-40" style={{ borderColor: "var(--hairline)" }}>
                    Tick row
                  </button>
                  {p.regular && (
                    <button type="button" onClick={() => plan.fillRegular(p)} className="h-6 rounded border px-1.5 text-[10px] font-medium" style={{ borderColor: "var(--hairline)" }} title={`Type ${p.regular.name} into every empty open shift on this post`}>
                      Fill with {p.regular.name.split(" ")[0]}
                    </button>
                  )}
                </div>
              )}
            </th>
            {week.days.map((d) => {
              const key = gapKey(p.id, d);
              const shifts = byCell.get(key) ?? [];
              const needs = needsByCell.get(key) ?? [];
              const openHere = openByCell.get(key) ?? [];
              const openDay = () => onOpen({ kind: "post", postId: p.id, date: d });
              return (
                <td key={d} className="p-1" style={dayCellStyle(d, today, week.days)}>
                  <div className="space-y-1">
                    {needs.map((n) => (
                      <Chip
                        key={n.id}
                        state={n.status === "open" ? "cover_needed" : "uncovered"}
                        title={`${p.name}, ${dayLabel(d)}: ${n.status === "open" ? "cover needed" : "left uncovered"} ${n.start}–${n.end}. ${n.fromName} off, ${OFF_REASON_LABELS[n.reason].toLowerCase()}`}
                        line1={n.status === "open" ? "Cover needed" : "Left uncovered"}
                        line2={`${n.start}–${n.end}`}
                        note={`${shortName(n.fromName)} · ${OFF_REASON_LABELS[n.reason]}`}
                        onClick={() => onOpen({ kind: "cover", id: n.id })}
                      />
                    ))}
                    {shifts.map((s) => {
                      const st = shiftState(s, now);
                      const pickable = !!plan && s.state === "draft";
                      return (
                        <Chip
                          key={s.id}
                          state={st}
                          title={`${s.personName}, ${p.name}, ${dayLabel(d)} ${s.start}–${s.end}: ${shiftNote(s, st)}${st === "blocked" ? ` — ${s.check!.blockers[0]}` : ""}`}
                          line1={shortName(s.personName)}
                          line2={`${s.start}–${s.end}`}
                          note={shiftNote(s, st)}
                          onClick={pickable ? () => plan!.toggle([selShift(s.id)]) : openDay}
                          selected={pickable ? plan!.selected.has(selShift(s.id)) : undefined}
                        />
                      );
                    })}
                    {openHere.map((o) => {
                      const ended = new Date(o.endsAt) <= now;
                      const underway = !ended && new Date(o.startsAt) <= now;
                      const gap = gapOf.get(o.id);
                      if (ended) {
                        return (
                          <p key={o.id} className="px-2 py-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                            Not covered · {o.start}–{o.end}
                          </p>
                        );
                      }
                      if (plan && gap) return <GapCell key={o.id} gap={gap} plan={plan} underway={underway} />;
                      return (
                        <Chip
                          key={o.id}
                          state="open"
                          title={`${p.name}, ${p.siteName}: open shift ${dayLabel(d)} ${o.start}–${o.end}${underway ? " — nobody on now" : ""}`}
                          line1={underway ? "Nobody on now" : "Open shift"}
                          line2={`${o.start}–${o.end}`}
                          note={underway ? "Fill it now" : "Click to fill"}
                          onClick={openDay}
                        />
                      );
                    })}
                    {shifts.length === 0 && needs.length === 0 && openHere.length === 0 && d >= today && !buildDenied && !plan && (
                      <button
                        type="button"
                        onClick={() => onCreate(p, d)}
                        aria-label={`${p.name}, ${p.siteName}: create shifts from ${dayLabel(d)}`}
                        title="Create shifts here"
                        className="block h-10 w-full rounded-md text-[14px] opacity-0 hover:opacity-100 focus:opacity-100 print:hidden"
                        style={{ color: "var(--text-muted)", background: "var(--wash-neutral)" }}
                      >
                        +
                      </button>
                    )}
                  </div>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

function HoursBar({ used, limit, busiest = false }: { used: number; limit: number; busiest?: boolean }) {
  const share = used / limit;
  const colour = share > 1 ? "var(--status-critical)" : share >= 0.9 ? "var(--status-warning)" : "var(--status-good)";
  return (
    <div className="mt-1" title={`${used}h of their ${limit}h week${busiest ? ", in their busiest week" : ""}`}>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="tnum font-medium tabular-nums">
          {used}h <span style={{ color: "var(--text-muted)" }}>of {limit}h{busiest ? " (busiest week)" : ""}</span>
        </span>
        {share >= 0.9 && (
          <span className="font-semibold" style={{ color: colour }}>
            {share > 1 ? "Over" : used >= limit ? "Full" : "Nearly full"}
          </span>
        )}
      </div>
      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--wash-neutral)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(share, 1) * 100}%`, background: colour }} />
      </div>
    </div>
  );
}

/** "Where am I this week?" — one row per officer, with their hours against their agreed week. */
function ByOfficer({ week, today, now, onOpen }: { week: RotaWeek; today: string; now: Date; onOpen: (o: Open) => void }) {
  const rows = useMemo(() => {
    const from = new Date(week.from);
    const to = new Date(week.to);
    const known = new Map(week.officers.map((o) => [o.id, o]));
    const ids = new Set([...week.officers.map((o) => o.id), ...week.shifts.map((s) => s.personId)]);
    return [...ids]
      .map((id) => {
        const o = known.get(id);
        const theirs = week.shifts.filter((s) => s.personId === id);
        const busy = o
          ? o.busy.map((b) => ({ startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt) }))
          : theirs.filter((s) => !s.cameOff).map((s) => ({ startsAt: new Date(s.startsAt), endsAt: new Date(s.endsAt) }));
        return {
          id,
          name: o?.name ?? theirs[0].personName,
          pin: o?.pin ?? null,
          team: o?.team ?? null,
          limit: o?.weeklyHours ?? null,
          // Over several weeks, the limit is about the busiest one.
          used: week.weeks > 1 ? busiestWeek(busy, week.monday, week.weeks) : hoursWithin(busy, from, to),
          shifts: theirs,
        };
      })
      .sort((a, b) => Number(b.shifts.length > 0) - Number(a.shifts.length > 0) || a.name.localeCompare(b.name));
  }, [week]);
  const postOf = new Map(week.posts.map((p) => [p.id, p]));

  return (
    <div>
      <table className="w-full table-fixed border-collapse text-[12px]" style={{ minWidth: tableWidth(week.days.length) }}>
        <DayHeads days={week.days} today={today} first="Officer" />
        <tbody>
          {/* An open shift has nobody on it yet, so it belongs to no officer's row: it gets its own. */}
          {week.openShifts.length > 0 && (
            <tr className="align-top" style={{ background: "var(--wash-warning)" }}>
              <th scope="row" className={`${pinned} py-2 pr-3 text-left font-normal`} style={{ background: "var(--surface-1)" }}>
                <p className="text-[13px] font-semibold">Open shifts</p>
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  {week.openShifts.length} with nobody on yet
                </p>
              </th>
              {week.days.map((d) => (
                <td key={d} className="p-1" style={dayCellStyle(d, today, week.days)}>
                  <div className="space-y-1">
                    {week.openShifts
                      .filter((o) => o.date === d)
                      .map((o) => {
                        const post = postOf.get(o.postId);
                        const ended = new Date(o.endsAt) <= now;
                        return (
                          <Chip
                            key={o.id}
                            state={ended ? "done" : "open"}
                            title={`Open shift: ${post?.name}, ${post?.siteName}, ${dayLabel(d)} ${o.start}–${o.end}`}
                            line1={post?.name ?? "Post"}
                            line2={`${o.start}–${o.end}`}
                            note={ended ? "Not covered" : "Nobody on yet"}
                            onClick={() => onOpen({ kind: "post", postId: o.postId, date: d })}
                          />
                        );
                      })}
                  </div>
                </td>
              ))}
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
              <th scope="row" className={`${pinned} py-2 pr-3 text-left font-normal`} style={{ background: "var(--surface-1)" }}>
                {i > 0 && r.shifts.length === 0 && rows[i - 1].shifts.length > 0 && (
                  <p className="mb-2 text-[11px] font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                    Not on this week
                  </p>
                )}
                <p className="text-[13px] font-semibold">
                  {r.name}
                  {r.pin && (
                    <span className="tnum ml-1.5 text-[11px] font-normal tabular-nums" style={{ color: "var(--text-muted)" }}>
                      PIN {r.pin}
                    </span>
                  )}
                </p>
                {r.team && (
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Control {r.team === "alpha" ? "Alpha" : r.team === "bravo" ? "Bravo" : r.team}
                  </p>
                )}
                {r.limit ? (
                  <HoursBar used={r.used} limit={r.limit} busiest={week.weeks > 1} />
                ) : (
                  <p className="text-[11px]" style={{ color: "var(--critical-text)" }}>
                    Not on the books
                  </p>
                )}
              </th>
              {week.days.map((d) => (
                <td key={d} className="p-1" style={dayCellStyle(d, today, week.days)}>
                  <div className="space-y-1">
                    {r.shifts
                      .filter((s) => s.date === d)
                      .map((s) => {
                        const st = shiftState(s, now);
                        const post = postOf.get(s.postId);
                        return (
                          <Chip
                            key={s.id}
                            state={st}
                            title={`${r.name}: ${post?.name}, ${post?.siteName}, ${dayLabel(d)} ${s.start}–${s.end} — ${shiftNote(s, st)}`}
                            line1={post?.name ?? "Post"}
                            line2={`${s.start}–${s.end}`}
                            note={shiftNote(s, st)}
                            onClick={() => onOpen({ kind: "post", postId: s.postId, date: d })}
                          />
                        );
                      })}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

/** "in 1h 55m", "20 min ago" — how near a cover need is, read at a glance. */
function relative(at: Date, now: Date): string {
  const mins = Math.round((at.getTime() - now.getTime()) / 60_000);
  const abs = Math.abs(mins);
  const text = abs < 60 ? `${abs} min` : abs < 48 * 60 ? `${Math.floor(abs / 60)}h ${abs % 60}m` : `${Math.round(abs / 1440)} days`;
  return mins >= 0 ? `in ${text}` : `${text} ago`;
}

function FillPanel({
  post,
  date,
  week,
  today,
  now,
  buildDenied,
  changeDenied,
  hoursDenied,
  onClose,
  onOpenCover,
  onCreate,
}: {
  post: RotaPost;
  date: string;
  week: RotaWeek;
  today: string;
  now: Date;
  buildDenied: string | null;
  changeDenied: string | null;
  hoursDenied: string | null;
  onClose: () => void;
  onOpenCover: (id: string) => void;
  onCreate: () => void;
}) {
  const postOpen = week.openShifts.filter((o) => o.postId === post.id);
  // The open shifts on the day clicked are ticked to start with.
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(postOpen.filter((o) => o.date === date).map((o) => o.id)));
  const [changingRegular, setChangingRegular] = useState(false);
  const [notice, setNotice] = useState<ActionResult | null>(null);

  const postShifts = week.shifts.filter((s) => s.postId === post.id);
  const postNeeds = week.coverNeeds.filter((c) => c.postId === post.id && c.status !== "covered");
  const openNeeds = postNeeds.filter((c) => c.status === "open");
  // A finished shift cannot be filled; one under way is offered from now.
  const fillable = postOpen.filter((o) => new Date(o.endsAt) > now);
  // A shift that has just been filled drops out of the ticked set by itself.
  const chosen = fillable.filter((o) => ticked.has(o.id));
  const windows = chosen.map((o) => fromNow({ startsAt: new Date(o.startsAt), endsAt: new Date(o.endsAt) }, now));
  const underway = windows.some((w) => w.startsAt <= now);

  return (
    <Drawer
      title={post.name}
      subtitle={`${post.siteName} · ${post.requiresSiaLicence ? "SIA licence needed" : "No SIA licence needed"}${post.loneWorking ? " · lone working" : ""}`}
      onClose={onClose}
    >
      {buildDenied && (
        <p className="rounded-md px-3 py-2 text-[12px]" style={{ background: "var(--wash-neutral)" }}>
          {buildDenied} You can see the rota; asking and changing belong to Control.
        </p>
      )}

      {openNeeds.length > 0 && (
        <section aria-label="Cover needed on this post" className="space-y-2">
          {openNeeds.map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-2 rounded-md px-3 py-2.5" style={{ background: "var(--status-critical)", color: "#fff" }}>
              <div className="min-w-0 text-[12px]">
                <p className="font-semibold">
                  Cover needed · {dayLabel(n.date)} {n.start}–{n.end}
                </p>
                <p>
                  {n.fromName} off, {OFF_REASON_LABELS[n.reason].toLowerCase()} · starts {relative(new Date(n.startsAt), now)}
                </p>
              </div>
              <button type="button" onClick={() => onOpenCover(n.id)} className="h-8 shrink-0 rounded-md px-3 text-[12px] font-semibold" style={{ background: "#fff", color: "var(--critical-text)" }}>
                Find cover
              </button>
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="regular-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="regular-h" className="text-[12px] font-semibold">
            Regular officer
          </h3>
          {!buildDenied && (
            <button type="button" onClick={() => setChangingRegular((v) => !v)} className="text-[11px] underline-offset-2 hover:underline" style={{ color: "var(--accent-text)" }}>
              {changingRegular ? "Done" : post.regular ? "Change" : "Name one"}
            </button>
          )}
        </div>
        <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {post.regular ? `${post.regular.name} normally works this post, so they are suggested first. They are still asked.` : "None — this post is covered from the pool."}
        </p>
        {changingRegular && !buildDenied && (
          <div className="mt-2">
            <RegularOfficerForm postId={post.id} current={post.regular?.id ?? null} officers={week.officers.map((o) => ({ id: o.id, name: o.name }))} />
          </div>
        )}
      </section>

      <section aria-labelledby="days-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="days-h" className="text-[12px] font-semibold">
            This post {week.weeks === 1 ? "this week" : `over ${week.weeks} weeks`}
          </h3>
          {!buildDenied && (
            <button type="button" onClick={onCreate} className="text-[11px] font-medium underline-offset-2 hover:underline" style={{ color: "var(--accent-text)" }}>
              Create shifts on this post
            </button>
          )}
        </div>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Tick the open shifts to ask about — one call can offer several. A shift somebody is on can be changed here.
        </p>
        {notice && <Result state={notice} />}
        <ul className="mt-2 divide-y rounded-md border" style={{ borderColor: "var(--hairline)" }}>
          {week.days
            .filter((d) => d === date || postShifts.some((s) => s.date === d) || postOpen.some((o) => o.date === d) || postNeeds.some((c) => c.date === d))
            .map((d) => {
              const here = postShifts.filter((s) => s.date === d);
              const needHere = postNeeds.filter((c) => c.date === d);
              const openHere = postOpen.filter((o) => o.date === d);
              return (
                <li key={d} className="flex items-start gap-2.5 px-3 py-2" style={{ borderColor: "var(--hairline)", background: d === date ? "var(--roster-draft-wash)" : undefined }}>
                  <span className="w-24 shrink-0 pt-0.5 text-[12px] font-medium">{dayLabel(d)}</span>
                  <div className="min-w-0 flex-1 space-y-2 text-[12px]">
                    {needHere.map((n) => (
                      <div key={n.id} className="flex flex-wrap items-center gap-2">
                        <Swatch state={n.status === "open" ? "cover_needed" : "uncovered"} />
                        <span className="font-semibold" style={{ color: n.status === "open" ? "var(--critical-text)" : "var(--serious-text)" }}>
                          {n.status === "open" ? "Cover needed" : "Left uncovered"} {n.start}–{n.end}
                        </span>
                        {n.status === "open" && (
                          <button type="button" onClick={() => onOpenCover(n.id)} className="text-[11px] font-semibold underline-offset-2 hover:underline" style={{ color: "var(--critical-text)" }}>
                            Find cover
                          </button>
                        )}
                        {n.status === "closed" && n.closedReason && (
                          <span className="w-full text-[11px]" style={{ color: "var(--text-muted)" }}>
                            {n.closedReason}
                          </span>
                        )}
                      </div>
                    ))}
                    {here.map((s) => (
                      <ShiftRow key={s.id} shift={s} now={now} buildDenied={buildDenied} changeDenied={changeDenied} onResult={setNotice} />
                    ))}
                    {openHere.map((o) => {
                      const canTick = fillable.some((f) => f.id === o.id) && !buildDenied;
                      return (
                        <label key={o.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            aria-label={`Ask about ${dayLabel(d)} ${o.start}–${o.end}`}
                            disabled={!canTick}
                            checked={canTick && ticked.has(o.id)}
                            onChange={(e) =>
                              setTicked((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(o.id);
                                else next.delete(o.id);
                                return next;
                              })
                            }
                            className="h-4 w-4 shrink-0"
                          />
                          <Swatch state="open" />
                          <span className="tnum tabular-nums">{o.start}–{o.end}</span>
                          <span className="text-[11px] font-semibold" style={{ color: canTick || buildDenied ? "var(--warning-text)" : "var(--text-muted)" }}>
                            {canTick || buildDenied ? "Open shift" : "Not covered"}
                          </span>
                        </label>
                      );
                    })}
                    {here.length === 0 && needHere.length === 0 && openHere.length === 0 && (
                      <span style={{ color: "var(--text-muted)" }}>
                        No shift on the rota.{" "}
                        {d >= today && !buildDenied && (
                          <button type="button" onClick={onCreate} className="underline-offset-2 hover:underline" style={{ color: "var(--accent-text)" }}>
                            Create one
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
        </ul>
      </section>

      <section aria-labelledby="officers-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="officers-h" className="text-[12px] font-semibold">
            Who to ask
          </h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {chosen.length ? `${chosen.length} open shift${chosen.length === 1 ? "" : "s"} ticked${underway ? " · under way, a yes is on at once" : ""}` : "Tick an open shift above first"}
          </p>
        </div>
        <CandidateList
          post={post}
          windows={windows}
          week={week}
          now={now}
          denied={buildDenied}
          hoursDenied={hoursDenied}
          asked={(o) => week.asks.filter((a) => a.personId === o.id && a.postId === post.id && !a.coverNeedId)}
          saidNo={(o) => week.asks.some((a) => a.personId === o.id && a.postId === post.id && a.answer === "no" && chosen.some((c) => c.date === a.date))}
          ask={(o) => <AskForm postId={post.id} personId={o.id} openShiftIds={chosen.map((c) => c.id)} now={underway} />}
          empty="Nobody in the pool can work these shifts. That is the case for raising a client requirement."
        />
      </section>
    </Drawer>
  );
}

/** One shift on the post's week, with what can be done to it. */
function ShiftRow({
  shift: s,
  now,
  buildDenied,
  changeDenied,
  onResult,
}: {
  shift: RotaShift;
  now: Date;
  buildDenied: string | null;
  changeDenied: string | null;
  onResult: (r: ActionResult) => void;
}) {
  const [doing, setDoing] = useState<null | "off" | "hours" | "cancel">(null);
  const st = shiftState(s, now);
  const live = (s.state === "published" || s.state === "amended") && !s.cameOff && new Date(s.endsAt) > now;
  const started = new Date(s.startsAt) <= now;
  const actions: ["off" | "hours" | "cancel", string][] = [
    ["off", "Officer can't do it"],
    ["hours", "Change hours"],
    ...(started ? [] : ([["cancel", "Cancel shift"]] as ["cancel", string][])),
  ];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Swatch state={st} />
        <span className="font-semibold" style={{ textDecoration: s.cameOff ? "line-through" : undefined }}>
          {s.personName}
        </span>
        <span className="tnum tabular-nums" style={{ color: "var(--text-secondary)" }}>
          {s.start}–{s.end}
        </span>
        <span className="text-[11px] font-semibold" style={{ color: inkOf(st) }}>
          {shiftNote(s, st)}
        </span>
      </div>
      {s.cameOff?.note && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          “{s.cameOff.note}”
        </p>
      )}
      {s.state === "draft" && s.check && !s.check.allowed && (
        <p className="text-[11px]" style={{ color: "var(--critical-text)" }}>
          {s.check.blockers[0]}
        </p>
      )}
      {s.state === "draft" && !buildDenied && <TakeOffDraftForm assignmentId={s.id} onResult={onResult} />}
      {live && !changeDenied && (
        <div className="mt-1.5">
          <div className="flex flex-wrap gap-1.5">
            {actions.map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-expanded={doing === k}
                onClick={() => setDoing((v) => (v === k ? null : k))}
                className="h-7 rounded-md border px-2.5 text-[11px] font-medium"
                style={
                  doing === k
                    ? { background: "var(--text-primary)", color: "var(--page)", borderColor: "var(--text-primary)" }
                    : { borderColor: k === "off" ? "var(--status-critical)" : "var(--hairline)", color: k === "off" ? "var(--critical-text)" : undefined }
                }
              >
                {label}
              </button>
            ))}
          </div>
          {doing && (
            <div className="mt-2 rounded-md border p-2.5" style={{ borderColor: "var(--hairline)", background: "var(--wash-neutral)" }}>
              {doing === "off" && <OfficerOffForm assignmentId={s.id} name={s.personName} onResult={onResult} />}
              {doing === "hours" && <ChangeHoursForm assignmentId={s.id} start={s.start} end={s.end} started={started} onResult={onResult} />}
              {doing === "cancel" && <CancelShiftForm assignmentId={s.id} onResult={onResult} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** After somebody came off: the hours still to cover, and the ring-round for them. */
function CoverPanel({
  need,
  post,
  week,
  now,
  buildDenied,
  changeDenied,
  hoursDenied,
  onClose,
}: {
  need: RotaCoverNeed;
  post: RotaPost;
  week: RotaWeek;
  now: Date;
  buildDenied: string | null;
  changeDenied: string | null;
  hoursDenied: string | null;
  onClose: () => void;
}) {
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const startsAt = new Date(need.startsAt);
  const endsAt = new Date(need.endsAt);
  // Cover found late starts when it is offered.
  const from = startsAt > now ? startsAt : new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const asks = week.asks.filter((a) => a.coverNeedId === need.id);
  const denied = buildDenied ?? changeDenied;

  return (
    <Drawer
      title={need.status === "open" ? `Cover needed — ${post.name}` : need.status === "covered" ? `Covered — ${post.name}` : `Left uncovered — ${post.name}`}
      subtitle={`${post.siteName} · ${dayLabel(need.date)} ${need.start}–${need.end}`}
      urgent={need.status === "open"}
      onClose={onClose}
    >
      <section className="rounded-md border px-3 py-2.5 text-[12px]" style={{ borderColor: "var(--hairline)" }}>
        <p>
          <span className="font-semibold">{need.fromName}</span> came off — {OFF_REASON_LABELS[need.reason].toLowerCase()}
          {need.note && <span style={{ color: "var(--text-secondary)" }}> · “{need.note}”</span>}
        </p>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Recorded by {need.raisedBy}, {formatShortDate(need.raisedAt)} {formatTime(need.raisedAt)}
        </p>
        {need.status === "open" && (
          <p className="mt-1.5 font-semibold" style={{ color: startsAt > now ? "var(--text-primary)" : "var(--critical-text)" }}>
            {startsAt > now ? `Starts ${relative(startsAt, now)}.` : `Should have started ${relative(startsAt, now)}. Cover found now starts at ${formatTime(from)}.`}
          </p>
        )}
        {need.status === "covered" && (
          <p className="mt-1.5 font-semibold" style={{ color: "var(--roster-cover)" }}>
            Covered by {need.coverName}.
          </p>
        )}
        {need.status === "closed" && (
          <p className="mt-1.5" style={{ color: "var(--serious-text)" }}>
            Left uncovered: {need.closedReason}
          </p>
        )}
      </section>

      {notice && <Result state={notice} />}

      {need.status === "open" && (
        <>
          {denied && (
            <p className="rounded-md px-3 py-2 text-[12px]" style={{ background: "var(--wash-neutral)" }}>
              {denied}
            </p>
          )}
          <section aria-labelledby="cover-who-h">
            <h3 id="cover-who-h" className="text-[12px] font-semibold">
              Who to ask
            </h3>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
              Everyone who can work {formatTime(from)}–{need.end}: no clash, inside their weekly hours and cleared to deploy. A yes goes on the rota at once.
            </p>
            <CandidateList
              post={post}
              windows={[{ startsAt: from, endsAt }]}
              week={week}
              now={now}
              denied={denied}
              hoursDenied={hoursDenied}
              exclude={need.fromPersonId}
              asked={(o) => asks.filter((a) => a.personId === o.id)}
              saidNo={(o) => asks.some((a) => a.personId === o.id && a.answer === "no")}
              ask={(o) => <AskForm postId={post.id} personId={o.id} coverNeedId={need.id} />}
              empty="Nobody in the pool can cover it. Tell the client, and record the decision below."
            />
          </section>
          {!denied && (
            <details className="rounded-md border" style={{ borderColor: "var(--hairline)" }}>
              <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium select-none" style={{ color: "var(--text-secondary)" }}>
                Nobody can be found
              </summary>
              <div className="border-t px-3 pt-3 pb-3" style={{ borderColor: "var(--hairline)" }}>
                <LeaveUncoveredForm coverNeedId={need.id} onResult={setNotice} />
              </div>
            </details>
          )}
        </>
      )}

      {asks.length > 0 && (
        <section aria-labelledby="cover-asked-h">
          <h3 id="cover-asked-h" className="text-[12px] font-semibold">
            Asked so far
          </h3>
          <ul className="mt-1 space-y-1">
            {asks.map((a) => (
              <li key={a.id} className="text-[12px]">
                <span className="font-medium">{a.personName}</span>{" "}
                <span style={{ color: a.answer === "yes" ? "var(--good-text)" : "var(--text-secondary)" }}>— {ANSWER_LABELS[a.answer].toLowerCase()}</span>
                <span style={{ color: "var(--text-muted)" }}>
                  {" "}
                  · {CHANNEL_LABELS[a.channel].toLowerCase()}, {formatTime(a.askedAt)}
                  {a.note && ` · “${a.note}”`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Who to ask
// ---------------------------------------------------------------------------

interface Candidate {
  officer: RotaOfficer;
  /** Why they cannot work these shifts, or null. */
  cannot: string | null;
  /** The reason is their weekly hours, which Control can change here. */
  overHours: boolean;
  warnings: string[];
  rest: number | null;
  hoursNow: number;
  hoursAdded: number;
  regular: boolean;
  allocation: string | null;
  shiftsHere: number;
  saidNo: boolean;
  asked: RotaWeek["asks"];
  /** What they said in their portal about the day(s): free, not free, or nothing. */
  said: "available" | "unavailable" | null;
  /** Offered for this very shift in their portal. */
  offered: boolean;
}

function CandidateList({
  post,
  windows,
  week,
  now,
  denied,
  hoursDenied,
  exclude,
  asked,
  saidNo,
  ask,
  empty,
}: {
  post: RotaPost;
  windows: { startsAt: Date; endsAt: Date }[];
  week: RotaWeek;
  now: Date;
  denied: string | null;
  hoursDenied: string | null;
  exclude?: string;
  asked: (o: RotaOfficer) => RotaWeek["asks"];
  saidNo: (o: RotaOfficer) => boolean;
  ask: (o: RotaOfficer) => ReactNode;
  empty: string;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Worked out on every render: a few dozen officers against at most seven
  // shifts, and it has to follow every tick and every change of hours.
  const from = new Date(week.from);
  const to = new Date(week.to);
  const candidates = week.officers
    .filter((o) => o.id !== exclude)
    .map((o): Candidate => {
      const busy: Busy[] = o.busy.map((b) => ({ startsAt: new Date(b.startsAt), endsAt: new Date(b.endsAt), label: b.label }));
      let cannot: string | null = null;
      const warnings = new Set<string>();
      for (const at of windows.length ? windows.map((w) => w.endsAt) : [now]) {
        const d = evaluateDeployability({ ...o.input, postRequiresSiaLicence: post.requiresSiaLicence }, at);
        if (!d.deployable) {
          cannot = d.blockers[0].label;
          break;
        }
        d.warnings.forEach((w) => warnings.add(w.label));
      }
      const leave = o.leave.map((l) => ({ startsAt: new Date(l.startsAt), endsAt: new Date(l.endsAt), approved: l.approved }));
      if (!cannot) cannot = windows.map((w) => leaveProblem(leave, w)).find(Boolean) ?? null;
      if (windows.some((w) => leavePending(leave, w))) warnings.add("Has asked for leave then — not decided yet");
      const clash = windows.map((w) => clashWith(busy, w)).find(Boolean);
      if (!cannot && clash) cannot = `Already on ${clash.label} ${formatTime(clash.startsAt)}–${formatTime(clash.endsAt)}`;
      if (!cannot && o.excludedSites.includes(post.siteId)) cannot = `Kept off ${post.siteName}`;
      const overHours = !cannot && hoursProblem(busy, windows, o.weeklyHours);
      if (overHours) cannot = overHours;
      // Eleven hours' rest is enforced, like the hours.
      if (!cannot) cannot = restProblem(busy, windows);
      const rests = windows.map((w, i) => shortestRest([...busy, ...windows.filter((_, j) => j !== i)], w)).filter((r): r is number => r !== null);
      const days = windows.map((w) => ukDate(w.startsAt));
      const sayings = days.map((d) => o.said[d]).filter(Boolean);
      const said = sayings.includes("unavailable") ? "unavailable" : sayings.length === days.length && sayings.length > 0 ? "available" : null;
      return {
        officer: o,
        cannot,
        overHours: !!overHours,
        warnings: [...warnings],
        rest: rests.length ? Math.min(...rests) : null,
        hoursNow: week.weeks > 1 ? busiestWeek(busy, week.monday, week.weeks) : hoursWithin(busy, from, to),
        hoursAdded:
          week.weeks > 1
            ? busiestWeek([...busy, ...windows], week.monday, week.weeks) - busiestWeek(busy, week.monday, week.weeks)
            : hoursWithin(windows, from, to),
        regular: post.regular?.id === o.id,
        allocation: post.allocated.find((a) => a.personId === o.id)?.reference ?? null,
        shiftsHere: o.shiftsHere[post.id] ?? 0,
        saidNo: saidNo(o),
        asked: asked(o),
        said,
        offered: week.openShifts.some((x) => x.offeredBy.includes(o.id) && windows.some((w) => new Date(x.startsAt).getTime() === w.startsAt.getTime() && x.postId === post.id)),
      };
    });

  const q = query.trim().toLowerCase();
  const match = (c: Candidate) => !q || c.officer.name.toLowerCase().includes(q) || (c.officer.pin ?? "").includes(q);
  const askable = candidates
    .filter((c) => !c.cannot && match(c))
    .sort(
      (a, b) =>
        // Somebody who offered for this shift is the first call to make.
        Number(b.offered) - Number(a.offered) ||
        candidateOrder({ name: a.officer.name, allocatedHere: !!a.allocation, ...a }, { name: b.officer.name, allocatedHere: !!b.allocation, ...b }),
    );
  const cannot = candidates.filter((c) => c.cannot && match(c));

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find an officer by name or PIN"
        aria-label="Find an officer"
        className={`${input} mt-2 h-8`}
        style={inputStyle}
      />
      {askable.length === 0 ? (
        <p className="py-4 text-center text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {q ? "Nobody by that name can work this." : empty}
        </p>
      ) : (
        <ul className="mt-1 divide-y" style={{ borderColor: "var(--hairline)" }}>
          {askable.map((c) => {
            const after = Math.round((c.hoursNow + c.hoursAdded) * 10) / 10;
            return (
              <li key={c.officer.id} className="py-2.5" style={{ borderColor: "var(--hairline)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">
                      {c.officer.name}
                      {c.officer.pin && (
                        <span className="tnum ml-1.5 text-[11px] font-normal tabular-nums" style={{ color: "var(--text-muted)" }}>
                          PIN {c.officer.pin}
                        </span>
                      )}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.offered && <Tag>Offered in their portal</Tag>}
                      {c.said === "available" && <Tag>Said they are free</Tag>}
                      {c.said === "unavailable" && <Tag>Said they are not free</Tag>}
                      {c.regular && <Tag>Regular officer</Tag>}
                      {c.allocation && <Tag>Allocated · {c.allocation}</Tag>}
                      {c.shiftsHere > 0 && <Tag>Worked here {c.shiftsHere}× in 4 weeks</Tag>}
                      {c.officer.team && <Tag>Control {c.officer.team === "alpha" ? "Alpha" : c.officer.team === "bravo" ? "Bravo" : c.officer.team}</Tag>}
                      {c.saidNo && <Tag>Said no</Tag>}
                    </div>
                    <div className="mt-1 max-w-[16rem]">
                      <HoursBar used={after} limit={c.officer.weeklyHours} busiest={week.weeks > 1} />
                      {c.hoursAdded > 0 && (
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {c.hoursNow}h now, {after}h with {windows.length === 1 ? "this shift" : "these"}
                        </p>
                      )}
                    </div>
                    {c.rest !== null && c.rest < MIN_REST_HOURS && (
                      <p className="text-[11px]" style={{ color: "var(--warning-text)" }}>
                        Only {Math.round(c.rest * 10) / 10}h rest between shifts
                      </p>
                    )}
                    {c.warnings.length > 0 && (
                      <p className="text-[11px]" style={{ color: "var(--warning-text)" }}>
                        {c.warnings.join(" · ")}
                      </p>
                    )}
                    {c.asked.map((a) => (
                      <p key={a.id} className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {dayLabel(a.date)}: asked {formatShortDate(a.askedAt)} {formatTime(a.askedAt)} by {a.askedBy} ({CHANNEL_LABELS[a.channel].toLowerCase()}) —{" "}
                        {ANSWER_LABELS[a.answer].toLowerCase()}
                        {a.note && `: “${a.note}”`}
                      </p>
                    ))}
                  </div>
                  {!denied && (
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => (v === c.officer.id ? null : c.officer.id))}
                      aria-expanded={expanded === c.officer.id}
                      className="h-8 shrink-0 rounded-md border px-3 text-[12px] font-medium whitespace-nowrap"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      {expanded === c.officer.id ? "Cancel" : "Record answer"}
                    </button>
                  )}
                </div>
                {expanded === c.officer.id && !denied && ask(c.officer)}
              </li>
            );
          })}
        </ul>
      )}

      {cannot.length > 0 && (
        <details className="mt-2 rounded-md border" style={{ borderColor: "var(--hairline)" }}>
          <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium select-none" style={{ color: "var(--text-secondary)" }}>
            {cannot.length} cannot work {windows.length === 1 ? "this shift" : "these shifts"}
          </summary>
          <ul className="divide-y border-t px-3" style={{ borderColor: "var(--hairline)" }}>
            {cannot.map((c) => (
              <li key={c.officer.id} className="py-2 text-[12px]" style={{ borderColor: "var(--hairline)" }}>
                <span className="font-medium">{c.officer.name}</span>
                <span style={{ color: "var(--text-secondary)" }}> — {c.cannot}</span>
                {/* Only an officer with an employment record (and so a PIN) has hours of their own to change. */}
                {c.overHours && !hoursDenied && c.officer.pin && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[11px] select-none" style={{ color: "var(--accent-text)" }}>
                      Change their weekly hours
                    </summary>
                    <div className="mt-1.5">
                      <WeeklyHoursForm personId={c.officer.id} hours={c.officer.weeklyHours} />
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
