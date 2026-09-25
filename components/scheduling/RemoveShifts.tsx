"use client";

import { useMemo, useState, useTransition } from "react";
import { previewRemoveShifts, removeShifts, type RemovePreview } from "@/lib/actions/rota";
import type { ActionResult } from "@/lib/actions/types";
import { DAY_SHORT, addDays } from "@/lib/core/rota";
import type { RotaPost } from "@/lib/db/rota";
import { Drawer } from "./Drawer";
import { Result, field, inputStyle } from "./RotaForms";

/**
 * Remove shifts that are not needed (26 September 2026): the client wanted a
 * post for a month and, after ten days, says the rest is not needed. Choose the
 * posts — a whole client or site at a tick — the dates, and which shifts; see
 * exactly what will come off; give the reason; done. Officers on cancelled
 * shifts are told in their portal. Nothing that has started is touched.
 */
export function RemoveShifts({ posts, today, initialPostId, onClose }: { posts: RotaPost[]; today: string; initialPostId?: string; onClose: () => void }) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(initialPostId ? [initialPostId] : []));
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 14));
  const [days, setDays] = useState<Set<number>>(() => new Set([0, 1, 2, 3, 4, 5, 6]));
  const [include, setInclude] = useState({ open: true, drafts: true, published: false });
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<RemovePreview | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  // Client → site → posts, for ticking a whole client or site at once.
  const tree = useMemo(() => {
    const clients = new Map<string, Map<string, RotaPost[]>>();
    for (const p of posts) {
      const sites = clients.get(p.clientName) ?? new Map<string, RotaPost[]>();
      sites.set(p.siteName, [...(sites.get(p.siteName) ?? []), p]);
      clients.set(p.clientName, sites);
    }
    return [...clients].map(([client, sites]) => ({ client, sites: [...sites].map(([site, ps]) => ({ site, posts: ps })) }));
  }, [posts]);

  const range = () => ({ postIds: [...chosen], from, to, weekdays: days.size === 7 ? [] : [...days], include });
  const changed = () => {
    setPreview(null);
    setResult(null);
  };
  const toggleAll = (ids: string[]) => {
    changed();
    setChosen((s) => {
      const n = new Set(s);
      const all = ids.every((id) => n.has(id));
      for (const id of ids) all ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const check = () =>
    start(async () => {
      const r = await previewRemoveShifts({ range: range() });
      setResult(r.ok ? null : r);
      setPreview(r.ok ? (r.preview ?? null) : null);
    });
  const remove = () =>
    start(async () => {
      const r = await removeShifts({ range: range(), reason });
      setResult(r);
      if (r.ok) setPreview(null);
    });
  const total = preview ? preview.open + preview.cover + preview.drafts + preview.published : 0;
  const box = "rounded-lg border p-3";
  const boxStyle = { borderColor: "var(--hairline)" };

  return (
    <Drawer title="Remove shifts" subtitle="Shifts that are not needed — a client stopping early, a post no longer wanted. You see exactly what will come off before anything does." wide onClose={onClose}>
      <section className={box} style={boxStyle}>
        <p className="mb-2 text-[12px] font-semibold">1. Which posts</p>
        <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {tree.map(({ client, sites }) => {
            const clientIds = sites.flatMap((s) => s.posts.map((p) => p.id));
            return (
              <div key={client}>
                <label className="flex items-center gap-2 text-[13px] font-semibold">
                  <input type="checkbox" checked={clientIds.every((id) => chosen.has(id))} onChange={() => toggleAll(clientIds)} className="h-4 w-4" />
                  {client} <span className="text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>· every post</span>
                </label>
                {sites.map(({ site, posts: ps }) => (
                  <div key={site} className="mt-1 ml-6">
                    <label className="flex items-center gap-2 text-[12px] font-medium">
                      <input type="checkbox" checked={ps.every((p) => chosen.has(p.id))} onChange={() => toggleAll(ps.map((p) => p.id))} className="h-4 w-4" />
                      {site}
                    </label>
                    <div className="mt-0.5 ml-6 flex flex-wrap gap-x-4 gap-y-0.5">
                      {ps.map((p) => (
                        <label key={p.id} className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                          <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggleAll([p.id])} className="h-3.5 w-3.5" /> {p.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section className={box} style={boxStyle}>
        <p className="mb-2 text-[12px] font-semibold">2. Which days</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[12px] font-medium">
            From
            <input type="date" value={from} min={today} onChange={(e) => (setFrom(e.target.value), changed())} className={`${field} mt-1 block`} style={inputStyle} />
          </label>
          <label className="text-[12px] font-medium">
            To (included)
            <input type="date" value={to} min={from} onChange={(e) => (setTo(e.target.value), changed())} className={`${field} mt-1 block`} style={inputStyle} />
          </label>
        </div>
        <div role="group" aria-label="Days of the week" className="mt-2 flex flex-wrap gap-1">
          {DAY_SHORT.map((d, i) => (
            <button
              key={d}
              type="button"
              aria-pressed={days.has(i)}
              onClick={() => {
                changed();
                setDays((s) => {
                  const n = new Set(s);
                  n.has(i) ? n.delete(i) : n.add(i);
                  return n;
                });
              }}
              className="h-8 w-11 rounded-md border text-[12px] font-medium"
              style={days.has(i) ? { background: "var(--series-1)", color: "#fff", borderColor: "var(--series-1)" } : { borderColor: "var(--hairline)", color: "var(--text-secondary)" }}
            >
              {d}
            </button>
          ))}
        </div>
      </section>

      <section className={box} style={boxStyle}>
        <p className="mb-2 text-[12px] font-semibold">3. Which shifts</p>
        {(
          [
            ["open", "Open shifts — nobody on them yet (and cover still being found)"],
            ["drafts", "Drafts — officers pencilled in, not yet told"],
            ["published", "Shifts with officers on them — cancelled, and each officer is told in their portal"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex items-start gap-2 py-0.5 text-[13px]">
            <input type="checkbox" checked={include[k]} onChange={(e) => (setInclude((s) => ({ ...s, [k]: e.target.checked })), changed())} className="mt-0.5 h-4 w-4" /> {label}
          </label>
        ))}
      </section>

      {!preview ? (
        <button type="button" disabled={pending || chosen.size === 0} onClick={check} className="h-10 w-full rounded-md text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--series-1)" }}>
          {pending ? "Checking…" : chosen.size ? "Check what will come off" : "Tick the posts first"}
        </button>
      ) : (
        <section className="space-y-3 rounded-lg border-2 p-3" style={{ borderColor: total ? "var(--status-critical)" : "var(--hairline)", background: total ? "var(--wash-critical)" : undefined }}>
          <p className="text-[14px] font-semibold">
            {total ? `${total} shift${total === 1 ? "" : "s"} will come off` : "Nothing to remove in that choice"}
          </p>
          {total > 0 && (
            <>
              <p className="text-[13px]">
                {[preview.open && `${preview.open} open`, preview.cover && `${preview.cover} still needing cover`, preview.drafts && `${preview.drafts} draft${preview.drafts === 1 ? "" : "s"}`, preview.published && `${preview.published} with officers`].filter(Boolean).join(" · ")}
              </p>
              {preview.officers.length > 0 && (
                <p className="text-[13px]">
                  <strong>Officers who will be told:</strong> {preview.officers.map((o) => `${o.name} (${o.shifts})`).join(", ")}
                </p>
              )}
              <ul className="space-y-0.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {preview.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
                {total > preview.lines.length && <li>…and {total - preview.lines.length} more</li>}
              </ul>
            </>
          )}
          {preview.started > 0 && <p className="text-[12px]">{preview.started} in those dates had already started — they stay.</p>}
          {total > 0 && (
            <>
              <label className="block text-[12px] font-medium">
                Why they are not needed
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Client does not need cover from 16 October" className={`${field} mt-1 w-full`} style={inputStyle} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={pending || reason.trim().length < 3} onClick={remove} className="h-10 flex-1 rounded-md text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--status-critical)" }}>
                  {pending ? "Removing…" : `Remove ${total} shift${total === 1 ? "" : "s"}`}
                </button>
                <button type="button" onClick={changed} className="h-10 rounded-md border px-4 text-[13px]" style={{ borderColor: "var(--hairline)" }}>
                  Change the choice
                </button>
              </div>
            </>
          )}
        </section>
      )}
      <Result state={result} />
    </Drawer>
  );
}
