"use client";

import { useState } from "react";
import { Result, input, inputStyle } from "@/components/scheduling/RotaForms";
import { useFormAction } from "@/components/ui/useFormAction";
import { switchOffDemoAccounts, tickGoLive } from "@/lib/actions/golive";

export function ManualTick({ k, done }: { k: string; done: { by: string; at: string; note: string } | null }) {
  const [open, setOpen] = useState(false);
  const f = useFormAction(tickGoLive.bind(null, k), { resetOnSuccess: false });
  if (done)
    return (
      <form {...f.form} className="flex flex-wrap items-center gap-2 text-[12px]">
        <span style={{ color: "var(--text-secondary)" }}>
          ✓ {done.by}, {new Date(done.at).toLocaleDateString("en-GB")}: {done.note}
        </span>
        <button type="submit" disabled={f.pending} className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
          Untick
        </button>
        <Result state={f.state} />
      </form>
    );
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-8 rounded-md border px-3 text-[12px] font-medium" style={{ borderColor: "var(--hairline)" }}>
        Mark as done
      </button>
    );
  return (
    <form {...f.form} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="done" value="on" />
      <input name="note" required minLength={3} placeholder="How you know — date, reference, who" aria-label="How you know" className={`${input} w-72 max-w-full`} style={inputStyle} />
      <button type="submit" disabled={f.pending} className="h-9 rounded-md px-3 text-[12px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--series-1)" }}>
        Done
      </button>
      <Result state={f.state} />
    </form>
  );
}

export function SwitchOffDemo() {
  const f = useFormAction(switchOffDemoAccounts);
  return (
    <form {...f.form} className="flex flex-wrap items-end gap-2">
      <label className="text-[12px] font-medium">
        Type SWITCH OFF to confirm
        <input name="confirm" autoComplete="off" className={`${input} mt-1 w-44`} style={inputStyle} />
      </label>
      <button type="submit" disabled={f.pending} className="h-9 rounded-md px-3 text-[12px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--status-critical)" }}>
        Switch off demonstration accounts
      </button>
      <Result state={f.state} />
    </form>
  );
}
