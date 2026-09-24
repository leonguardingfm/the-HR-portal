/**
 * Building the rota — the rules, with no database in sight.
 *
 * Three answers from Control (24 September 2026) shape all of it:
 *
 *   1. **Next week is not a copy of this week.** It changes every time, so the
 *      week starts from the posts that need cover, not from last week's names.
 *   2. **Posts are a pool, sometimes fixed to one officer.** A post can carry a
 *      regular officer, who is suggested first and never forced.
 *   3. **Availability is known by asking the officers.** Nothing is assumed
 *      from a calendar: the ask, and its answer, is the availability record.
 *
 * Every time here is UK time. The operation is in the UK whatever the clock on
 * the machine rendering the page says, and a rota that moved by five hours on
 * a laptop abroad would be worse than no rota.
 */

export const OPERATION_TZ = "Europe/London";

/** Daily rest under the Working Time Regulations: at least eleven hours
 *  between one shift and the next. Enforced — the rota refuses a shift that
 *  leaves less (Control, 25 September 2026). */
export const MIN_REST_HOURS = 11;

/** How far back "has worked this post" looks. */
export const KNOWS_POST_DAYS = 28;

export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const HOUR = 3_600_000;

// ---------------------------------------------------------------------------
// UK dates and times
// ---------------------------------------------------------------------------

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: OPERATION_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function ukParts(at: Date) {
  const p = Object.fromEntries(PARTS.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

/** "2026-09-29": the UK calendar date an instant falls on. */
export function ukDate(at: Date): string {
  const { y, m, d } = ukParts(at);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "19:00": the UK wall-clock time of an instant. */
export function ukTime(at: Date): string {
  const { h, mi } = ukParts(at);
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/** UK time minus UTC at an instant: 0 in winter, one hour in summer. */
function ukOffset(at: Date): number {
  const { y, m, d, h, mi } = ukParts(at);
  return Date.UTC(y, m - 1, d, h, mi) - Math.floor(at.getTime() / 60_000) * 60_000;
}

/** The instant a UK date and wall-clock time refer to. */
export function ukInstant(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  let t = asUtc - ukOffset(new Date(asUtc));
  // Across a clock change the first guess can sit on the wrong side of it.
  const second = asUtc - ukOffset(new Date(t));
  if (second !== t) t = second;
  return new Date(t);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 for Monday … 6 for Sunday. */
export function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** The Monday of the week a date is in. A rota week runs Monday to Sunday. */
export function mondayOf(date: string): string {
  return addDays(date, -weekday(date));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 29 Sep" from a UK date string, without going near a time zone. */
export function dayLabel(date: string): string {
  return `${DAY_SHORT[weekday(date)]} ${Number(date.slice(8))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
export const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/**
 * A shift from a UK date and two wall-clock times. An end at or before the
 * start is the next morning: that is what "19:00 to 07:00" means.
 */
export function shiftWindow(date: string, start: string, end: string): { startsAt: Date; endsAt: Date } {
  const overnight = end <= start;
  return { startsAt: ukInstant(date, start), endsAt: ukInstant(overnight ? addDays(date, 1) : date, end) };
}

export const hoursOf = (w: { startsAt: Date; endsAt: Date }) => (w.endsAt.getTime() - w.startsAt.getTime()) / HOUR;

// ---------------------------------------------------------------------------
// Post patterns
// ---------------------------------------------------------------------------

export interface Pattern {
  /** 0 for Monday … 6 for Sunday. */
  days: number[];
  start: string;
  end: string;
}

const DAY_INDEX: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function dayIndex(token: string): number | undefined {
  return DAY_INDEX[token.trim().slice(0, 3).toLowerCase()];
}

/**
 * Read a post's pattern — "Mon–Sun 1900–0700", "Sat–Sun 06:00-18:00",
 * "Mon, Wed, Fri 0700–1900", "Daily 0600–1800" — into the days and hours it
 * needs cover. The pattern is the post's shape, not its officers: it says
 * where the gaps are before anyone is asked. Anything it cannot read returns
 * null, and that post simply has no gaps drawn for it.
 */
export function parsePattern(pattern: string | null | undefined): Pattern | null {
  if (!pattern) return null;
  const m = pattern.trim().match(/^(.+?)\s+(\d{1,2}):?(\d{2})\s*[–—-]\s*(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const start = `${m[2].padStart(2, "0")}:${m[3]}`;
  const end = `${m[4].padStart(2, "0")}:${m[5]}`;
  if (!isTime(start) || !isTime(end) || start === end) return null;

  const spec = m[1].trim().toLowerCase();
  let days: number[] = [];
  if (["daily", "every day", "7 days"].includes(spec)) {
    days = [0, 1, 2, 3, 4, 5, 6];
  } else {
    for (const part of spec.split(",")) {
      const range = part.split(/[–—-]/);
      if (range.length === 1) {
        const d = dayIndex(range[0]);
        if (d === undefined) return null;
        days.push(d);
      } else if (range.length === 2) {
        const from = dayIndex(range[0]);
        const to = dayIndex(range[1]);
        if (from === undefined || to === undefined) return null;
        // Ranges wrap: "Fri–Mon" is the weekend and the Monday.
        for (let d = from; ; d = (d + 1) % 7) {
          days.push(d);
          if (d === to) break;
        }
      } else {
        return null;
      }
    }
  }
  days = [...new Set(days)].sort((a, b) => a - b);
  return days.length ? { days, start, end } : null;
}

// ---------------------------------------------------------------------------
// An officer's week: clashes, rest and hours
// ---------------------------------------------------------------------------

export interface Busy {
  startsAt: Date;
  endsAt: Date;
  label?: string;
}

const overlaps = (a: Busy, b: Busy) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/** The shift this one would clash with. The database refuses the clash anyway. */
export function clashWith(shifts: Busy[], w: Busy): Busy | null {
  return shifts.find((s) => overlaps(s, w)) ?? null;
}

/** The shortest rest either side of a new shift, in hours, or null. */
export function shortestRest(shifts: Busy[], w: Busy): number | null {
  let best: number | null = null;
  for (const s of shifts) {
    if (overlaps(s, w)) continue;
    const gap = s.endsAt <= w.startsAt ? w.startsAt.getTime() - s.endsAt.getTime() : s.startsAt.getTime() - w.endsAt.getTime();
    const hours = gap / HOUR;
    if (best === null || hours < best) best = hours;
  }
  return best;
}

/**
 * Why these shifts would leave an officer less than eleven hours' rest, or
 * null. `busy` is what they already hold; the windows are checked against it
 * and against each other. Back-to-back shifts that touch (a relief handing
 * straight over) are one stretch of work, not a gap, and are left to the
 * hours limit.
 */
export function restProblem(busy: Busy[], windows: Busy[]): string | null {
  for (const [i, w] of windows.entries()) {
    const others = [...busy, ...windows.filter((_, j) => j !== i)].filter((s) => s.endsAt.getTime() !== w.startsAt.getTime() && s.startsAt.getTime() !== w.endsAt.getTime());
    const rest = shortestRest(others, w);
    if (rest !== null && rest < MIN_REST_HOURS) {
      const near = others.find((s) => {
        const gap = s.endsAt <= w.startsAt ? w.startsAt.getTime() - s.endsAt.getTime() : s.startsAt.getTime() - w.endsAt.getTime();
        return Math.abs(gap / HOUR - rest) < 0.01;
      });
      return `Only ${Math.round(rest * 10) / 10}h rest ${near && near.endsAt <= w.startsAt ? "after" : "before"} ${near?.label ?? "another shift"} — at least ${MIN_REST_HOURS}h is needed between shifts.`;
    }
  }
  return null;
}

/** Hours worked inside a window, counting only the part of each shift inside it. */
export function hoursWithin(shifts: Busy[], from: Date, to: Date): number {
  let ms = 0;
  for (const s of shifts) {
    const a = Math.max(s.startsAt.getTime(), from.getTime());
    const b = Math.min(s.endsAt.getTime(), to.getTime());
    if (b > a) ms += b - a;
  }
  return Math.round((ms / HOUR) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

export const ASK_CHANNELS = ["phone", "whatsapp", "sms", "in_person"] as const;
export type AskChannel = (typeof ASK_CHANNELS)[number];
export const ASK_ANSWERS = ["yes", "no", "no_answer"] as const;
export type AskAnswer = (typeof ASK_ANSWERS)[number];

export const CHANNEL_LABELS: Record<AskChannel | "portal", string> = {
  phone: "Phone",
  whatsapp: "WhatsApp",
  sms: "Text",
  in_person: "In person",
  // Not one Control picks: the officer offered in their portal, and Control accepted.
  portal: "Their portal",
};

export const ANSWER_LABELS: Record<AskAnswer, string> = {
  yes: "Said yes",
  no: "Said no",
  no_answer: "No answer",
};

/** Why an ask cannot be recorded, or null. Checked before the officer is. */
export function askProblem(args: {
  channel: string;
  answer: string;
  /** As offered: a shift already under way is offered from now (see fromNow). */
  windows: { startsAt: Date; endsAt: Date }[];
  now?: Date;
}): string | null {
  const now = args.now ?? new Date();
  if (!ASK_CHANNELS.includes(args.channel as AskChannel)) return "Choose how you asked them.";
  if (!ASK_ANSWERS.includes(args.answer as AskAnswer)) return "Choose what they said.";
  if (args.channel === "in_person" && args.answer === "no_answer") {
    return "Asked in person, they answered — record what they said.";
  }
  if (args.windows.length === 0) return "Tick at least one shift to ask about.";
  if (args.windows.length > 31) return "That is more than a month of shifts in one ask. Ask about them a month at a time.";
  for (const w of args.windows) {
    if (w.endsAt <= now) return "That shift has finished. Nothing is left to cover.";
    const h = hoursOf(w);
    if (h < 1 && w.startsAt > now) return "A shift of under an hour is almost certainly a typo in the times.";
    if (h > 16) return `A ${Math.round(h)}-hour shift is almost certainly a typo in the times.`;
  }
  return null;
}

/**
 * A shift already under way is offered from now, to the minute: the officer
 * asked at 08:40 for a 06:00 start covers from 08:40, and the hours nobody was
 * there stay visible rather than papered over.
 */
export function fromNow<W extends { startsAt: Date; endsAt: Date }>(w: W, now: Date = new Date()): W {
  const at = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  return w.startsAt < at && w.endsAt > at ? { ...w, startsAt: at } : w;
}

// ---------------------------------------------------------------------------
// Who to ask first
// ---------------------------------------------------------------------------

export interface CandidateFacts {
  name: string;
  regular: boolean;
  allocatedHere: boolean;
  /** Shifts on this post in the last four weeks. */
  shiftsHere: number;
  saidNo: boolean;
  /** What they said about the day in their portal, if anything. */
  said?: "available" | "unavailable" | null;
}

/**
 * The order Control would ask in: the post's regular officer, anyone allocated
 * to it through a client requirement, then anyone who said in their portal
 * that they are free that day, then whoever knows the post best. Anyone who
 * has already said no — on the phone, or "not free" in their portal — drops
 * to the bottom rather than off the list: the answer can change, and the
 * record should show they were tried.
 */
export function candidateOrder(a: CandidateFacts, b: CandidateFacts): number {
  const away = (f: CandidateFacts) => Number(f.said === "unavailable");
  const free = (f: CandidateFacts) => Number(f.said === "available");
  return (
    Number(a.saidNo) - Number(b.saidNo) ||
    // Said in their portal they are not free that day: tried last.
    away(a) - away(b) ||
    Number(b.regular) - Number(a.regular) ||
    Number(b.allocatedHere) - Number(a.allocatedHere) ||
    // Said they are free: before anyone who has said nothing.
    free(b) - free(a) ||
    b.shiftsHere - a.shiftsHere ||
    a.name.localeCompare(b.name)
  );
}

// ---------------------------------------------------------------------------
// Weekly hours
// ---------------------------------------------------------------------------

/** Until somebody sets an officer's agreed hours: the Working Time Regulations week. */
export const DEFAULT_WEEKLY_HOURS = 48;

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

/** The rota weeks (their Mondays) a shift touches. A Sunday night is in two. */
export function weeksOf(w: Busy): string[] {
  const first = mondayOf(ukDate(w.startsAt));
  const last = mondayOf(ukDate(new Date(w.endsAt.getTime() - 1)));
  const out = [first];
  while (out[out.length - 1] < last) out.push(addDays(out[out.length - 1], 7));
  return out;
}

/**
 * Why these shifts would take an officer over their weekly hours, or null.
 * Counted per rota week, Monday to Sunday UK time, with a shift that crosses
 * midnight on Sunday split between the two weeks it falls in. `busy` is what
 * they already hold, without the shift being changed.
 */
export function hoursProblem(busy: Busy[], windows: Busy[], weeklyHours: number): string | null {
  const mondays = [...new Set(windows.flatMap(weeksOf))].sort();
  for (const m of mondays) {
    const total = hoursWithin([...busy, ...windows], ukInstant(m, "00:00"), ukInstant(addDays(m, 7), "00:00"));
    if (total > weeklyHours + 0.01) {
      return `That would be ${oneDecimal(total)}h in the week of ${dayLabel(m)}, over their ${weeklyHours}h week.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Changing the rota on the night
// ---------------------------------------------------------------------------

export const OFF_REASONS = ["sick", "withdrew", "no_show", "other"] as const;
export type OffReason = (typeof OFF_REASONS)[number];

export const OFF_REASON_LABELS: Record<OffReason, string> = {
  sick: "Sick",
  withdrew: "Changed their mind",
  no_show: "Did not turn up",
  other: "Other",
};

/**
 * What taking an officer off a shift does to it. Before it starts, the whole
 * shift comes off and the whole shift needs cover. Part-way through — sent
 * home ill at 23:00 — the shift ends now and the rest of it needs cover. A
 * finished shift is history, not a change.
 */
export function offWindow(
  shift: { startsAt: Date; endsAt: Date },
  now: Date = new Date(),
): { ok: true; started: boolean; cover: { startsAt: Date; endsAt: Date } } | { ok: false; reason: string } {
  const at = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  if (shift.endsAt.getTime() - at.getTime() < 60_000) return { ok: false, reason: "That shift has finished. Nothing is left to cover." };
  if (at <= shift.startsAt) return { ok: true, started: false, cover: { startsAt: shift.startsAt, endsAt: shift.endsAt } };
  return { ok: true, started: true, cover: { startsAt: at, endsAt: shift.endsAt } };
}

/** Why new hours for a published shift cannot stand, or null. */
export function newHoursProblem(
  shift: { startsAt: Date; endsAt: Date },
  next: { startsAt: Date; endsAt: Date },
  now: Date = new Date(),
): string | null {
  if (next.startsAt.getTime() === shift.startsAt.getTime() && next.endsAt.getTime() === shift.endsAt.getTime()) {
    return "Those are the hours it already has.";
  }
  const h = hoursOf(next);
  if (h < 1 || h > 16) return "Those hours look like a typo — a shift is between 1 and 16 hours.";
  if (shift.endsAt <= now) return "That shift has finished.";
  if (shift.startsAt <= now && next.startsAt.getTime() !== shift.startsAt.getTime()) {
    return "The shift has started, so only its end can change.";
  }
  if (next.endsAt <= now) return "The new end has already passed.";
  if (shift.startsAt > now && next.startsAt <= now) return "The new start has already passed.";
  return null;
}

// ---------------------------------------------------------------------------
// What a shift on the roster is, at a glance
// ---------------------------------------------------------------------------

export type RosterState =
  | "cover_needed"
  | "open"
  | "draft"
  | "blocked"
  | "published"
  | "cover"
  | "changed"
  | "on_shift"
  | "done"
  | "off"
  | "uncovered";

/** Every state the roster colours, in the order the legend shows them. */
export const ROSTER_STATES: { id: RosterState; label: string; meaning: string }[] = [
  { id: "cover_needed", label: "Cover needed now", meaning: "An officer came off. Ring round." },
  { id: "open", label: "Open shift", meaning: "On the rota, nobody assigned yet." },
  { id: "draft", label: "Draft", meaning: "They said yes. Not published yet." },
  { id: "blocked", label: "Blocked", meaning: "A draft the compliance check stops." },
  { id: "published", label: "On the rota", meaning: "Published. The officer is expected." },
  { id: "cover", label: "Cover", meaning: "Covering for an officer who came off." },
  { id: "changed", label: "Hours changed", meaning: "Changed after it was published." },
  { id: "on_shift", label: "On shift now", meaning: "Happening now." },
  { id: "done", label: "Done", meaning: "Finished." },
  { id: "off", label: "Came off", meaning: "Sick, changed their mind or did not turn up." },
  { id: "uncovered", label: "Left uncovered", meaning: "Nobody could be found, and it was decided." },
];

export function rosterState(
  s: {
    state: string;
    startsAt: Date;
    endsAt: Date;
    blocked?: boolean;
    cameOff?: boolean;
    isCover?: boolean;
    amended?: boolean;
  },
  now: Date = new Date(),
): RosterState {
  if (s.cameOff) return "off";
  if (s.state === "draft") return s.blocked ? "blocked" : "draft";
  if (s.state === "completed" || s.endsAt <= now) return "done";
  if (s.startsAt <= now) return "on_shift";
  if (s.isCover) return "cover";
  if (s.amended) return "changed";
  return "published";
}

// ---------------------------------------------------------------------------
// Planning in bulk
// ---------------------------------------------------------------------------
//
// Three or four hundred officers cannot be rostered one call at a time. The
// week — or four — is planned in one go: PINs typed straight into the gaps,
// one officer given a run of selected shifts, drafts published or taken off
// together. Every entry still passes the same checks as a single ask, and the
// batch is checked against itself as well as against the rota: two entries
// for one officer on the same night clash with each other.

/** How many weeks the roster shows at once. */
export const SPANS = [1, 4] as const;
export type Span = (typeof SPANS)[number];

/** The most one bulk save takes: four weeks of a large operation, with room. */
export const MAX_BATCH = 1500;

export interface PlanItem {
  /** The caller's own name for the entry, handed back with any refusal. */
  key: string;
  postId: string;
  personId: string;
  startsAt: Date;
  endsAt: Date;
  /** How the shift reads in someone else's refusal: "Night gatehouse, Tue 29 Sep". */
  label?: string;
}

/**
 * Check a batch of entries against the rota and against each other. Entries
 * are taken in time order and each accepted one is added to what the officer
 * and the post already hold, so the batch cannot double-book itself or take
 * an officer over their hours between two of its own entries.
 */
export function planBatch(
  items: PlanItem[],
  ctx: {
    busyByPerson: Map<string, Busy[]>;
    busyByPost: Map<string, Busy[]>;
    weeklyHoursOf: (personId: string) => number;
    /** Why this officer cannot be deployed on this shift, or null. */
    blockerFor: (item: PlanItem) => string | null;
    now?: Date;
  },
): { accepted: PlanItem[]; refused: { item: PlanItem; reason: string }[] } {
  const now = ctx.now ?? new Date();
  const person = new Map([...ctx.busyByPerson].map(([k, v]) => [k, [...v]]));
  const post = new Map([...ctx.busyByPost].map(([k, v]) => [k, [...v]]));
  const accepted: PlanItem[] = [];
  const refused: { item: PlanItem; reason: string }[] = [];
  const sorted = [...items].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  for (const item of sorted) {
    const theirs = person.get(item.personId) ?? [];
    const onPost = post.get(item.postId) ?? [];
    let reason: string | null = null;
    if (item.endsAt <= now) reason = "That shift has finished.";
    if (!reason) reason = ctx.blockerFor(item);
    if (!reason) {
      const clash = clashWith(theirs, item);
      if (clash) reason = `Already on ${clash.label ?? "another shift"} then.`;
    }
    if (!reason && clashWith(onPost, item)) reason = "Somebody is already on this post then.";
    if (!reason) reason = hoursProblem(theirs, [item], ctx.weeklyHoursOf(item.personId));
    if (!reason) reason = restProblem(theirs, [item]);
    if (reason) {
      refused.push({ item, reason });
      continue;
    }
    accepted.push(item);
    const mine = { startsAt: item.startsAt, endsAt: item.endsAt, label: item.label ?? "another shift in this plan" };
    person.set(item.personId, [...theirs, mine]);
    post.set(item.postId, [...onPost, mine]);
  }
  return { accepted, refused };
}

/** The hours in each rota week of a span — the busiest one is what the limit is about. */
export function busiestWeek(shifts: Busy[], firstMonday: string, weeks: number): number {
  let most = 0;
  for (let w = 0; w < weeks; w++) {
    const m = addDays(firstMonday, 7 * w);
    most = Math.max(most, hoursWithin(shifts, ukInstant(m, "00:00"), ukInstant(addDays(m, 7), "00:00")));
  }
  return most;
}

// ---------------------------------------------------------------------------
// Creating the rota: open shifts, in bulk
// ---------------------------------------------------------------------------
//
// The rota is made first and filled second (Control, 24 September 2026):
// pick the posts, mark the dates from and to on a calendar, choose the days
// and the hours, and every one of those shifts is created at once, with
// nobody on it. Officers are assigned to them afterwards, by who is free.

/** The most one creation makes: a quarter of a year across a large site list. */
export const MAX_CREATE = 5000;
/** The longest range one creation covers. */
export const MAX_CREATE_DAYS = 93;

export interface ShiftTime {
  start: string;
  end: string;
}

/** Every UK date from one to another, both included. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The shifts a creation makes on one post: each chosen day in the range, at each time. */
export function slotsFor(args: { from: string; to: string; weekdays: number[]; times: ShiftTime[] }) {
  return datesBetween(args.from, args.to)
    .filter((d) => args.weekdays.includes(weekday(d)))
    .flatMap((date) => args.times.map((t) => ({ date, start: t.start, end: t.end, ...shiftWindow(date, t.start, t.end) })));
}

/** Why these shifts cannot be created, or null. Checked before anything is looked up. */
export function createProblem(args: { postIds: string[]; from: string; to: string; weekdays: number[]; times: ShiftTime[]; now?: Date }): string | null {
  const now = args.now ?? new Date();
  if (args.postIds.length === 0) return "Choose at least one post.";
  if (!isDate(args.from) || !isDate(args.to)) return "Mark the first and last day on the calendar.";
  if (args.to < args.from) return "The last day is before the first.";
  if (datesBetween(args.from, args.to).length > MAX_CREATE_DAYS) return `That is more than ${MAX_CREATE_DAYS} days. Create up to three months at a time.`;
  if (args.to < ukDate(now)) return "Those days have passed.";
  if (args.weekdays.length === 0) return "Choose at least one day of the week.";
  if (args.times.length === 0) return "Give at least one shift time.";
  for (const t of args.times) {
    if (!isTime(t.start) || !isTime(t.end) || t.start === t.end) return "Every shift needs a start and an end.";
    const h = hoursOf(shiftWindow("2026-01-05", t.start, t.end));
    if (h < 1 || h > 16) return `${t.start}–${t.end} is ${Math.round(h)} hours. A shift is between 1 and 16 hours.`;
  }
  // Two times that overlap — on the day, or across midnight into the next —
  // would put two shifts on one post at once.
  for (let i = 0; i < args.times.length; i++) {
    for (let j = i + 1; j < args.times.length; j++) {
      const a = shiftWindow("2026-01-06", args.times[i].start, args.times[i].end);
      const around = ["2026-01-05", "2026-01-06", "2026-01-07"].map((d) => shiftWindow(d, args.times[j].start, args.times[j].end));
      if (clashWith(around, a)) {
        return `${args.times[i].start}–${args.times[i].end} and ${args.times[j].start}–${args.times[j].end} overlap — one post takes one shift at a time.`;
      }
    }
  }
  const count = args.postIds.length * slotsFor(args).length;
  if (count > MAX_CREATE) return `That is ${count} shifts. Create up to ${MAX_CREATE} at a time.`;
  return null;
}

// ---------------------------------------------------------------------------
// Who is free
// ---------------------------------------------------------------------------

export interface Leave {
  startsAt: Date;
  endsAt: Date;
  approved: boolean;
}

/** Approved leave is unavailability; a request still waiting is a warning. */
export function leaveProblem(leave: Leave[], w: { startsAt: Date; endsAt: Date }): string | null {
  const on = leave.find((l) => l.approved && l.startsAt < w.endsAt && w.startsAt < l.endsAt);
  return on ? `On approved leave ${dayLabel(ukDate(on.startsAt))} to ${dayLabel(ukDate(new Date(on.endsAt.getTime() - 1)))}.` : null;
}

export function leavePending(leave: Leave[], w: { startsAt: Date; endsAt: Date }): boolean {
  return leave.some((l) => !l.approved && l.startsAt < w.endsAt && w.startsAt < l.endsAt);
}

/**
 * A first go at filling open shifts, for Control to look over before saving.
 * Each shift, in time order, goes to the first officer who can take it — the
 * post's regular officer, then anyone allocated to it, then whoever knows the
 * post best, then whoever has the fewest hours that week — checked the same
 * way as a typed entry, and against the suggestions already made.
 */
export function suggestOfficers(
  slots: { key: string; postId: string; startsAt: Date; endsAt: Date; label?: string }[],
  ctx: {
    officerIds: string[];
    busyByPerson: Map<string, Busy[]>;
    busyByPost: Map<string, Busy[]>;
    weeklyHoursOf: (personId: string) => number;
    blockerFor: (item: PlanItem) => string | null;
    /** Higher is asked first: regular, allocated, knows the post. */
    preference: (personId: string, postId: string) => number;
    now?: Date;
  },
): Map<string, string> {
  const out = new Map<string, string>();
  const person = new Map([...ctx.busyByPerson].map(([k, v]) => [k, [...v]]));
  const post = new Map([...ctx.busyByPost].map(([k, v]) => [k, [...v]]));
  const now = ctx.now ?? new Date();
  for (const slot of [...slots].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    if (slot.endsAt <= now || clashWith(post.get(slot.postId) ?? [], slot)) continue;
    const weekOf = mondayOf(ukDate(slot.startsAt));
    const from = ukInstant(weekOf, "00:00");
    const to = ukInstant(addDays(weekOf, 7), "00:00");
    const ranked = [...ctx.officerIds].sort(
      (a, b) =>
        ctx.preference(b, slot.postId) - ctx.preference(a, slot.postId) ||
        hoursWithin(person.get(a) ?? [], from, to) - hoursWithin(person.get(b) ?? [], from, to),
    );
    for (const id of ranked) {
      const theirs = person.get(id) ?? [];
      const item = { key: slot.key, postId: slot.postId, personId: id, startsAt: slot.startsAt, endsAt: slot.endsAt, label: slot.label };
      if (ctx.blockerFor(item) || clashWith(theirs, slot) || hoursProblem(theirs, [slot], ctx.weeklyHoursOf(id)) || restProblem(theirs, [slot])) continue;
      out.set(slot.key, id);
      const mine = { startsAt: slot.startsAt, endsAt: slot.endsAt, label: slot.label ?? "another suggested shift" };
      person.set(id, [...theirs, mine]);
      post.set(slot.postId, [...(post.get(slot.postId) ?? []), mine]);
      break;
    }
  }
  return out;
}
