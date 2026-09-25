"use client";

import { useState } from "react";
import { useFormAction } from "@/components/ui/useFormAction";
import { answerReference } from "@/lib/actions/references";
import type { ActionResult } from "@/lib/actions/types";

const field = "mt-1 h-11 w-full rounded-lg border px-3 text-[15px] outline-none focus:border-[var(--series-1)]";
const style = { background: "var(--surface-1)", borderColor: "var(--hairline)", color: "var(--text-primary)" } as const;

/**
 * A reference, in two minutes: the dates, the role, why they left, anything
 * that should be known — and a name typed to sign. What the individual stated
 * is shown, so the referee confirms or corrects rather than starting blank.
 */
export function RefereeForm({ token, company, person, kind, organisation, stated, referee }: { token: string; company: string; person: string; kind: string; organisation: string | null; stated: { from: string; to: string | null; role: string | null }; referee: string }) {
  const [done, setDone] = useState(false);
  const [confirms, setConfirms] = useState<"yes" | "no" | "">("");
  const send = useFormAction(async (prev: ActionResult | null, data: FormData) => {
    const r = await answerReference(token, prev, data);
    if (r.ok) setDone(true);
    return r;
  });
  if (done) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16 text-center">
        <h1 className="text-[22px] font-semibold">Thank you</h1>
        <p className="mt-3 text-[15px]" style={{ color: "var(--text-secondary)" }}>
          Your reference for {person} has been received.
        </p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <p className="text-[13px] font-semibold tracking-wide uppercase" style={{ color: "var(--accent-text)" }}>
        {company} · reference request
      </p>
      <h1 className="text-[22px] font-semibold">{person}</h1>
      <p className="mt-1 text-[15px]" style={{ color: "var(--text-secondary)" }}>
        {person} told us: {kind.toLowerCase()}
        {organisation ? ` at ${organisation}` : ""}, from {stated.from} to {stated.to ?? "now"}
        {stated.role ? `, as ${stated.role}` : ""}. Please confirm or correct it. They have consented to this request.
      </p>
      <form {...send.form} className="mt-5 space-y-4">
        <fieldset className="space-y-2 text-[15px]">
          <legend className="font-medium">Can you confirm they were with you?</legend>
          {(
            [
              ["yes", "Yes"],
              ["no", "No — I cannot confirm this"],
            ] as const
          ).map(([v, l]) => (
            <label key={v} className="flex items-center gap-2 rounded-lg border p-3" style={{ borderColor: "var(--hairline)" }}>
              <input type="radio" name="confirms" value={v} checked={confirms === v} onChange={() => setConfirms(v)} className="h-5 w-5" />
              {l}
            </label>
          ))}
        </fieldset>
        {confirms === "yes" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[14px] font-medium">
                From
                <input type="date" name="from" defaultValue={stated.from} required className={field} style={style} />
              </label>
              <label className="text-[14px] font-medium">
                To
                <input type="date" name="to" defaultValue={stated.to ?? ""} className={field} style={style} />
              </label>
            </div>
            <label className="block text-[14px] font-medium">
              Their role
              <input name="role" defaultValue={stated.role ?? ""} className={field} style={style} />
            </label>
            <label className="block text-[14px] font-medium">
              Why they left
              <input name="reason" className={field} style={style} />
            </label>
            <fieldset className="text-[15px]">
              <legend className="font-medium">Would you employ them again?</legend>
              {["Yes", "No", "Prefer not to say"].map((v) => (
                <label key={v} className="mr-4 inline-flex items-center gap-2">
                  <input type="radio" name="reemploy" value={v} className="h-5 w-5" /> {v}
                </label>
              ))}
            </fieldset>
          </>
        )}
        <label className="block text-[14px] font-medium">
          Anything we should know about their honesty or conduct?
          <textarea name="concerns" rows={3} placeholder="Leave empty if there is nothing" className={`${field} h-auto py-2`} style={style} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[14px] font-medium">
            Your name
            <input name="name" defaultValue={referee} required className={field} style={style} />
          </label>
          <label className="text-[14px] font-medium">
            Your position
            <input name="position" required className={field} style={style} />
          </label>
        </div>
        <label className="block text-[14px] font-medium">
          Type your name to sign
          <input name="signed" required autoComplete="off" className={field} style={style} />
        </label>
        <button type="submit" disabled={send.pending || !confirms} className="h-12 w-full rounded-lg text-[16px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--series-1)" }}>
          {send.pending ? "Sending…" : "Send the reference"}
        </button>
        {send.state && !send.state.ok && (
          <p role="alert" className="text-[14px]" style={{ color: "var(--critical-text)" }}>
            {send.state.message}
          </p>
        )}
      </form>
    </main>
  );
}
