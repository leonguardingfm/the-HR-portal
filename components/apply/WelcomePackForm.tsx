"use client";

import { useState } from "react";
import { useFormAction } from "@/components/ui/useFormAction";
import { submitWelcomePack } from "@/lib/actions/applicant";
import type { ActionResult } from "@/lib/actions/types";
import { WELCOME_ACKS } from "@/lib/core/welcome";

const box = "rounded-lg border p-4";
const inputCls = "mt-1 h-12 w-full rounded-md border px-3 text-[16px]";
const inputStyle = { background: "var(--surface-1)", borderColor: "var(--hairline)", color: "var(--text-primary)" } as const;

/**
 * The welcome pack, on a phone: read, tick each part, give a next of kin,
 * sign with their name. One page — it is short enough not to need steps.
 */
export function WelcomePackForm({
  token,
  company,
  fullName,
  expires,
  documents,
  nextOfKin,
}: {
  token: string;
  company: string;
  fullName: string;
  expires: string;
  documents: { id: string; name: string }[];
  nextOfKin: { name: string; relation: string; phone: string };
}) {
  const [signed, setSigned] = useState(false);
  const f = useFormAction(
    async (prev: ActionResult | null, data: FormData) => {
      const r = await submitWelcomePack(token, prev, data);
      if (r.ok) setSigned(true);
      return r;
    },
    { resetOnSuccess: false },
  );

  if (signed) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16 text-center">
        <p className="text-[13px] font-semibold tracking-wide uppercase" style={{ color: "var(--accent-text)" }}>
          {company}
        </p>
        <h1 className="mt-2 text-[24px] font-semibold">Signed — welcome to the team</h1>
        <p className="mt-3 text-[15px]" style={{ color: "var(--text-secondary)" }}>
          We have emailed you a copy of what you signed. We will be in touch about your start and your first shift.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 pt-6 pb-24">
      <p className="text-[13px] font-semibold tracking-wide uppercase" style={{ color: "var(--accent-text)" }}>
        {company}
      </p>
      <h1 className="text-[22px] font-semibold tracking-tight">Your welcome pack</h1>
      <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
        Hello {fullName.split(" ")[0]}. Read each part, tick to accept it, and sign at the bottom. It takes about five minutes. The link works until{" "}
        {new Date(expires).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.
      </p>

      <form {...f.form} className="mt-5 space-y-4">
        <section className={box} style={{ borderColor: "var(--hairline)" }}>
          <h2 className="text-[16px] font-semibold">Your documents</h2>
          {documents.length ? (
            <ul className="mt-2 space-y-1.5 text-[15px]">
              {documents.map((d) => (
                <li key={d.id}>
                  <a href={`/apply/${token}/pack/${d.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-2" style={{ color: "var(--accent-text)" }}>
                    {d.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[14px]" style={{ color: "var(--text-secondary)" }}>
              Your contract and the handbook came with your offer. If you do not have them, reply to our email before you sign.
            </p>
          )}
        </section>

        {WELCOME_ACKS.map((a) => (
          <section key={a.id} className={box} style={{ borderColor: "var(--hairline)" }}>
            <h2 className="text-[16px] font-semibold">{a.title}</h2>
            <p className="mt-1 text-[14px]" style={{ color: "var(--text-secondary)" }}>
              {a.text}
            </p>
            <label className="mt-3 flex items-center gap-3 text-[15px] font-medium">
              <input type="checkbox" name="ack" value={a.id} className="h-6 w-6" />I accept
            </label>
          </section>
        ))}

        <section className={box} style={{ borderColor: "var(--hairline)" }}>
          <h2 className="text-[16px] font-semibold">Next of kin</h2>
          <p className="mt-1 text-[14px]" style={{ color: "var(--text-secondary)" }}>
            Who we call if something happens to you at work.
          </p>
          <label className="mt-3 block text-[14px] font-medium">
            Their name
            <input name="nextOfKinName" defaultValue={nextOfKin.name} autoComplete="off" className={inputCls} style={inputStyle} />
          </label>
          <label className="mt-3 block text-[14px] font-medium">
            How they are related to you
            <input name="nextOfKinRelation" defaultValue={nextOfKin.relation} placeholder="e.g. partner, mother, brother" autoComplete="off" className={inputCls} style={inputStyle} />
          </label>
          <label className="mt-3 block text-[14px] font-medium">
            Their phone number
            <input name="nextOfKinPhone" type="tel" defaultValue={nextOfKin.phone} autoComplete="off" className={inputCls} style={inputStyle} />
          </label>
        </section>

        <section className={box} style={{ borderColor: "var(--hairline)" }}>
          <h2 className="text-[16px] font-semibold">Signed paper contract (optional)</h2>
          <p className="mt-1 text-[14px]" style={{ color: "var(--text-secondary)" }}>
            If you have printed and signed your contract, take a photo of it or upload the scan. Signing below is enough on its own.
          </p>
          <input name="contract" type="file" accept="application/pdf,image/jpeg,image/png" capture="environment" className="mt-3 block w-full text-[14px]" />
        </section>

        <section className={box} style={{ borderColor: "var(--series-1)" }}>
          <h2 className="text-[16px] font-semibold">Sign</h2>
          <p className="mt-1 text-[14px]" style={{ color: "var(--text-secondary)" }}>
            Type your full name — <strong>{fullName}</strong> — to sign everything you ticked above. Your name, the time and your connection are recorded with it.
          </p>
          <input name="signedName" autoComplete="name" placeholder={fullName} className={inputCls} style={inputStyle} />
          <button type="submit" disabled={f.pending} className="mt-4 h-12 w-full rounded-lg text-[16px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--series-1)" }}>
            {f.pending ? "Signing…" : "Sign my welcome pack"}
          </button>
          {f.state && !f.state.ok && (
            <p role="alert" className="mt-2 text-[14px]" style={{ color: "var(--critical-text)" }}>
              {f.state.message}
            </p>
          )}
        </section>
      </form>
    </main>
  );
}
