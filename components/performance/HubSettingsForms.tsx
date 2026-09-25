"use client";

import { Result, input, inputStyle } from "@/components/scheduling/RotaForms";
import { useFormAction } from "@/components/ui/useFormAction";
import { saveClosedDays, saveSlaPolicy, updateMailbox } from "@/lib/actions/hub";
import { PRIORITIES } from "@/lib/core/hub";

const save = "h-9 rounded-md px-4 text-[12px] font-semibold text-white disabled:opacity-60";

export function SlaForm({ values }: { values: Record<string, string> }) {
  const f = useFormAction(saveSlaPolicy, { resetOnSuccess: false });
  return (
    <form {...f.form} className="space-y-3">
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-[13px]">
          <thead>
            <tr className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              <th className="px-1 pb-2 font-medium">Priority</th>
              <th className="px-1 pb-2 font-medium">Accept within</th>
              <th className="px-1 pb-2 font-medium">Act within</th>
              <th className="px-1 pb-2 font-medium">Update every</th>
            </tr>
          </thead>
          <tbody>
            {PRIORITIES.map((p) => (
              <tr key={p.id}>
                <td className="px-1 py-1 font-medium">{p.label}</td>
                {(["accept", "action", "update"] as const).map((c) => (
                  <td key={c} className="px-1 py-1">
                    <input name={`${p.id}.${c}`} defaultValue={values[`${p.id}.${c}`]} aria-label={`${p.label} ${c}`} className={`${input} w-24`} style={inputStyle} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        Write minutes as <code>15m</code>, hours as <code>4h</code>, working days as <code>1wd</code>. Warnings come at two thirds of each.
      </p>
      <button type="submit" disabled={f.pending} className={save} style={{ background: "var(--series-1)" }}>
        Save the clocks
      </button>
      <Result state={f.state} />
    </form>
  );
}

export function ClosedDaysForm({ days }: { days: string[] }) {
  const f = useFormAction(saveClosedDays, { resetOnSuccess: false });
  return (
    <form {...f.form} className="space-y-2">
      <label className="block text-[12px] font-medium">
        Extra days the office is closed (one per line, e.g. 2026-12-24)
        <textarea name="days" rows={4} defaultValue={days.join("\n")} className={`${input} mt-1 h-auto py-2`} style={inputStyle} />
      </label>
      <button type="submit" disabled={f.pending} className={save} style={{ background: "var(--series-1)" }}>
        Save
      </button>
      <Result state={f.state} />
    </form>
  );
}

export function MailboxForm({ m }: { m: { id: string; address: string; name: string; department: string; mode: string; officeHoursOnly: boolean; readAttachments: boolean; active: boolean; lastSyncAt: string | null } }) {
  const f = useFormAction(updateMailbox.bind(null, m.id), { resetOnSuccess: false });
  return (
    <form {...f.form} className="flex flex-wrap items-end gap-3 border-t py-3" style={{ borderColor: "var(--hairline)" }}>
      <div className="min-w-[14rem] flex-1">
        <p className="text-[13px] font-medium">{m.name}</p>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {m.address} · {m.lastSyncAt ? `last synced ${new Date(m.lastSyncAt).toLocaleString("en-GB")}` : "not connected to Outlook yet"}
        </p>
      </div>
      <label className="text-[12px] font-medium">
        Mode
        <select name="mode" defaultValue={m.mode} className={`${input} mt-1 w-40`} style={inputStyle}>
          <option value="test">Test inbox</option>
          <option value="shadow">Shadow — read, nobody alerted</option>
          <option value="live">Live</option>
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-[12px]">
        <input type="checkbox" name="officeHoursOnly" defaultChecked={m.officeHoursOnly} className="h-4 w-4" /> Office hours only
      </label>
      <label className="flex items-center gap-1.5 text-[12px]">
        <input type="checkbox" name="readAttachments" defaultChecked={m.readAttachments} className="h-4 w-4" /> AI may read attachments
      </label>
      <label className="flex items-center gap-1.5 text-[12px]">
        <input type="checkbox" name="active" defaultChecked={m.active} className="h-4 w-4" /> On
      </label>
      <button type="submit" disabled={f.pending} className={save} style={{ background: "var(--series-1)" }}>
        Save
      </button>
      <Result state={f.state} />
    </form>
  );
}
