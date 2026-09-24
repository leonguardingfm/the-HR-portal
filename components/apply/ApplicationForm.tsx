"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormAction } from "@/components/ui/useFormAction";
import { removeApplicationDocument, saveApplication, submitApplication, uploadApplicationDocument } from "@/lib/actions/applicant";
import type { ActionResult } from "@/lib/actions/types";
import {
  APPLICATION_STEPS,
  DECLARATIONS,
  HISTORY_KINDS,
  REQUESTED_DOCUMENTS,
  addressGaps,
  describe,
  historyGaps,
  historyWindow,
  type AddressLine,
  type ApplicationDraft,
  type HistoryLine,
  type StepId,
} from "@/lib/core/application";

/**
 * The candidate's application, on their phone (HR, 25 September 2026). Seven
 * steps, saved as they type; gaps in their history shown as they happen, with
 * a button to fill each; documents photographed or picked; signed at the end.
 */

interface Upload {
  id: string;
  typeId: string;
  label: string;
  fileName: string;
  checked: boolean;
}

const field = "mt-1 h-12 w-full rounded-lg border px-3 text-[16px] outline-none focus:border-[var(--series-1)] focus:ring-2 focus:ring-[var(--series-1)]/30";
const fieldStyle = { background: "var(--surface-1)", borderColor: "var(--hairline)", color: "var(--text-primary)" } as const;
const big = "h-12 w-full rounded-lg px-4 text-[16px] font-semibold text-white disabled:opacity-60";

const emptyHistory = (from = "", to = ""): HistoryLine => ({ kind: "employment", organisation: "", role: "", from, to, current: false, contactName: "", contactPhone: "", contactEmail: "", mayContact: null, reasonForLeaving: "" });
const emptyAddress = (): AddressLine => ({ address: "", postcode: "", from: "", to: "" });

export function ApplicationForm({ token, company, role, years, today, expires, initial, uploads }: { token: string; company: string; role: string | null; years: number; today: string; expires: string; initial: ApplicationDraft; uploads: Upload[] }) {
  const [draft, setDraft] = useState<ApplicationDraft>(() => ({
    ...initial,
    addresses: initial.addresses?.length ? initial.addresses : [emptyAddress()],
    history: initial.history?.length ? initial.history : [{ ...emptyHistory(), current: true }],
  }));
  const [done, setDone] = useState<StepId[]>(initial.done ?? []);
  const [step, setStep] = useState<number>(() => {
    const first = APPLICATION_STEPS.findIndex((s) => !(initial.done ?? []).includes(s.id));
    return first === -1 ? APPLICATION_STEPS.length - 1 : first;
  });
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [saved, setSaved] = useState<"saved" | "saving" | "idle">("idle");
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  // Saved as they type, a moment after they stop.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaved("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const r = await saveApplication(token, { ...draft, done }, null);
      setSaved(r.ok ? "saved" : "idle");
      if (!r.ok) setNotice(r);
    }, 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const go = (i: number) => {
    setStep(i);
    setNotice(null);
    top.current?.scrollIntoView({ behavior: "smooth" });
  };

  const next = () =>
    start(async () => {
      const id = APPLICATION_STEPS[step].id;
      const r = await saveApplication(token, { ...draft, done }, id === "declaration" ? null : id);
      if (!r.ok) return setNotice(r);
      setDone(r.done ?? done);
      setSaved("saved");
      go(Math.min(step + 1, APPLICATION_STEPS.length - 1));
    });

  const set = useCallback(<K extends keyof ApplicationDraft>(k: K, v: ApplicationDraft[K]) => setDraft((d) => ({ ...d, [k]: v })), []);
  const current = APPLICATION_STEPS[step];

  if (sent) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16 text-center">
        <p className="text-[13px] font-semibold tracking-wide uppercase" style={{ color: "var(--series-1)" }}>
          {company}
        </p>
        <h1 className="mt-2 text-[24px] font-semibold">Thank you — it has been sent</h1>
        <p className="mt-3 text-[15px]" style={{ color: "var(--text-secondary)" }}>
          We have your application and documents. We will check them and be in touch about the next step.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 pt-6 pb-24">
      <div ref={top} className="scroll-mt-4">
        <p className="text-[13px] font-semibold tracking-wide uppercase" style={{ color: "var(--series-1)" }}>
          {company}
        </p>
        <h1 className="text-[22px] font-semibold tracking-tight">Your application</h1>
        <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
          {role ? `For ${role}. ` : ""}It saves as you go — you can close this and come back with the same link until {new Date(expires).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.
        </p>
      </div>

      <ol className="mt-4 flex gap-1" aria-label="Steps">
        {APPLICATION_STEPS.map((s, i) => {
          const isDone = done.includes(s.id);
          return (
            <li key={s.id} className="flex-1">
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === step ? "step" : undefined}
                title={s.title}
                className="h-2 w-full rounded-full"
                style={{ background: i === step ? "var(--series-1)" : isDone ? "var(--status-good)" : "var(--wash-neutral)" }}
              />
            </li>
          );
        })}
      </ol>
      <p className="mt-2 flex justify-between text-[13px]" style={{ color: "var(--text-secondary)" }}>
        <span>
          Step {step + 1} of {APPLICATION_STEPS.length}: <strong style={{ color: "var(--text-primary)" }}>{current.title}</strong>
        </span>
        <span>{saved === "saving" ? "Saving…" : saved === "saved" ? "✓ Saved" : ""}</span>
      </p>

      <section className="mt-5 space-y-4">
        {current.id === "about" && <About draft={draft} set={set} />}
        {current.id === "addresses" && <Addresses draft={draft} set={set} today={today} />}
        {current.id === "history" && <History draft={draft} set={set} today={today} years={years} />}
        {current.id === "right_to_work" && <RightToWorkStep draft={draft} set={set} />}
        {current.id === "next_of_kin" && <NextOfKinStep draft={draft} set={set} />}
        {current.id === "documents" && <Documents token={token} uploads={uploads} onResult={setNotice} />}
        {current.id === "declaration" && <Declaration token={token} draft={draft} uploads={uploads} onSent={() => setSent(true)} onResult={setNotice} />}
      </section>

      {notice && (
        <p role={notice.ok ? "status" : "alert"} className="mt-4 rounded-lg px-3 py-2.5 text-[15px]" style={{ background: notice.ok ? "var(--wash-good)" : "var(--wash-critical)", color: notice.ok ? undefined : "var(--status-critical)" }}>
          {notice.message}
        </p>
      )}

      {current.id !== "declaration" && (
        <div className="mt-6 flex gap-3">
          {step > 0 && (
            <button type="button" onClick={() => go(step - 1)} className="h-12 rounded-lg border px-4 text-[16px]" style={{ borderColor: "var(--hairline)" }}>
              Back
            </button>
          )}
          <button type="button" onClick={next} disabled={pending} className={big} style={{ background: "var(--series-1)" }}>
            {pending ? "Checking…" : "Save and continue"}
          </button>
        </div>
      )}
    </main>
  );
}

type SetFn = <K extends keyof ApplicationDraft>(k: K, v: ApplicationDraft[K]) => void;

function Input({ label, hint, value, onChange, type = "text", autoComplete, inputMode }: { label: string; hint?: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; inputMode?: "text" | "tel" | "email" | "numeric" }) {
  return (
    <label className="block text-[14px] font-medium">
      {label}
      {hint && (
        <span className="block text-[13px] font-normal" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} inputMode={inputMode} className={field} style={fieldStyle} />
    </label>
  );
}

function About({ draft, set }: { draft: ApplicationDraft; set: SetFn }) {
  const a = draft.about ?? {};
  const up = (k: string) => (v: string) => set("about", { ...a, [k]: v });
  return (
    <>
      <Input label="Full name" hint="As on your passport or ID" value={a.fullName ?? ""} onChange={up("fullName")} autoComplete="name" />
      <Input label="Any previous names" hint="Maiden name, or a name you used before (optional)" value={a.previousNames ?? ""} onChange={up("previousNames")} />
      <Input label="Date of birth" type="date" value={a.dateOfBirth ?? ""} onChange={up("dateOfBirth")} autoComplete="bday" />
      <Input label="National Insurance number" hint="On your payslip or P60, e.g. QQ 12 34 56 C (optional if you do not have one yet)" value={a.nationalInsurance ?? ""} onChange={up("nationalInsurance")} />
      <Input label="Mobile phone" type="tel" value={a.phone ?? ""} onChange={up("phone")} autoComplete="tel" inputMode="tel" />
      <Input label="Email" type="email" value={a.email ?? ""} onChange={up("email")} autoComplete="email" inputMode="email" />
      <Input label="Current address" value={a.address ?? ""} onChange={up("address")} autoComplete="street-address" />
      <Input label="Postcode" value={a.postcode ?? ""} onChange={up("postcode")} autoComplete="postal-code" />
      <Input label="SIA licence number" hint="If you have one — 16 digits on your badge" value={a.siaLicence ?? ""} onChange={up("siaLicence")} inputMode="numeric" />
    </>
  );
}

function Gaps({ gaps, label, onFill }: { gaps: { from: number; to: number }[]; label: string; onFill: (g: { from: number; to: number }) => void }) {
  if (gaps.length === 0) {
    return (
      <p className="rounded-lg px-3 py-2 text-[14px]" style={{ background: "var(--wash-good)" }}>
        ✓ No gaps — every day is accounted for.
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border-2 px-3 py-2.5" style={{ borderColor: "var(--status-serious)" }}>
      <p className="text-[14px] font-semibold">{label}</p>
      {gaps.map((g) => (
        <div key={g.from} className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
          <span>{describe(g)}</span>
          <button type="button" onClick={() => onFill(g)} className="h-9 rounded-md border px-3 text-[14px] font-medium" style={{ borderColor: "var(--series-1)", color: "var(--series-1)" }}>
            Fill this gap
          </button>
        </div>
      ))}
    </div>
  );
}

const iso = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);

function Addresses({ draft, set, today }: { draft: ApplicationDraft; set: SetFn; today: string }) {
  const lines = draft.addresses ?? [];
  const gaps = useMemo(() => addressGaps(lines.filter((l) => l.from), today), [lines, today]);
  const up = (i: number, k: keyof AddressLine, v: string) => set("addresses", lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  return (
    <>
      <p className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
        Every address for the last five years, starting with where you live now. Leave “moved out” empty for your current address.
      </p>
      {lines.map((l, i) => (
        <fieldset key={i} className="space-y-2 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
          <legend className="px-1 text-[13px] font-semibold">{i === 0 ? "Where you live now" : `Address ${i + 1}`}</legend>
          <Input label="Address" value={l.address} onChange={(v) => up(i, "address", v)} />
          <Input label="Postcode" value={l.postcode} onChange={(v) => up(i, "postcode", v)} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Moved in" type="date" value={l.from} onChange={(v) => up(i, "from", v)} />
            <Input label="Moved out" type="date" value={l.to} onChange={(v) => up(i, "to", v)} />
          </div>
          {lines.length > 1 && (
            <button type="button" onClick={() => set("addresses", lines.filter((_, j) => j !== i))} className="text-[14px] underline" style={{ color: "var(--status-critical)" }}>
              Remove this address
            </button>
          )}
        </fieldset>
      ))}
      <button type="button" onClick={() => set("addresses", [...lines, emptyAddress()])} className="h-12 w-full rounded-lg border text-[16px] font-medium" style={{ borderColor: "var(--hairline)" }}>
        + Add an earlier address
      </button>
      {lines.some((l) => l.from) && <Gaps gaps={gaps} label="These dates are not covered by an address:" onFill={(g) => set("addresses", [...lines, { ...emptyAddress(), from: iso(g.from), to: iso(g.to) }])} />}
    </>
  );
}

function History({ draft, set, today, years }: { draft: ApplicationDraft; set: SetFn; today: string; years: number }) {
  const lines = draft.history ?? [];
  const gaps = useMemo(() => historyGaps(lines, historyWindow(draft, today, years)), [lines, draft, today, years]);
  const up = (i: number, patch: Partial<HistoryLine>) => set("history", lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <>
      <p className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
        What you have been doing for the last {years} years, starting with now — jobs, college, and times you were not working. Every period over a month needs an entry; we check each one, so give someone who can confirm it.
      </p>
      {lines.map((l, i) => {
        const spec = HISTORY_KINDS.find((k) => k.id === l.kind)!;
        return (
          <fieldset key={i} className="space-y-2 rounded-xl border p-3" style={{ borderColor: "var(--hairline)" }}>
            <legend className="px-1 text-[13px] font-semibold">{l.organisation || spec.label}</legend>
            <label className="block text-[14px] font-medium">
              What were you doing?
              <select value={l.kind} onChange={(e) => up(i, { kind: e.target.value as HistoryLine["kind"] })} className={field} style={fieldStyle}>
                {HISTORY_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            {(spec.needsContact || l.kind === "self_employment") && (
              <>
                <Input label={l.kind === "education" ? "School, college or university" : "Employer or business name"} value={l.organisation} onChange={(v) => up(i, { organisation: v })} />
                <Input label={l.kind === "education" ? "Course" : "Job title"} value={l.role} onChange={(v) => up(i, { role: v })} />
              </>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Input label="From" type="date" value={l.from} onChange={(v) => up(i, { from: v })} />
              {!l.current && <Input label="To" type="date" value={l.to} onChange={(v) => up(i, { to: v })} />}
            </div>
            <label className="flex items-center gap-2 text-[15px]">
              <input type="checkbox" checked={l.current} onChange={(e) => up(i, { current: e.target.checked, to: e.target.checked ? "" : l.to })} className="h-5 w-5" />
              I am still doing this
            </label>
            {spec.needsContact && (
              <div className="space-y-2 rounded-lg p-2.5" style={{ background: "var(--wash-neutral)" }}>
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  Someone who can confirm it — a manager, HR or a tutor. We find the organisation’s own number ourselves before we call.
                </p>
                <Input label="Their name" value={l.contactName} onChange={(v) => up(i, { contactName: v })} />
                <Input label="Their phone" type="tel" value={l.contactPhone} onChange={(v) => up(i, { contactPhone: v })} inputMode="tel" />
                <Input label="Their email" type="email" value={l.contactEmail} onChange={(v) => up(i, { contactEmail: v })} inputMode="email" />
              </div>
            )}
            {l.current && l.kind === "employment" && (
              <fieldset className="text-[15px]">
                <legend className="font-medium">May we contact this employer now?</legend>
                <label className="mr-4 inline-flex items-center gap-2">
                  <input type="radio" checked={l.mayContact === true} onChange={() => up(i, { mayContact: true })} className="h-5 w-5" /> Yes
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" checked={l.mayContact === false} onChange={() => up(i, { mayContact: false })} className="h-5 w-5" /> Not yet
                </label>
              </fieldset>
            )}
            {!l.current && l.kind === "employment" && <Input label="Why did you leave?" value={l.reasonForLeaving} onChange={(v) => up(i, { reasonForLeaving: v })} />}
            {lines.length > 1 && (
              <button type="button" onClick={() => set("history", lines.filter((_, j) => j !== i))} className="text-[14px] underline" style={{ color: "var(--status-critical)" }}>
                Remove this entry
              </button>
            )}
          </fieldset>
        );
      })}
      <button type="button" onClick={() => set("history", [...lines, emptyHistory()])} className="h-12 w-full rounded-lg border text-[16px] font-medium" style={{ borderColor: "var(--hairline)" }}>
        + Add an earlier period
      </button>
      {lines.some((l) => l.from) && (
        <Gaps gaps={gaps} label="These dates are not accounted for (over a month):" onFill={(g) => set("history", [...lines, { ...emptyHistory(iso(g.from), iso(g.to)), kind: "career_break" }])} />
      )}
    </>
  );
}

function RightToWorkStep({ draft, set }: { draft: ApplicationDraft; set: SetFn }) {
  const r = draft.rightToWork ?? {};
  return (
    <>
      <fieldset className="space-y-2 text-[15px]">
        <legend className="font-medium">How do you have the right to work in the UK?</legend>
        <label className="flex items-center gap-2 rounded-lg border p-3" style={{ borderColor: "var(--hairline)" }}>
          <input type="radio" checked={r.route === "british_irish"} onChange={() => set("rightToWork", { ...r, route: "british_irish" })} className="h-5 w-5" /> I am a British or Irish citizen — I will upload my passport
        </label>
        <label className="flex items-center gap-2 rounded-lg border p-3" style={{ borderColor: "var(--hairline)" }}>
          <input type="radio" checked={r.route === "share_code"} onChange={() => set("rightToWork", { ...r, route: "share_code" })} className="h-5 w-5" /> I have a share code from gov.uk
        </label>
      </fieldset>
      {r.route === "share_code" && (
        <>
          <Input label="Your share code" hint="Nine characters, e.g. W4B 7X2 9KP. Get one at gov.uk/prove-right-to-work" value={r.shareCode ?? ""} onChange={(v) => set("rightToWork", { ...r, shareCode: v.toUpperCase() })} />
        </>
      )}
    </>
  );
}

function NextOfKinStep({ draft, set }: { draft: ApplicationDraft; set: SetFn }) {
  const k = draft.nextOfKin ?? {};
  const up = (key: string) => (v: string) => set("nextOfKin", { ...k, [key]: v });
  return (
    <>
      <p className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
        Who we contact if something happens to you at work.
      </p>
      <Input label="Their name" value={k.name ?? ""} onChange={up("name")} />
      <Input label="How they are related to you" hint="e.g. wife, father, friend" value={k.relation ?? ""} onChange={up("relation")} />
      <Input label="Their phone" type="tel" value={k.phone ?? ""} onChange={up("phone")} inputMode="tel" />
    </>
  );
}

function Documents({ token, uploads, onResult }: { token: string; uploads: Upload[]; onResult: (r: ActionResult) => void }) {
  return (
    <>
      <p className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
        Take a clear photo of each, or choose a file. Photo ID and a proof of address are needed; the rest if you have them.
      </p>
      {REQUESTED_DOCUMENTS.map((r) => (
        <DocumentSlot key={r.typeId} token={token} spec={r} have={uploads.filter((u) => u.typeId === r.typeId)} onResult={onResult} />
      ))}
    </>
  );
}

function DocumentSlot({ token, spec, have, onResult }: { token: string; spec: (typeof REQUESTED_DOCUMENTS)[number]; have: Upload[]; onResult: (r: ActionResult) => void }) {
  const up = useFormAction(async (prev: ActionResult | null, data: FormData) => {
    const r = await uploadApplicationDocument(token, prev, data);
    onResult(r);
    return r;
  });
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-xl border p-3" style={{ borderColor: have.length ? "var(--status-good)" : spec.required ? "var(--status-serious)" : "var(--hairline)" }}>
      <p className="text-[15px] font-semibold">
        {have.length ? "✓ " : ""}
        {spec.label}
        {spec.required && !have.length && <span style={{ color: "var(--status-critical)" }}> · needed</span>}
      </p>
      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
        {spec.hint}
      </p>
      {have.map((u) => (
        <Remove key={u.id} token={token} u={u} onResult={onResult} />
      ))}
      <form {...up.form} className="space-y-2">
        <input type="hidden" name="typeId" value={spec.typeId} />
        <label className="flex h-12 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed text-[15px] font-medium" style={{ borderColor: "var(--hairline)" }}>
          {chosen ?? (have.length ? "Add another" : "Take a photo or choose a file")}
          <input type="file" name="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setChosen(e.target.files?.[0]?.name ?? null)} />
        </label>
        {spec.needsDate && chosen && (
          <label className="block text-[14px] font-medium">
            Date printed on it
            <input type="date" name="documentDate" required className={field} style={fieldStyle} />
          </label>
        )}
        {chosen && (
          <button type="submit" disabled={up.pending} className={big} style={{ background: "var(--series-1)" }}>
            {up.pending ? "Uploading…" : `Upload ${spec.label.toLowerCase()}`}
          </button>
        )}
      </form>
    </div>
  );
}

function Remove({ token, u, onResult }: { token: string; u: Upload; onResult: (r: ActionResult) => void }) {
  const rm = useFormAction(async (prev: ActionResult | null, data: FormData) => {
    const r = await removeApplicationDocument(token, u.id, prev, data);
    onResult(r);
    return r;
  });
  return (
    <form {...rm.form} className="flex items-center justify-between gap-2 text-[14px]">
      <span className="min-w-0 truncate">📎 {u.fileName}</span>
      {u.checked ? (
        <span style={{ color: "var(--status-good)" }}>Checked</span>
      ) : (
        <button type="submit" disabled={rm.pending} className="underline" style={{ color: "var(--status-critical)" }}>
          Remove
        </button>
      )}
    </form>
  );
}

function Declaration({ token, draft, uploads, onSent, onResult }: { token: string; draft: ApplicationDraft; uploads: Upload[]; onSent: () => void; onResult: (r: ActionResult) => void }) {
  const send = useFormAction(async (prev: ActionResult | null, data: FormData) => {
    const r = await submitApplication(token, prev, data);
    if (r.ok) onSent();
    else onResult(r);
    return r;
  });
  const a = draft.about ?? {};
  return (
    <form {...send.form} className="space-y-4">
      <div className="space-y-1 rounded-xl border p-3 text-[14px]" style={{ borderColor: "var(--hairline)" }}>
        <p className="font-semibold">Check what you are sending</p>
        <p>
          {a.fullName} · born {a.dateOfBirth} · {a.phone} · {a.email}
        </p>
        <p>
          {(draft.addresses ?? []).length} address{(draft.addresses ?? []).length === 1 ? "" : "es"} · {(draft.history ?? []).length} history entr{(draft.history ?? []).length === 1 ? "y" : "ies"} · {uploads.length} document{uploads.length === 1 ? "" : "s"}
        </p>
        <p>Next of kin: {draft.nextOfKin?.name || "—"}</p>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-[15px] font-semibold">Please confirm each of these</legend>
        {DECLARATIONS.map((d) => (
          <label key={d.id} className="flex items-start gap-3 text-[15px]">
            <input type="checkbox" name="declaration" value={d.id} className="mt-1 h-5 w-5 shrink-0" />
            <span>{d.text}</span>
          </label>
        ))}
      </fieldset>
      <label className="block text-[15px] font-medium">
        Type your full name to sign
        <input name="signedName" autoComplete="off" placeholder={a.fullName} className={field} style={fieldStyle} />
      </label>
      <button type="submit" disabled={send.pending} className={big} style={{ background: "var(--status-good)" }}>
        {send.pending ? "Sending…" : "Sign and send my application"}
      </button>
    </form>
  );
}
