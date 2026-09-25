"use client";

import { useState } from "react";
import { Result, input, inputStyle } from "@/components/scheduling/RotaForms";
import { useFormAction } from "@/components/ui/useFormAction";
import { markSiteIssueFixed } from "@/lib/actions/site-issues";

/** "We have fixed it." Our next officer on site checks before it closes. */
export function FixedButton({ issueId }: { issueId: string }) {
  const [open, setOpen] = useState(false);
  const f = useFormAction(markSiteIssueFixed.bind(null, issueId), { resetOnSuccess: false });
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-9 rounded-md px-3 text-[13px] font-semibold text-white" style={{ background: "var(--button-good)" }}>
        ✓ We&apos;ve fixed it
      </button>
    );
  return (
    <form {...f.form} className="flex flex-wrap items-end gap-2">
      <label className="text-[12px] font-medium">
        What was done (optional)
        <input name="note" maxLength={500} placeholder="e.g. Locksmith replaced the lock on Tuesday" className={`${input} mt-1 w-72 max-w-full`} style={inputStyle} />
      </label>
      <button type="submit" disabled={f.pending} className="h-9 rounded-md px-3 text-[13px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--button-good)" }}>
        {f.pending ? "Sending…" : "Tell Leon Guarding"}
      </button>
      <Result state={f.state} />
    </form>
  );
}
