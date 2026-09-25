"use client";

import { useState, useTransition } from "react";
import { field, inputStyle } from "@/components/scheduling/RotaForms";
import type { ActionResult } from "@/lib/actions/types";
import { checkSiteIssue, reportSiteIssue } from "@/lib/actions/site-issues";
import { SITE_ISSUE_KINDS, SITE_ISSUE_PHOTOS, SITE_ISSUE_URGENCY, kindIcon, kindLabel } from "@/lib/core/site-issues";

const big = "h-12 w-full rounded-lg px-4 text-[15px] font-semibold text-white disabled:opacity-60";
const link = "text-[13px] underline underline-offset-2";

/** A phone photo, made small enough to send quickly on a poor signal: 1600 pixels at most, as JPEG. */
async function shrink(file: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** "Something's wrong here": a broken lock, a leak, a gap in the fence. Control reviews it before the client sees it. */
export function ReportSiteIssue({ assignmentId, site, onResult }: { assignmentId: string; site: string; onResult: (r: ActionResult) => void }) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([]);
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-11 w-full rounded-lg border px-4 text-[14px] font-semibold" style={{ borderColor: "var(--hairline)" }}>
        🔧 Report a problem at this site
      </button>
    );
  const add = async (files: FileList | null) => {
    if (!files) return;
    const room = SITE_ISSUE_PHOTOS.max - photos.length;
    const next = await Promise.all([...files].slice(0, room).map(async (f) => { const blob = await shrink(f); return { blob, url: URL.createObjectURL(blob) }; }));
    setPhotos((p) => [...p, ...next]);
  };
  const submit = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    fd.delete("photo");
    photos.forEach((p, i) => fd.append("photo", new File([p.blob], `photo-${i + 1}.jpg`, { type: "image/jpeg" })));
    start(async () => {
      const r = await reportSiteIssue(assignmentId, null, fd);
      if (r.ok) {
        setOpen(false);
        setPhotos([]);
        setProblem(null);
        onResult(r);
      } else setProblem(r.message);
    });
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      className="space-y-3 rounded-lg border p-3"
      style={{ borderColor: "var(--hairline)" }}
    >
      <p className="text-[14px] font-semibold">A problem at {site}</p>
      <label className="block text-[13px] font-medium">
        What is it?
        <select name="kind" required defaultValue="" className={`${field} mt-1 h-11 w-full text-[15px]`} style={inputStyle}>
          <option value="" disabled>
            Choose one
          </option>
          {SITE_ISSUE_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.icon} {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[13px] font-medium">
        How urgent?
        <select name="urgency" required defaultValue="soon" className={`${field} mt-1 h-11 w-full text-[15px]`} style={inputStyle}>
          {SITE_ISSUE_URGENCY.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[13px] font-medium">
        Where on the site?
        <input name="location" autoComplete="off" placeholder="e.g. Rear fire exit, warehouse B" className={`${field} mt-1 h-11 w-full text-[15px]`} style={inputStyle} />
      </label>
      <label className="block text-[13px] font-medium">
        What did you find?
        <textarea name="description" required minLength={3} rows={3} placeholder="e.g. The lock on the fire exit is broken; the door will not stay shut" className={`${field} mt-1 h-auto w-full py-2 text-[15px]`} style={inputStyle} />
      </label>
      <div className="space-y-2">
        <label className="flex h-11 w-full cursor-pointer items-center justify-center rounded-lg border text-[14px] font-medium" style={{ borderColor: "var(--hairline)", opacity: photos.length >= SITE_ISSUE_PHOTOS.max ? 0.5 : 1 }}>
          📷 {photos.length ? `Add another photo (${photos.length}/${SITE_ISSUE_PHOTOS.max})` : "Take photos (up to 4)"}
          <input type="file" name="photo" accept="image/*" capture="environment" multiple disabled={photos.length >= SITE_ISSUE_PHOTOS.max} onChange={(e) => void add(e.target.files)} className="sr-only" />
        </label>
        {photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={p.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Photo ${i + 1}`} className="h-20 w-20 rounded-md object-cover" />
                <button type="button" onClick={() => setPhotos((all) => all.filter((x) => x !== p))} aria-label={`Remove photo ${i + 1}`} className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full text-[12px] text-white" style={{ background: "var(--status-critical)" }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          Photos of the problem, not of people. Control decides what the client sees.
        </p>
      </div>
      {problem && (
        <p role="alert" className="text-[13px]" style={{ color: "var(--critical-text)" }}>
          {problem}
        </p>
      )}
      <button type="submit" disabled={pending} className={big} style={{ background: "var(--series-1)" }}>
        {pending ? "Sending…" : "Send to Control"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className={link} style={{ color: "var(--text-secondary)" }}>
        Cancel
      </button>
    </form>
  );
}

export type OfficerCheck = { id: string; ref: string; kind: string; site: string; location: string | null; text: string; clientSaidAt: string; clientNote: string | null; photos: string[] };

/** The client says it is fixed: the officer on site looks, and says whether it is. */
export function SiteIssueCheck({ c, onResult }: { c: OfficerCheck; onResult: (r: ActionResult) => void }) {
  const [notFixed, setNotFixed] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const send = (fixed: boolean) => {
    const fd = new FormData();
    fd.set("fixed", fixed ? "yes" : "no");
    fd.set("note", note);
    start(async () => onResult(await checkSiteIssue(c.id, null, fd)));
  };
  return (
    <section className="space-y-2 rounded-lg border-2 p-3" style={{ borderColor: "var(--status-warning)", background: "var(--wash-warning)" }}>
      <p className="text-[14px] font-semibold">
        {kindIcon(c.kind)} Please check: {kindLabel(c.kind)}
        {c.location ? ` — ${c.location}` : ""}
      </p>
      <p className="text-[14px]">{c.text}</p>
      <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {c.site} · the client says it is fixed{c.clientNote ? `: “${c.clientNote}”` : ""}. Look, and tell us.
      </p>
      {c.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {c.photos.map((id) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={id} src={`/api/site-issues/photo/${id}`} alt="When it was reported" className="h-16 w-16 rounded-md object-cover" />
          ))}
        </div>
      )}
      {notFixed ? (
        <div className="space-y-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is still wrong?" className={`${field} h-11 w-full text-[15px]`} style={inputStyle} />
          <button type="button" disabled={pending || note.trim().length < 3} onClick={() => send(false)} className={big} style={{ background: "var(--status-critical)" }}>
            {pending ? "Sending…" : "Not fixed — tell Control"}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={pending} onClick={() => send(true)} className={big} style={{ background: "var(--button-good)" }}>
            ✓ It is fixed
          </button>
          <button type="button" disabled={pending} onClick={() => setNotFixed(true)} className="h-12 rounded-lg border text-[15px] font-semibold" style={{ borderColor: "var(--status-critical)", color: "var(--critical-text)" }}>
            Not fixed
          </button>
        </div>
      )}
    </section>
  );
}
