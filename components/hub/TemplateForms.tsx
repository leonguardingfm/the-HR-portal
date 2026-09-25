"use client";

import { useState } from "react";
import { Result, input, inputStyle } from "@/components/scheduling/RotaForms";
import { useFormAction } from "@/components/ui/useFormAction";
import { saveReplyTemplate } from "@/lib/actions/hub";
import { CATEGORIES } from "@/lib/core/hub";

type T = { id: string; category: string; title: string; body: string; active: boolean };

/** One reply template: its category, a short title, and the wording. New when there is no template. */
export function TemplateForm({ t }: { t?: T }) {
  const [open, setOpen] = useState(false);
  const f = useFormAction(saveReplyTemplate.bind(null, t?.id ?? null), { resetOnSuccess: !t });
  if (!open)
    return t ? (
      <button type="button" onClick={() => setOpen(true)} className="w-full py-2.5 text-left hover:bg-[var(--wash)]">
        <p className="text-[13px] font-medium">
          {t.title} {!t.active && <span className="text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>· switched off</span>}
        </p>
        <p className="line-clamp-2 text-[12px] whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>
          {t.body}
        </p>
      </button>
    ) : (
      <button type="button" onClick={() => setOpen(true)} className="h-9 rounded-md px-3.5 text-[12px] font-semibold text-white" style={{ background: "var(--series-1)" }}>
        + New template
      </button>
    );
  return (
    <form {...f.form} className="space-y-2 py-3">
      <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
        <label className="text-[12px] font-medium">
          For
          <select name="category" defaultValue={t?.category ?? ""} required className={`${input} mt-1`} style={inputStyle}>
            <option value="" disabled>
              Choose a category
            </option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-medium">
          Title
          <input name="title" defaultValue={t?.title ?? ""} required minLength={3} placeholder="e.g. Cover found" className={`${input} mt-1`} style={inputStyle} />
        </label>
      </div>
      <label className="block text-[12px] font-medium">
        Wording
        <textarea name="body" defaultValue={t?.body ?? ""} required minLength={10} rows={6} className={`${input} mt-1 h-auto py-2`} style={inputStyle} />
      </label>
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        These are filled in for you: <code>{"{sender}"}</code> <code>{"{client}"}</code> <code>{"{site}"}</code> <code>{"{ref}"}</code> <code>{"{subject}"}</code> <code>{"{me}"}</code>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {t && (
          <label className="flex items-center gap-1.5 text-[12px]">
            <input type="checkbox" name="active" value="on" defaultChecked={t.active} className="h-4 w-4" /> In use
          </label>
        )}
        <button type="submit" disabled={f.pending} className="h-9 rounded-md px-4 text-[12px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--series-1)" }}>
          Save
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-md border px-3 text-[12px]" style={{ borderColor: "var(--hairline)" }}>
          Close
        </button>
        <Result state={f.state} />
      </div>
    </form>
  );
}
