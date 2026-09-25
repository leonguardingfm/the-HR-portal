/**
 * The Performance hub's rules (Control, 25 September 2026): what the
 * categories, priorities, statuses and outcomes are, how the three clocks run,
 * and how an email is sorted when no AI is available. Pure — the sweep, the
 * pages, the actions and the tests share them.
 *
 * The clocks, as agreed:
 *   Critical, Very high, High — accepted in 3 min, acted on in 15, an update
 *     every 30 while open.
 *   Medium — 30 min, 4 hours, an update every working day.
 *   Low — 8 hours, one working day, an update every working day.
 * Warnings come at two thirds of each (2 of 3 minutes, 10 of 15). Mailboxes
 * that keep office hours (HR, Accounts) stop their clocks outside them; the
 * Control Room's run round the clock. All of it can be changed by management.
 */

import { addDays, ukDate, ukInstant, weekday } from "./rota";

export type HubCategory =
  | "compliance"
  | "complaint"
  | "lateness"
  | "job_renewal"
  | "cover_request"
  | "shift_cancellation"
  | "incident"
  | "client_request"
  | "officer_query"
  | "hr_matter"
  | "rtw_sia_expiry"
  | "invoice_accounts"
  | "other";
export type HubPriority = "critical" | "very_high" | "high" | "medium" | "low";
export type HubStatus =
  | "unassigned"
  | "accepted"
  | "in_progress"
  | "awaiting_information"
  | "awaiting_client"
  | "awaiting_officer"
  | "escalated"
  | "completed"
  | "unsuccessful"
  | "cancelled";
export type HubOutcome =
  | "successful"
  | "unsuccessful"
  | "cancelled_by_client"
  | "cancelled_by_leon"
  | "dropped_by_leon"
  | "dropped_by_client"
  | "no_action_required"
  | "duplicate_or_mistake";
export type HubSource = "outlook" | "manual" | "phone" | "whatsapp" | "other";
export type HubDepartment = "control" | "recruitment" | "administration";
/** The five colours of the hub. Never used alone: always with words and an icon. */
export type Tone = "red" | "amber" | "blue" | "green" | "grey";

export const CATEGORIES: { id: HubCategory; label: string }[] = [
  { id: "incident", label: "Incident" },
  { id: "complaint", label: "Complaint" },
  { id: "lateness", label: "Lateness" },
  { id: "cover_request", label: "Cover request" },
  { id: "shift_cancellation", label: "Shift cancellation" },
  { id: "client_request", label: "Client request" },
  { id: "officer_query", label: "Officer query" },
  { id: "compliance", label: "Compliance" },
  { id: "rtw_sia_expiry", label: "Right to work / SIA expiry" },
  { id: "hr_matter", label: "HR matter" },
  { id: "job_renewal", label: "Job renewal" },
  { id: "invoice_accounts", label: "Invoice or accounts" },
  { id: "other", label: "Other" },
];
export const categoryLabel = (c: string) => CATEGORIES.find((x) => x.id === c)?.label ?? c;

export const PRIORITIES: { id: HubPriority; label: string; tone: Tone; icon: string; rank: number }[] = [
  { id: "critical", label: "Critical", tone: "red", icon: "‼", rank: 0 },
  { id: "very_high", label: "Very high", tone: "red", icon: "▲▲", rank: 1 },
  { id: "high", label: "High", tone: "amber", icon: "▲", rank: 2 },
  { id: "medium", label: "Medium", tone: "blue", icon: "■", rank: 3 },
  { id: "low", label: "Low", tone: "grey", icon: "▼", rank: 4 },
];
export const priorityOf = (p: string) => PRIORITIES.find((x) => x.id === p) ?? PRIORITIES[3];

export const STATUSES: { id: HubStatus; label: string; tone: Tone; icon: string }[] = [
  { id: "unassigned", label: "Unassigned", tone: "amber", icon: "○" },
  { id: "accepted", label: "Accepted", tone: "blue", icon: "◐" },
  { id: "in_progress", label: "In progress", tone: "blue", icon: "◑" },
  { id: "awaiting_information", label: "Awaiting information", tone: "amber", icon: "⏸" },
  { id: "awaiting_client", label: "Awaiting client", tone: "amber", icon: "⏸" },
  { id: "awaiting_officer", label: "Awaiting officer", tone: "amber", icon: "⏸" },
  { id: "escalated", label: "Escalated", tone: "red", icon: "⤴" },
  { id: "completed", label: "Completed", tone: "green", icon: "✓" },
  { id: "unsuccessful", label: "Unsuccessful", tone: "red", icon: "✕" },
  { id: "cancelled", label: "Cancelled", tone: "grey", icon: "–" },
];
export const statusOf = (s: string) => STATUSES.find((x) => x.id === s) ?? STATUSES[0];

export const WAITING: HubStatus[] = ["awaiting_information", "awaiting_client", "awaiting_officer"];
export const IN_HAND: HubStatus[] = ["accepted", "in_progress", "escalated", ...WAITING];
export const CLOSED: HubStatus[] = ["completed", "unsuccessful", "cancelled"];
export const isOpen = (s: string) => !CLOSED.includes(s as HubStatus);

export const OUTCOMES: { id: HubOutcome; label: string; status: "completed" | "unsuccessful" | "cancelled"; explain: boolean; tone: Tone }[] = [
  { id: "successful", label: "Successful", status: "completed", explain: false, tone: "green" },
  { id: "unsuccessful", label: "Unsuccessful", status: "unsuccessful", explain: true, tone: "red" },
  { id: "cancelled_by_client", label: "Cancelled by client", status: "cancelled", explain: true, tone: "grey" },
  { id: "cancelled_by_leon", label: "Cancelled by Leon", status: "cancelled", explain: true, tone: "grey" },
  { id: "dropped_by_leon", label: "Dropped by Leon", status: "unsuccessful", explain: true, tone: "red" },
  { id: "dropped_by_client", label: "Dropped by client", status: "cancelled", explain: true, tone: "grey" },
  { id: "no_action_required", label: "No action required", status: "completed", explain: false, tone: "grey" },
  { id: "duplicate_or_mistake", label: "Duplicate or entered by mistake", status: "cancelled", explain: false, tone: "grey" },
];
export const outcomeOf = (o: string) => OUTCOMES.find((x) => x.id === o);

export const SOURCES: { id: HubSource; label: string }[] = [
  { id: "outlook", label: "Outlook email" },
  { id: "manual", label: "Manual entry" },
  { id: "phone", label: "Telephone" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "other", label: "Other" },
];
export const sourceLabel = (s: string) => SOURCES.find((x) => x.id === s)?.label ?? s;

export const DEPARTMENTS: { id: HubDepartment; label: string }[] = [
  { id: "control", label: "Control Room" },
  { id: "recruitment", label: "HR" },
  { id: "administration", label: "Accounts & Admin" },
];
export const departmentLabel = (d: string) => DEPARTMENTS.find((x) => x.id === d)?.label ?? d;

/** A task's reference: EM- for an email, TK- for anything logged by hand. */
export const taskRef = (t: { number: number; source: string }) => `${t.source === "outlook" ? "EM" : "TK"}-${t.number}`;

// ---------------------------------------------------------------------------
// The clocks
// ---------------------------------------------------------------------------

export type Span = { minutes: number } | { workingDays: number };
export type Clock = "accept" | "action" | "update";
export type SlaPolicy = Record<HubPriority, Record<Clock, Span>>;

const FAST = { accept: { minutes: 3 }, action: { minutes: 15 }, update: { minutes: 30 } };
export const SLA_DEFAULTS: SlaPolicy = {
  critical: FAST,
  very_high: FAST,
  high: FAST,
  medium: { accept: { minutes: 30 }, action: { minutes: 240 }, update: { workingDays: 1 } },
  low: { accept: { minutes: 480 }, action: { workingDays: 1 }, update: { workingDays: 1 } },
};

/** Office hours for the mailboxes that keep them: Monday to Friday, 09:00–17:00 UK time. */
export const OFFICE_HOURS = { start: "09:00", end: "17:00", weekdays: [0, 1, 2, 3, 4] };
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const officeDayMinutes = () => minutesOf(OFFICE_HOURS.end) - minutesOf(OFFICE_HOURS.start);

/** "3m", "4h", "1wd" — how a span is written in settings. */
export function parseSpan(v: string): Span | null {
  const m = /^(\d+(?:\.\d+)?)(m|h|wd)$/.exec(v.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n > 0)) return null;
  return m[2] === "wd" ? { workingDays: n } : { minutes: m[2] === "h" ? n * 60 : n };
}
export const spanText = (s: Span) => ("workingDays" in s ? `${s.workingDays} working day${s.workingDays === 1 ? "" : "s"}` : s.minutes >= 60 && s.minutes % 60 === 0 ? `${s.minutes / 60} hour${s.minutes === 60 ? "" : "s"}` : `${s.minutes} min`);

/** How long a span is, in the minutes its clock counts. A working day is a whole day round the clock. */
export function spanMinutes(s: Span, officeHours: boolean): number {
  return "minutes" in s ? s.minutes : s.workingDays * (officeHours ? officeDayMinutes() : 24 * 60);
}

/** The moment a number of clock minutes after a start — counting only office time where the mailbox keeps office hours. */
export function addClockMinutes(start: Date, minutes: number, officeHours: boolean): Date {
  if (!officeHours) return new Date(start.getTime() + minutes * 60_000);
  let t = start;
  let left = minutes;
  for (let guard = 0; guard < 800; guard++) {
    const d = ukDate(t);
    const open = ukInstant(d, OFFICE_HOURS.start);
    const close = ukInstant(d, OFFICE_HOURS.end);
    if (!OFFICE_HOURS.weekdays.includes(weekday(d)) || t >= close) {
      t = ukInstant(addDays(d, 1), OFFICE_HOURS.start);
      continue;
    }
    if (t < open) t = open;
    const available = (close.getTime() - t.getTime()) / 60_000;
    if (left <= available) return new Date(t.getTime() + left * 60_000);
    left -= available;
    t = ukInstant(addDays(d, 1), OFFICE_HOURS.start);
  }
  return t;
}

export function addSpan(start: Date, s: Span, officeHours: boolean): Date {
  return addClockMinutes(start, spanMinutes(s, officeHours), officeHours);
}

/** Warnings come at two thirds of a clock: 2 of 3 minutes, 10 of 15. */
export function warnAt(start: Date, s: Span, officeHours: boolean): Date {
  return addClockMinutes(start, (spanMinutes(s, officeHours) * 2) / 3, officeHours);
}

/** The accept and action deadlines, and when each warns — all from the moment it arrived. */
export function clocksFor(receivedAt: Date, priority: HubPriority, officeHours: boolean, policy: SlaPolicy = SLA_DEFAULTS) {
  const p = policy[priority];
  return {
    ackDueAt: addSpan(receivedAt, p.accept, officeHours),
    ackWarnAt: warnAt(receivedAt, p.accept, officeHours),
    actionDueAt: addSpan(receivedAt, p.action, officeHours),
    actionWarnAt: warnAt(receivedAt, p.action, officeHours),
  };
}

export function nextUpdateDue(from: Date, priority: HubPriority, officeHours: boolean, policy: SlaPolicy = SLA_DEFAULTS): Date {
  return addSpan(from, policy[priority].update, officeHours);
}

export interface ClockInput {
  status: string;
  priority: HubPriority;
  receivedAt: Date;
  ackDueAt: Date;
  actionDueAt: Date;
  updateDueAt: Date | null;
  followUpAt: Date | null;
  firstActionAt: Date | null;
  withinSla: boolean | null;
  breaches: number;
}

export interface ClockView {
  clock: Clock | "follow_up" | "closed";
  label: string;
  dueAt: Date | null;
  state: "ok" | "warning" | "breached" | "waiting" | "done" | "late";
}

/**
 * The clock that matters now: an unowned email is racing its accept deadline;
 * an owned one with nothing done, its action deadline; after that, the next
 * update — or, while waiting on someone, the follow-up.
 */
export function currentClock(t: ClockInput, now: Date, officeHours: boolean, policy: SlaPolicy = SLA_DEFAULTS): ClockView {
  if (CLOSED.includes(t.status as HubStatus)) return { clock: "closed", label: t.withinSla === false || t.breaches > 0 ? "Outside SLA" : "Within SLA", dueAt: null, state: t.withinSla === false || t.breaches > 0 ? "late" : "done" };
  const p = policy[t.priority];
  if (t.status === "unassigned") {
    const warn = warnAt(t.receivedAt, p.accept, officeHours);
    return { clock: "accept", label: "Accept", dueAt: t.ackDueAt, state: now >= t.ackDueAt ? "breached" : now >= warn ? "warning" : "ok" };
  }
  if (!t.firstActionAt) {
    const warn = warnAt(t.receivedAt, p.action, officeHours);
    return { clock: "action", label: "Action", dueAt: t.actionDueAt, state: now >= t.actionDueAt ? "breached" : now >= warn ? "warning" : "ok" };
  }
  if (WAITING.includes(t.status as HubStatus) && t.followUpAt && now < t.followUpAt) {
    return { clock: "follow_up", label: "Follow up", dueAt: t.followUpAt, state: "waiting" };
  }
  const due = t.updateDueAt;
  if (!due) return { clock: "update", label: "Update", dueAt: null, state: "ok" };
  const warnFrom = new Date(due.getTime() - (spanMinutes(p.update, officeHours) / 3) * 60_000);
  return { clock: "update", label: "Update", dueAt: due, state: now >= due ? "breached" : now >= warnFrom ? "warning" : "ok" };
}

/** "4m 12s", "2h 5m", "3 days" — how long until, or since. */
export function spanWords(ms: number): string {
  const s = Math.max(0, Math.round(Math.abs(ms) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 10) return `${m}m ${s % 60}s`;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h${m % 60 ? ` ${m % 60}m` : ""}`;
  return `${Math.floor(h / 24)} days`;
}

// ---------------------------------------------------------------------------
// What each change must say
// ---------------------------------------------------------------------------

export function waitingProblem(d: { status: string; reason: string; waitingFor: string; followUpAt: Date | null; evidence: string }, now: Date): string | null {
  if (!WAITING.includes(d.status as HubStatus)) return "Choose what it is waiting for.";
  if (d.reason.trim().length < 3) return "Say why it is waiting.";
  if (d.waitingFor.trim().length < 2) return "Say who it is waiting on — the person or organisation.";
  if (!d.followUpAt) return "Give the next follow-up date and time.";
  if (d.followUpAt <= now) return "The follow-up is in the future.";
  if (d.evidence.trim().length < 3) return "Say what was done last to chase it — the evidence of the last follow-up.";
  return null;
}

/**
 * Closing needs an outcome; an unsuccessful, cancelled or dropped one — or any
 * task that went over its time — needs the reason and the corrective action.
 */
export function closeProblem(d: { outcome: string; reason: string; corrective: string; breaches: number }): string | null {
  const o = outcomeOf(d.outcome);
  if (!o) return "Choose the outcome.";
  if (o.explain || d.breaches > 0) {
    const why = o.explain ? `“${o.label}”` : "A task that went over its time";
    if (d.reason.trim().length < 3) return `${why} needs the reason.`;
    if (d.corrective.trim().length < 3) return `${why} needs the corrective action — what stops it happening again.`;
  }
  return null;
}

/** Needs someone's eye now: critical and unowned, over time, the AI unsure, escalated, or its owner gone off shift. */
export function needsAttention(t: { status: string; priority: string; needsReview: boolean; handoverNeededAt: Date | null } & ClockInput, now: Date, officeHours: boolean): boolean {
  if (!isOpen(t.status)) return false;
  if (t.status === "unassigned" && (t.priority === "critical" || t.priority === "very_high")) return true;
  if (t.status === "escalated" || t.needsReview || t.handoverNeededAt) return true;
  return currentClock(t, now, officeHours).state === "breached";
}

// ---------------------------------------------------------------------------
// Sorting an email without AI: rules. Only ever a suggestion, and marked for
// review unless the words leave little doubt. Nothing is invented: the summary
// is the email's own opening, and names are matched against records elsewhere.
// ---------------------------------------------------------------------------

const has = (text: string, words: string[]) => words.filter((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(text));

const CRITICAL_WORDS = ["fire", "ambulance", "police", "999", "stabbed", "knife", "weapon", "assaulted", "assault", "attacked", "violence", "violent", "threatened", "threat to", "unconscious", "collapsed", "medical emergency", "seriously injured", "safeguarding", "missing officer", "site unmanned", "no one on site", "nobody on site", "data breach", "explosion", "bomb", "suspicious package"];
const VERY_HIGH_WORDS = ["no show", "no-show", "not turned up", "didn't turn up", "did not turn up", "hasn't arrived", "has not arrived", "non-attendance", "uncovered", "no cover", "urgent", "urgently", "immediately", "asap", "serious complaint", "unacceptable", "expired", "left site", "abandoned", "service failure"];
const HIGH_WORDS = ["cover", "cancel", "cancellation", "complaint", "deadline", "not been paid", "underpaid", "payroll", "welfare", "by tomorrow", "by end of day", "today"];
const LOW_WORDS = ["newsletter", "unsubscribe", "webinar", "promotion", "special offer", "marketing", "for information", "fyi", "no action required", "no action needed"];

const CATEGORY_WORDS: Record<Exclude<HubCategory, "other">, string[]> = {
  incident: ["incident", "assault", "assaulted", "fire", "police", "ambulance", "injured", "injury", "theft", "stolen", "break-in", "break in", "intruder", "trespass", "damage", "alarm activation", "fight"],
  complaint: ["complaint", "complain", "unhappy", "unacceptable", "dissatisfied", "poor service", "rude", "not good enough", "disappointed"],
  lateness: ["late", "lateness", "running late", "not turned up", "no show", "no-show", "didn't turn up", "did not turn up", "hasn't arrived", "has not arrived", "non-attendance"],
  cover_request: ["cover", "additional officer", "extra officer", "additional cover", "relief officer", "need an officer", "need officers", "extra guard"],
  shift_cancellation: ["cancel", "cancelled", "cancellation", "shift cancellation", "not required", "stand down", "no longer need", "no longer required"],
  job_renewal: ["contract renewal", "renewal for", "renew the contract", "renew our contract", "contract extension", "extend the contract", "re-tender", "retender", "proposal"],
  compliance: ["audit", "compliance", "insurance", "certificate", "bs 7858", "bs7858", "accreditation", "iso", "policy", "inspection", "acs"],
  rtw_sia_expiry: ["sia licence", "sia license", "sia badge", "right to work", "share code", "visa", "brp", "licence expir", "license expir", "licence renewal", "license renewal", "expires"],
  invoice_accounts: ["invoice", "payment", "remittance", "statement", "purchase order", "po number", "credit note", "accounts", "overdue balance"],
  hr_matter: ["holiday", "annual leave", "sickness", "sick note", "fit note", "grievance", "disciplinary", "payslip", "p45", "p60", "resignation", "resign", "maternity", "training", "not been paid", "overtime", "underpaid", "payroll", "my pay"],
  officer_query: ["my shift", "my rota", "my hours", "uniform", "my pay", "can i swap", "swap shifts"],
  client_request: ["could you", "can you please", "please arrange", "site instruction", "key holding", "keyholding", "additional patrol"],
};

const CATEGORY_DEPARTMENT: Record<HubCategory, HubDepartment | null> = {
  incident: "control",
  complaint: "control",
  lateness: "control",
  cover_request: "control",
  shift_cancellation: "control",
  client_request: "control",
  officer_query: "control",
  compliance: null,
  rtw_sia_expiry: "recruitment",
  hr_matter: "recruitment",
  job_renewal: "administration",
  invoice_accounts: "administration",
  other: null,
};

const REQUIRED_ACTION: Record<HubCategory, string> = {
  incident: "Establish what happened and that everyone is safe; inform the client and log the incident.",
  complaint: "Acknowledge the complaint, investigate, and reply with what is being done.",
  lateness: "Contact the officer, confirm arrival time, and tell the client if the post is affected.",
  cover_request: "Check the rota for a suitable officer, arrange cover and confirm to the client.",
  shift_cancellation: "Take the shift off the rota, tell the officer, and confirm to the client.",
  job_renewal: "Check the current terms and pass to the account owner to respond.",
  compliance: "Identify the document or evidence asked for and the deadline, then supply it.",
  rtw_sia_expiry: "Check the expiry date and whether it affects deployment; request the renewed document.",
  invoice_accounts: "Check the invoice or payment against the account and respond.",
  hr_matter: "Pass to the right HR person and acknowledge the sender.",
  officer_query: "Answer the officer's question or pass it to whoever can.",
  client_request: "Confirm what the client needs and when, arrange it, and reply.",
  other: "Read and decide what is needed.",
};

export interface Classification {
  category: HubCategory;
  priority: HubPriority;
  confidence: number;
  reasons: string[];
  summary: string;
  requiredAction: string;
  department: HubDepartment | null;
  uncertain: boolean;
}

/** The email's own first sentence or two — never a paraphrase. */
export function openingOf(body: string, max = 240): string {
  const text = body
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    // Greetings are not the message: "Hi Control,", "Dear team," or just "Control,".
    .filter((l, i) => l && !/^(hi|hello|dear|good (morning|afternoon|evening))\b[^.]{0,40}[,!]?$/i.test(l) && !(i === 0 && /^[\w .'-]{1,30},$/.test(l)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let out = "";
  for (const s of sentences) {
    if ((out + s).length > max) break;
    out += s;
    if (out.length > max * 0.5) break;
  }
  return (out || text.slice(0, max)).trim();
}

export function classifyByRules(subject: string, body: string): Classification {
  const text = `${subject}\n${body}`.toLowerCase();
  const reasons: string[] = [];
  const scores = (Object.keys(CATEGORY_WORDS) as Exclude<HubCategory, "other">[]).map((c) => {
    const hits = has(text, CATEGORY_WORDS[c]);
    // A word in the subject counts double: it is what the sender chose to lead with.
    const inSubject = has(subject.toLowerCase(), CATEGORY_WORDS[c]).length;
    // "Could you please…" is how most requests are phrased, so it counts for less than a specific word.
    const weight = c === "client_request" ? 0.5 : 1;
    return { c, score: (hits.length + inSubject) * weight, hits };
  });
  // On a tie the more specific category wins: "SIA licence renewal" is an expiry, not a contract renewal.
  const SPECIFIC: HubCategory[] = ["incident", "rtw_sia_expiry", "lateness", "shift_cancellation", "cover_request", "complaint", "invoice_accounts", "hr_matter", "compliance", "officer_query", "job_renewal", "client_request"];
  scores.sort((a, b) => b.score - a.score || SPECIFIC.indexOf(a.c) - SPECIFIC.indexOf(b.c));
  const top = scores[0];
  const tie = scores[1] && scores[1].score === top.score && top.score > 0 && Math.abs(SPECIFIC.indexOf(scores[1].c) - SPECIFIC.indexOf(top.c)) > 6;
  const category: HubCategory = top.score > 0 ? top.c : "other";
  if (top.score > 0) reasons.push(`Mentions ${top.hits.slice(0, 3).map((h) => `“${h}”`).join(", ")}`);

  const critical = has(text, CRITICAL_WORDS);
  const veryHigh = has(text, VERY_HIGH_WORDS);
  const high = has(text, HIGH_WORDS);
  const low = has(text, LOW_WORDS);
  let priority: HubPriority = "medium";
  if (critical.length) {
    priority = "critical";
    reasons.push(`Critical words: ${critical.slice(0, 3).map((h) => `“${h}”`).join(", ")}`);
  } else if (veryHigh.length) {
    priority = "very_high";
    reasons.push(`Urgent words: ${veryHigh.slice(0, 3).map((h) => `“${h}”`).join(", ")}`);
  } else if (high.length || ["cover_request", "shift_cancellation", "complaint", "incident", "lateness"].includes(category)) {
    priority = "high";
  } else if (low.length) {
    priority = "low";
    reasons.push(`Looks informational: ${low.slice(0, 2).map((h) => `“${h}”`).join(", ")}`);
  }
  const confidence = category === "other" ? 0.3 : Math.min(0.85, 0.5 + 0.12 * top.score) - (tie ? 0.2 : 0);
  return {
    category,
    priority,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
    summary: openingOf(body),
    requiredAction: REQUIRED_ACTION[category],
    department: CATEGORY_DEPARTMENT[category],
    uncertain: category === "other" || !!tie,
  };
}

export const requiredActionFor = (c: HubCategory) => REQUIRED_ACTION[c];
export const departmentFor = (c: HubCategory) => CATEGORY_DEPARTMENT[c];

/** Below this, the AI's (or the rules') answer is marked for a person to check. */
export const REVIEW_BELOW = 0.75;

/** Where the critical words disagree with the AI, safety wins: Critical until a person says otherwise. */
export function criticalWordsIn(subject: string, body: string): string[] {
  return has(`${subject}\n${body}`.toLowerCase(), CRITICAL_WORDS);
}

/** Roles, by the department whose mailbox they work. */
export const DEPARTMENT_ROLES: Record<HubDepartment, string[]> = {
  control: ["control", "shift_supervisor", "operations_manager"],
  recruitment: ["recruitment", "recruitment_manager", "vetting_admin", "vetting_controller"],
  administration: ["admin_officer", "admin_manager", "finance_officer"],
};
/** Who is alerted when an email waits too long for an owner or its action. */
export const SUPERVISOR_ROLES: Record<HubDepartment, string[]> = {
  control: ["shift_supervisor"],
  recruitment: ["recruitment_manager"],
  administration: ["admin_manager"],
};
/** The "relevant manager" a critical email is also sent to. */
export const MANAGER_ROLE: Record<HubDepartment, string> = {
  control: "operations_manager",
  recruitment: "recruitment_manager",
  administration: "admin_manager",
};

export function departmentsOf(role: string): HubDepartment[] {
  if (role === "top_management" || role === "auditor") return ["control", "recruitment", "administration"];
  return (Object.keys(DEPARTMENT_ROLES) as HubDepartment[]).filter((d) => DEPARTMENT_ROLES[d].includes(role));
}
