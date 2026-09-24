/**
 * The candidate's own application — filled in through an emailed link, on
 * any device, without an account (HR, 25 September 2026). The rules, with no
 * database.
 *
 * Seven steps, saved as they go so they can stop and come back: about you,
 * where you have lived, what you have done (five years, gaps shown as they
 * type), right to work, next of kin, your documents, and the declarations
 * they sign. What they send lands in their screening file as the history the
 * screening team verifies — they do not type it in again.
 */

import { dayOf, dateOf, screeningWindow, uncovered, type HistoryKind, type Span } from "./history";

export const APPLICATION_STEPS = [
  { id: "about", title: "About you" },
  { id: "addresses", title: "Where you have lived" },
  { id: "history", title: "Your last five years" },
  { id: "right_to_work", title: "Right to work" },
  { id: "next_of_kin", title: "Next of kin" },
  { id: "documents", title: "Your documents" },
  { id: "declaration", title: "Check and sign" },
] as const;
export type StepId = (typeof APPLICATION_STEPS)[number]["id"];

/** How long an emailed link works, and when the candidate is reminded. */
export const INVITE_RULES = { validDays: 14, reminderAfterDays: [2, 5] as const } as const;

export interface AboutYou {
  fullName: string;
  previousNames: string;
  dateOfBirth: string;
  nationalInsurance: string;
  phone: string;
  email: string;
  address: string;
  postcode: string;
  siaLicence: string;
}

export interface AddressLine {
  address: string;
  postcode: string;
  from: string;
  /** Empty while they still live there. */
  to: string;
}

export interface HistoryLine {
  kind: HistoryKind;
  organisation: string;
  role: string;
  from: string;
  to: string;
  current: boolean;
  /** Who can confirm it: a manager, HR, a tutor. Contacted only once verified independently. */
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  /** For a current employer: may we contact them now [7.7b]. */
  mayContact: boolean | null;
  reasonForLeaving: string;
}

export interface RightToWork {
  route: "british_irish" | "share_code" | "";
  shareCode: string;
}

export interface NextOfKin {
  name: string;
  relation: string;
  phone: string;
}

export interface ApplicationDraft {
  about?: Partial<AboutYou>;
  addresses?: AddressLine[];
  history?: HistoryLine[];
  rightToWork?: Partial<RightToWork>;
  nextOfKin?: Partial<NextOfKin>;
  /** Steps they have finished, so the page reopens where they left off. */
  done?: StepId[];
}

/** The declarations they sign, word for word — kept with what they signed. */
export const DECLARATIONS = [
  {
    id: "authorise",
    text: "I authorise Leon Guarding to approach my former employers, education establishments, government departments and a credit reference agency to verify the information I have given, for the purpose of screening under BS 7858.",
  },
  {
    id: "true",
    text: "The information I have given is true and complete. I understand that a false statement, or leaving something out, may lead to my application being refused or my employment ending.",
  },
  {
    id: "data",
    text: "I understand my information is held and used to screen me for security employment, kept for as long as the law and BS 7858 require, and then securely destroyed.",
  },
] as const;

export const HISTORY_KINDS: { id: HistoryKind; label: string; needsContact: boolean }[] = [
  { id: "employment", label: "Employed", needsContact: true },
  { id: "self_employment", label: "Self-employed", needsContact: false },
  { id: "education", label: "In education", needsContact: true },
  { id: "unemployment", label: "Not working (claiming benefits)", needsContact: false },
  { id: "career_break", label: "Career break, caring or travelling", needsContact: false },
  { id: "residence_abroad", label: "Living abroad", needsContact: false },
];

const isDay = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const phoneOk = (v: string | undefined) => !!v && v.replace(/\D/g, "").length >= 10;
const emailOk = (v: string | undefined) => !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** The years the history has to cover: five, or ten where the client's contract says so, and never before 16. */
export function historyWindow(d: ApplicationDraft, today: string, years = 5): Span {
  const dob = d.about?.dateOfBirth && isDay(d.about.dateOfBirth) ? new Date(`${d.about.dateOfBirth}T00:00:00Z`) : null;
  return screeningWindow({ reference: new Date(`${today}T00:00:00Z`), dateOfBirth: dob, years });
}

/** Why this step cannot be saved as finished, or null. */
export function stepProblem(step: StepId, d: ApplicationDraft, today: string, years = 5): string | null {
  switch (step) {
    case "about": {
      const a = d.about ?? {};
      if (!a.fullName || a.fullName.trim().length < 3) return "Give your full name, as on your passport or ID.";
      if (!isDay(a.dateOfBirth)) return "Give your date of birth.";
      if (a.dateOfBirth! > today || a.dateOfBirth! < "1920-01-01") return "Check your date of birth.";
      if (!phoneOk(a.phone)) return "Give a phone number we can reach you on.";
      if (!emailOk(a.email)) return "Give an email address.";
      if (!a.address || a.address.trim().length < 5 || !a.postcode || a.postcode.trim().length < 5) return "Give your current address and postcode.";
      if (a.nationalInsurance && !/^[A-Za-z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-Da-d]$/.test(a.nationalInsurance.trim())) return "That does not look like a National Insurance number (e.g. QQ 12 34 56 C).";
      return null;
    }
    case "addresses": {
      const lines = d.addresses ?? [];
      if (lines.length === 0) return "Add where you live now, with the date you moved in.";
      for (const l of lines) {
        if (!l.address.trim() || !l.postcode.trim()) return "Every address needs the address and its postcode.";
        if (!isDay(l.from)) return "Every address needs the date you moved in.";
        if (l.to && (!isDay(l.to) || l.to < l.from)) return "Check the dates: you moved out before you moved in.";
      }
      if (!lines.some((l) => !l.to)) return "One address is where you live now — leave its 'moved out' date empty.";
      const gaps = addressGaps(lines, today);
      if (gaps.length) return `Your addresses leave ${describe(gaps[0])} unaccounted for. Add where you lived then.`;
      return null;
    }
    case "history": {
      const lines = d.history ?? [];
      if (lines.length === 0) return "Add what you have been doing for the last five years, starting with now.";
      for (const l of lines) {
        if (!isDay(l.from)) return "Every entry needs the date it started.";
        if (!l.current && !isDay(l.to)) return "Give the date each one ended, or tick that it is still going.";
        if (!l.current && l.to < l.from) return "Check the dates: one ends before it starts.";
        const spec = HISTORY_KINDS.find((k) => k.id === l.kind);
        if (!spec) return "Say what each period was.";
        if (spec.needsContact && !l.organisation.trim()) return "Give the employer, school or college for each one.";
        if (spec.needsContact && !l.contactName.trim()) return "Give someone who can confirm each employment or course — a manager, HR, or a tutor.";
        if (spec.needsContact && !phoneOk(l.contactPhone) && !emailOk(l.contactEmail)) return `Give a phone number or email for ${l.contactName || "the contact"}.`;
        if (l.current && l.kind === "employment" && l.mayContact === null) return "Say whether we may contact your current employer now.";
      }
      // BS 7858 asks for every day of the period; a gap over 31 days needs an entry [7.7].
      const gaps = historyGaps(lines, historyWindow(d, today, years));
      if (gaps.length) return `Your history leaves ${describe(gaps[0])} unaccounted for. Add what you were doing then — even if it was not working.`;
      return null;
    }
    case "right_to_work": {
      const r = d.rightToWork ?? {};
      if (r.route !== "british_irish" && r.route !== "share_code") return "Say how you have the right to work in the UK.";
      if (r.route === "share_code" && !/^[A-Za-z0-9]{3}\s?[A-Za-z0-9]{3}\s?[A-Za-z0-9]{3}$/.test((r.shareCode ?? "").trim())) return "Give your nine-character share code from gov.uk (e.g. W4B 7X2 9KP).";
      return null;
    }
    case "next_of_kin": {
      const k = d.nextOfKin ?? {};
      if (!k.name || k.name.trim().length < 2) return "Give your next of kin's name.";
      if (!k.relation?.trim()) return "Say how they are related to you.";
      if (!phoneOk(k.phone)) return "Give a phone number for them.";
      return null;
    }
    default:
      return null;
  }
}

/** The documents asked for, and which are needed before sending. */
export const REQUESTED_DOCUMENTS: { typeId: string; label: string; hint: string; required: boolean; needsDate: boolean }[] = [
  { typeId: "photo_id", label: "Photo ID", hint: "Passport or photocard driving licence — the photo page", required: true, needsDate: false },
  { typeId: "address_proof", label: "Proof of address", hint: "A bank statement, utility bill or council tax letter from the last 3 months", required: true, needsDate: true },
  { typeId: "right_to_work", label: "Right to work", hint: "Your passport, or the share-code result page", required: false, needsDate: false },
  { typeId: "sia_licence", label: "SIA licence", hint: "Both sides of your badge, if you have one", required: false, needsDate: false },
  { typeId: "cv", label: "CV", hint: "If you have one", required: false, needsDate: false },
];

/** Periods of the last five years no address covers. */
export function addressGaps(lines: AddressLine[], today: string, years = 5): Span[] {
  const end = dayOf(new Date(`${today}T00:00:00Z`));
  const start = dayOf(new Date(`${Number(today.slice(0, 4)) - years}${today.slice(4)}T00:00:00Z`));
  const spans = lines.filter((l) => isDay(l.from)).map((l) => ({ from: dayOf(new Date(`${l.from}T00:00:00Z`)), to: l.to && isDay(l.to) ? dayOf(new Date(`${l.to}T00:00:00Z`)) : end }));
  // A move is not a gap: the old address ends the day the new one starts, or the day before.
  return uncovered({ from: start, to: end }, spans.map((s) => ({ from: s.from - 1, to: s.to + 1 }))).filter((g) => g.to - g.from >= 2);
}

/** Periods of the screening window the history does not account for, over the 31 days BS 7858 allows [7.7]. */
export function historyGaps(lines: HistoryLine[], window: Span): Span[] {
  const spans = lines
    .filter((l) => isDay(l.from))
    .map((l) => ({ from: dayOf(new Date(`${l.from}T00:00:00Z`)), to: l.current || !l.to ? window.to : dayOf(new Date(`${l.to}T00:00:00Z`)) }));
  return uncovered(window, spans).filter((g) => g.to - g.from + 1 > 31);
}

/** "3 months, Jan–Mar 2023" — a gap as the candidate reads it. */
export function describe(g: Span): string {
  const from = dateOf(g.from);
  const to = dateOf(g.to);
  const days = g.to - g.from + 1;
  const len = days >= 60 ? `${Math.round(days / 30.4)} months` : `${days} days`;
  const f = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  return `${len} (${f(from)} to ${f(to)})`;
}

/** Everything needed before sending: every step finished, the required documents in, and every declaration ticked. */
export function submitProblem(d: ApplicationDraft, uploaded: string[], signedName: string, ticked: string[], today: string, years = 5): string | null {
  for (const s of APPLICATION_STEPS) {
    if (s.id === "documents" || s.id === "declaration") continue;
    const p = stepProblem(s.id, d, today, years);
    if (p) return `${s.title}: ${p}`;
  }
  const missing = REQUESTED_DOCUMENTS.filter((r) => r.required && !uploaded.includes(r.typeId));
  if (missing.length) return `Your documents: add your ${missing.map((m) => m.label.toLowerCase()).join(" and ")}.`;
  if (DECLARATIONS.some((x) => !ticked.includes(x.id))) return "Tick each declaration to confirm it.";
  const name = (d.about?.fullName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (signedName.trim().toLowerCase().replace(/\s+/g, " ") !== name) return "Type your full name exactly as you gave it, to sign.";
  return null;
}

/**
 * What the page sends, cleaned: only the fields there are, as strings of a
 * sensible length. The page is not trusted — anyone holding the link can post
 * anything to it.
 */
export function cleanDraft(input: unknown): ApplicationDraft {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  const kinds = HISTORY_KINDS.map((k) => k.id);
  const stepIds = APPLICATION_STEPS.map((s) => s.id) as string[];
  const about = obj(o.about);
  const rtw = obj(o.rightToWork);
  const nok = obj(o.nextOfKin);
  return {
    about: {
      fullName: str(about.fullName, 120),
      previousNames: str(about.previousNames, 200),
      dateOfBirth: str(about.dateOfBirth, 10),
      nationalInsurance: str(about.nationalInsurance, 13),
      phone: str(about.phone, 30),
      email: str(about.email, 120),
      address: str(about.address, 300),
      postcode: str(about.postcode, 10),
      siaLicence: str(about.siaLicence, 20),
    },
    addresses: (Array.isArray(o.addresses) ? o.addresses : []).slice(0, 20).map((a) => {
      const x = obj(a);
      return { address: str(x.address, 300), postcode: str(x.postcode, 10), from: str(x.from, 10), to: str(x.to, 10) };
    }),
    history: (Array.isArray(o.history) ? o.history : []).slice(0, 30).map((h) => {
      const x = obj(h);
      return {
        kind: (kinds.includes(x.kind as HistoryKind) ? x.kind : "employment") as HistoryKind,
        organisation: str(x.organisation, 150),
        role: str(x.role, 120),
        from: str(x.from, 10),
        to: str(x.to, 10),
        current: x.current === true,
        contactName: str(x.contactName, 120),
        contactPhone: str(x.contactPhone, 30),
        contactEmail: str(x.contactEmail, 120),
        mayContact: x.mayContact === true ? true : x.mayContact === false ? false : null,
        reasonForLeaving: str(x.reasonForLeaving, 300),
      };
    }),
    rightToWork: { route: rtw.route === "british_irish" || rtw.route === "share_code" ? rtw.route : "", shareCode: str(rtw.shareCode, 12) },
    nextOfKin: { name: str(nok.name, 120), relation: str(nok.relation, 60), phone: str(nok.phone, 30) },
    done: (Array.isArray(o.done) ? o.done : []).filter((s): s is StepId => typeof s === "string" && stepIds.includes(s)),
  };
}
