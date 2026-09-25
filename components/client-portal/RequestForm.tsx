"use client";

import { useState } from "react";
import { Result, input, inputStyle } from "@/components/scheduling/RotaForms";
import { useFormAction } from "@/components/ui/useFormAction";
import { raiseClientRequest } from "@/lib/actions/client-portal";

/** A request from the client, in their words. It goes straight to the team that deals with it. */
export function RequestForm({ kinds, sites }: { kinds: { id: string; label: string }[]; sites: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const f = useFormAction(raiseClientRequest);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-10 rounded-lg px-4 text-[14px] font-semibold text-white" style={{ background: "var(--series-1)" }}>
        + New request
      </button>
    );
  return (
    <form {...f.form} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[12px] font-medium">
          What is it about?
          <select name="kind" required defaultValue="" className={`${input} mt-1`} style={inputStyle}>
            <option value="" disabled>
              Choose one
            </option>
            {kinds.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[12px] font-medium">
          Which site?
          <select name="siteId" defaultValue={sites.length === 1 ? sites[0].id : ""} className={`${input} mt-1`} style={inputStyle}>
            {sites.length > 1 && <option value="">Not about one site</option>}
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-[12px] font-medium">
        Title
        <input name="subject" required minLength={3} maxLength={300} placeholder="e.g. Second officer at the gatehouse on Saturday" className={`${input} mt-1`} style={inputStyle} />
      </label>
      <label className="block text-[12px] font-medium">
        Details
        <textarea name="details" required minLength={5} rows={5} placeholder="What you need, and anything that helps us arrange it" className={`${input} mt-1 h-auto py-2`} style={inputStyle} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[12px] font-medium">
          When (if it is about a particular time)
          <input name="when" maxLength={120} placeholder="e.g. Saturday 4 October, 08:00–20:00" className={`${input} mt-1`} style={inputStyle} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-[13px]">
          <input type="checkbox" name="urgent" className="h-4 w-4" /> Urgent — needed today
        </label>
      </div>
      <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        For anything happening right now at a site, ring the Control Room as well.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={f.pending} className="h-10 rounded-lg px-4 text-[14px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--series-1)" }}>
          {f.pending ? "Sending…" : "Send request"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-lg border px-4 text-[13px]" style={{ borderColor: "var(--hairline)" }}>
          Close
        </button>
      </div>
      <Result state={f.state} />
    </form>
  );
}
