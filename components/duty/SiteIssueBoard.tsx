"use client";

import { useState } from "react";
import { Drawer } from "@/components/scheduling/Drawer";
import { Result, input, inputStyle } from "@/components/scheduling/RotaForms";
import { useFormAction } from "@/components/ui/useFormAction";
import { confirmSiteIssueByControl, reviewSiteIssue } from "@/lib/actions/site-issues";
import type { ActionResult } from "@/lib/actions/types";
import { STAFF_STAGE, kindIcon, kindLabel, urgencyLabel } from "@/lib/core/site-issues";
import type { StaffSiteIssue } from "@/lib/db/site-issues";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const btn = "h-9 rounded-md border px-3 text-[12px] font-semibold disabled:opacity-60";
const primary = "h-10 w-full rounded-md text-[13px] font-semibold text-white disabled:opacity-60";
const muted = { color: "var(--text-secondary)" } as const;

function useClosing(action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>, close: () => void) {
  return useFormAction(
    async (prev: ActionResult | null, fd: FormData) => {
      const r = await action(prev, fd);
      if (r.ok) close();
      return r;
    },
    { resetOnSuccess: false },
  );
}

function Photos({ ids, size = "h-20 w-20" }: { ids: string[]; size?: string }) {
  if (!ids.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <a key={id} href={`/api/site-issues/photo/${id}`} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/site-issues/photo/${id}`} alt="Photo from the site" className={`${size} rounded-md object-cover`} />
        </a>
      ))}
    </div>
  );
}

function Review({ i, onClose }: { i: StaffSiteIssue; onClose: () => void }) {
  const [decision, setDecision] = useState<"share" | "internal">("share");
  const f = useClosing(reviewSiteIssue.bind(null, i.id), onClose);
  return (
    <Drawer title={`Review ${i.ref}`} subtitle={`${i.client} · ${i.site}. Nothing reaches the client until you share it, and they see only your words and the photos you tick.`} urgent={i.urgency === "urgent"} onClose={onClose}>
      <section className="space-y-1.5 text-[13px]">
        <p className="font-semibold">
          {kindIcon(i.kind)} {kindLabel(i.kind)} · {urgencyLabel(i.urgency)}
          {i.location ? ` · ${i.location}` : ""}
        </p>
        <p className="whitespace-pre-line">“{i.description}”</p>
        <p style={muted}>
          {i.reportedBy}, {when(i.reportedAt)}
          {i.post ? ` · ${i.post}` : ""}
        </p>
      </section>
      <form {...f.form} className="space-y-3">
        <fieldset className="flex gap-4 text-[13px]">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="decision" value="share" checked={decision === "share"} onChange={() => setDecision("share")} className="h-4 w-4" /> Share with the client
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="decision" value="internal" checked={decision === "internal"} onChange={() => setDecision("internal")} className="h-4 w-4" /> Keep internal
          </label>
        </fieldset>
        {decision === "share" ? (
          <>
            <label className="block text-[12px] font-medium">
              What the client reads
              <textarea name="clientText" required minLength={5} rows={4} defaultValue={i.description} className={`${input} mt-1 h-auto py-2`} style={inputStyle} />
            </label>
            {i.photos.length > 0 && (
              <fieldset className="space-y-1.5">
                <legend className="text-[12px] font-medium">Photos the client sees — leave out any showing people</legend>
                <div className="flex flex-wrap gap-3">
                  {i.photos.map((p) => (
                    <label key={p.id} className="flex flex-col items-center gap-1 text-[12px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/site-issues/photo/${p.id}`} alt="Photo from the site" className="h-24 w-24 rounded-md object-cover" />
                      <span className="flex items-center gap-1">
                        <input type="checkbox" name="photoId" value={p.id} defaultChecked className="h-4 w-4" /> Share
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </>
        ) : (
          <label className="block text-[12px] font-medium">
            Why the client should not see it
            <input name="reason" required minLength={3} placeholder="e.g. our own equipment; already fixed on the night" className={`${input} mt-1`} style={inputStyle} />
          </label>
        )}
        <button type="submit" disabled={f.pending} className={primary} style={{ background: decision === "share" ? "var(--series-1)" : "var(--text-secondary)" }}>
          {f.pending ? "Saving…" : decision === "share" ? "Share with the client" : "Keep internal"}
        </button>
        <Result state={f.state} />
      </form>
    </Drawer>
  );
}

function ConfirmByControl({ i, onClose }: { i: StaffSiteIssue; onClose: () => void }) {
  const f = useClosing(confirmSiteIssueByControl.bind(null, i.id), onClose);
  return (
    <Drawer title={`Confirm ${i.ref} fixed`} subtitle="Usually the next officer on site checks it. If none is due soon, confirm it here — and say how you know." onClose={onClose}>
      <form {...f.form} className="space-y-3">
        <label className="block text-[12px] font-medium">
          How you know it is fixed
          <input name="note" required minLength={5} placeholder="e.g. photo from the site manager; checked by the mobile patrol" className={`${input} mt-1`} style={inputStyle} />
        </label>
        <button type="submit" disabled={f.pending} className={primary} style={{ background: "var(--button-good)" }}>
          Close as fixed
        </button>
        <Result state={f.state} />
      </form>
    </Drawer>
  );
}

function Row({ i, canReview }: { i: StaffSiteIssue; canReview: boolean }) {
  const [open, setOpen] = useState<"" | "review" | "confirm">("");
  const urgent = i.urgency === "urgent" && i.status === "reported";
  return (
    <li id={i.id} className="grid gap-3 py-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto]" style={{ borderColor: "var(--hairline)", boxShadow: urgent ? "inset 3px 0 0 var(--status-critical)" : undefined, paddingLeft: urgent ? 10 : undefined }}>
      <div className="min-w-0 space-y-1 text-[13px]">
        <p className="font-semibold">
          {kindIcon(i.kind)} {i.ref} · {kindLabel(i.kind)}
          <span className="ml-2 rounded-full px-2 py-0.5 text-[11px]" style={{ background: i.urgency === "urgent" ? "var(--wash-critical)" : "var(--wash-neutral)" }}>
            {urgencyLabel(i.urgency)}
          </span>
          {i.reopenCount > 0 && i.status === "open" && (
            <span className="ml-1 rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--wash-warning)" }}>
              Not fixed when checked
            </span>
          )}
        </p>
        <p>
          {i.client} · {i.site}
          {i.location ? ` · ${i.location}` : ""}
        </p>
        <p className="whitespace-pre-line" style={muted}>
          “{i.description}” — {i.reportedBy}, {when(i.reportedAt)}
        </p>
        {i.clientText && i.clientText !== i.description && <p>Client reads: “{i.clientText}”</p>}
        {i.internalReason && <p style={muted}>Kept internal: {i.internalReason}</p>}
        {i.clientFixedAt && <p>Client said fixed {when(i.clientFixedAt)}{i.clientFixedNote ? `: “${i.clientFixedNote}”` : ""}</p>}
        {i.checkedAt && <p style={muted}>Checked {when(i.checkedAt)}{i.checkNote ? `: ${i.checkNote}` : ""}</p>}
      </div>
      <Photos ids={i.photos.map((p) => p.id)} size="h-16 w-16" />
      <div className="flex flex-wrap items-start gap-2">
        {canReview && i.status === "reported" && (
          <button type="button" onClick={() => setOpen("review")} className={btn} style={{ background: "var(--series-1)", color: "#fff", borderColor: "var(--series-1)" }}>
            Review
          </button>
        )}
        {canReview && i.status === "client_fixed" && (
          <button type="button" onClick={() => setOpen("confirm")} className={btn} style={{ borderColor: "var(--hairline)" }}>
            Confirm fixed
          </button>
        )}
      </div>
      {open === "review" && <Review i={i} onClose={() => setOpen("")} />}
      {open === "confirm" && <ConfirmByControl i={i} onClose={() => setOpen("")} />}
    </li>
  );
}

export function SiteIssueBoard({ issues, canReview }: { issues: StaffSiteIssue[]; canReview: boolean }) {
  const groups: { id: string; title: string; meaning: string; rows: StaffSiteIssue[] }[] = [
    { id: "reported", title: STAFF_STAGE.reported, meaning: "Reported by officers. Nothing reaches the client until you share it.", rows: issues.filter((i) => i.status === "reported").sort((a, b) => (a.urgency === "urgent" ? -1 : 0) - (b.urgency === "urgent" ? -1 : 0)) },
    { id: "open", title: STAFF_STAGE.open, meaning: "Shared, and waiting for the client to put right.", rows: issues.filter((i) => i.status === "open") },
    { id: "client_fixed", title: STAFF_STAGE.client_fixed, meaning: "The next officer on site checks it. If none is due soon, confirm it yourself.", rows: issues.filter((i) => i.status === "client_fixed") },
    { id: "closed", title: "Closed in the last 30 days", meaning: "Resolved, or kept internal.", rows: issues.filter((i) => i.status === "resolved" || i.status === "kept_internal") },
  ];
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.id} className="rounded-lg border" style={{ borderColor: g.id === "reported" && g.rows.length ? "var(--status-warning)" : "var(--hairline)", background: "var(--surface-1)" }}>
          <header className="border-b px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
            <h2 className="text-[14px] font-semibold">
              {g.title} <span className="tnum">· {g.rows.length}</span>
            </h2>
            <p className="text-[12px]" style={muted}>
              {g.meaning}
            </p>
          </header>
          {g.rows.length === 0 ? (
            <p className="px-4 py-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
              None.
            </p>
          ) : (
            <ul className="divide-y px-4" style={{ borderColor: "var(--hairline)" }}>
              {g.rows.map((i) => (
                <Row key={i.id} i={i} canReview={canReview} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
