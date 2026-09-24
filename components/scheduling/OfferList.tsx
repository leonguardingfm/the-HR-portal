"use client";

import { useState } from "react";
import { field, inputStyle } from "@/components/scheduling/RotaForms";
import { useFormAction } from "@/components/ui/useFormAction";
import { acceptOffer, declineOffer } from "@/lib/actions/rota";
import type { ActionResult } from "@/lib/actions/types";

export interface OfferRow {
  id: string;
  person: string;
  pin: string | null;
  shift: string;
  note: string | null;
  at: string;
  /** Why the rota would refuse them now, if it would. */
  problem: string | null;
  href: string;
}

/**
 * Officers who offered for an open shift in their portal. Accepting puts them
 * on it exactly as a yes on the phone would; either way they are told.
 */
export function OfferList({ rows, denied }: { rows: OfferRow[]; denied: string | null }) {
  const [notice, setNotice] = useState<ActionResult | null>(null);
  return (
    <div className="space-y-2">
      {notice && (
        <p role="status" className="rounded-md px-3 py-2 text-[13px]" style={{ background: notice.ok ? "var(--wash-good)" : "var(--wash-critical)" }}>
          {notice.message}
        </p>
      )}
      <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
        {rows.map((r) => (
          <Offer key={r.id} r={r} denied={denied} onResult={setNotice} />
        ))}
      </ul>
    </div>
  );
}

function Offer({ r, denied, onResult }: { r: OfferRow; denied: string | null; onResult: (x: ActionResult) => void }) {
  const lift = (a: (p: ActionResult | null, f: FormData) => Promise<ActionResult>) => async (p: ActionResult | null, f: FormData) => {
    const res = await a(p, f);
    onResult(res);
    return res;
  };
  const accept = useFormAction(lift(acceptOffer.bind(null, r.id)));
  const decline = useFormAction(lift(declineOffer.bind(null, r.id)));
  const [declining, setDeclining] = useState(false);
  const busy = accept.pending || decline.pending;
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-2.5" style={{ borderColor: "var(--hairline)" }}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">
          {r.person}
          {r.pin && <span className="ml-1.5 text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>PIN {r.pin}</span>}
          <span className="font-normal" style={{ color: "var(--text-secondary)" }}> offered for </span>
          <a href={r.href} className="underline">
            {r.shift}
          </a>
        </p>
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {r.at}
          {r.note && ` — “${r.note}”`}
        </p>
        {r.problem && (
          <p className="text-[12px]" style={{ color: "var(--status-critical)" }}>
            The rota would refuse this now: {r.problem}
          </p>
        )}
        {declining && (
          <form {...decline.form} className="mt-2 flex flex-wrap items-center gap-2">
            <input name="note" autoFocus placeholder="Why? (optional, the officer sees it)" className={`${field} min-w-[14rem] flex-1`} style={inputStyle} />
            <button type="submit" disabled={busy} className="h-9 rounded-md border px-3 text-[12px] font-medium disabled:opacity-60" style={{ borderColor: "var(--hairline)" }}>
              {decline.pending ? "Declining…" : "Decline"}
            </button>
            <button type="button" onClick={() => setDeclining(false)} className="text-[12px] underline" style={{ color: "var(--text-secondary)" }}>
              Cancel
            </button>
          </form>
        )}
      </div>
      {!declining && (
        <div className="flex items-center gap-2">
          <form {...accept.form}>
            <button type="submit" disabled={busy || !!denied || !!r.problem} title={denied ?? r.problem ?? undefined} className="h-8 rounded-md px-3 text-[12px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--status-good)" }}>
              {accept.pending ? "Accepting…" : "Accept"}
            </button>
          </form>
          <button type="button" onClick={() => setDeclining(true)} disabled={busy || !!denied} className="h-8 rounded-md border px-3 text-[12px] font-medium disabled:opacity-50" style={{ borderColor: "var(--hairline)" }}>
            Decline
          </button>
        </div>
      )}
    </li>
  );
}
