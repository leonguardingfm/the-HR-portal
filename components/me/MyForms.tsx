"use client";

import { useState } from "react";
import { field, inputStyle } from "@/components/scheduling/RotaForms";
import { useFormAction } from "@/components/ui/useFormAction";
import { bookMeOn, cannotMakeIt, confirmMyShift, myCheckCall } from "@/lib/actions/me";
import type { ActionResult } from "@/lib/actions/types";

type OnResult = { onResult: (r: ActionResult) => void };

/** Big enough for a thumb, on a phone, in the dark. */
const big = "h-12 w-full rounded-lg px-4 text-[15px] font-semibold text-white disabled:opacity-60";

function useLifted(action: (prev: ActionResult | null, data: FormData) => Promise<ActionResult>, onResult: (r: ActionResult) => void) {
  return useFormAction(async (prev: ActionResult | null, data: FormData) => {
    const r = await action(prev, data);
    onResult(r);
    return r;
  });
}

export function ConfirmButton({ assignmentId, onResult }: { assignmentId: string } & OnResult) {
  const { pending, form } = useLifted(confirmMyShift.bind(null, assignmentId), onResult);
  return (
    <form {...form}>
      <button type="submit" disabled={pending} className={big} style={{ background: "var(--status-good)" }}>
        {pending ? "Confirming…" : "Confirm — I’ll be there"}
      </button>
    </form>
  );
}

export function CannotMakeItForm({ assignmentId, onResult }: { assignmentId: string } & OnResult) {
  const { pending, form } = useLifted(cannotMakeIt.bind(null, assignmentId), onResult);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[13px] underline underline-offset-2" style={{ color: "var(--status-critical)" }}>
        I can’t make this shift
      </button>
    );
  }
  return (
    <form {...form} className="space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--status-critical)", background: "var(--wash-critical)" }}>
      <label className="block text-[13px] font-medium">
        Tell Control why
        <input name="note" required autoComplete="off" placeholder="e.g. I’m unwell" className={`${field} mt-1 h-11 w-full text-[15px]`} style={inputStyle} />
      </label>
      <button type="submit" disabled={pending} className={big} style={{ background: "var(--status-critical)" }}>
        {pending ? "Sending…" : "Tell Control I can’t make it"}
      </button>
    </form>
  );
}

export function BookOnButton({ assignmentId, late, onResult }: { assignmentId: string; late: boolean } & OnResult) {
  const { pending, form } = useLifted(bookMeOn.bind(null, assignmentId), onResult);
  return (
    <form {...form}>
      <button type="submit" disabled={pending} className={big} style={{ background: late ? "var(--status-critical)" : "var(--series-1)" }}>
        {pending ? "Booking on…" : "Book on — I’m at the site"}
      </button>
    </form>
  );
}

export function CheckCallButtons({ assignmentId, overdue, onResult }: { assignmentId: string; overdue: boolean } & OnResult) {
  const { pending, form } = useLifted(myCheckCall.bind(null, assignmentId), onResult);
  const [problem, setProblem] = useState(false);
  return (
    <form {...form} className="space-y-2">
      <input type="hidden" name="allWell" value={problem ? "no" : "yes"} />
      {problem && (
        <label className="block text-[13px] font-medium">
          What is wrong?
          <input name="note" required autoComplete="off" placeholder="Tell Control what is happening" className={`${field} mt-1 h-11 w-full text-[15px]`} style={inputStyle} />
        </label>
      )}
      <button type="submit" disabled={pending} className={big} style={{ background: problem ? "var(--status-critical)" : overdue ? "var(--status-critical)" : "var(--status-good)" }}>
        {pending ? "Sending…" : problem ? "Send to Control" : "Check call — all well"}
      </button>
      <button type="button" onClick={() => setProblem((v) => !v)} className="text-[13px] underline underline-offset-2" style={{ color: problem ? "var(--text-secondary)" : "var(--status-critical)" }}>
        {problem ? "Everything is fine after all" : "Something is wrong"}
      </button>
    </form>
  );
}
