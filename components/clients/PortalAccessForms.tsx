"use client";

import { useState } from "react";
import { Result, input, inputStyle } from "@/components/scheduling/RotaForms";
import { useFormAction } from "@/components/ui/useFormAction";
import { addPortalContact, removePortalContact, resetPortalPassword, reviewPortalContact, setClientServices, setContactSites, setOfficerIdentity } from "@/lib/actions/client-access";

type Site = { id: string; name: string };
const btn = "h-9 rounded-md border px-3 text-[12px] font-semibold disabled:opacity-60";
const primary = "h-9 rounded-md px-4 text-[12px] font-semibold text-white disabled:opacity-60";

function SitePicker({ sites, chosen }: { sites: Site[]; chosen: string[] }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-[12px] font-medium">Sites they see — none ticked means all of this client&apos;s sites</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {sites.map((s) => (
          <label key={s.id} className="flex items-center gap-1.5 text-[13px]">
            <input type="checkbox" name="siteId" value={s.id} defaultChecked={chosen.includes(s.id)} className="h-4 w-4" /> {s.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function IdentityForm({ clientId, value, disabled }: { clientId: string; value: string; disabled: boolean }) {
  const f = useFormAction(setOfficerIdentity.bind(null, clientId), { resetOnSuccess: false });
  return (
    <form {...f.form} className="space-y-2">
      {[
        ["none", "No names — “Officer assigned”", "The default. Nothing identifies the officer."],
        ["name", "Officers' names", "Where the contract asks to know who is on site."],
        ["name_and_sia", "Names and SIA licence numbers", "Where the contract requires the licence to be known."],
      ].map(([id, label, why]) => (
        <label key={id} className="flex items-start gap-2 text-[13px]">
          <input type="radio" name="identity" value={id} defaultChecked={value === id} disabled={disabled} className="mt-1 h-4 w-4" />
          <span>
            <span className="font-medium">{label}</span>
            <span className="block text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {why}
            </span>
          </span>
        </label>
      ))}
      {!disabled && (
        <button type="submit" disabled={f.pending} className={primary} style={{ background: "var(--series-1)" }}>
          Save
        </button>
      )}
      <Result state={f.state} />
    </form>
  );
}

export function AddContactForm({ clientId, sites }: { clientId: string; sites: Site[] }) {
  const [open, setOpen] = useState(false);
  const f = useFormAction(addPortalContact.bind(null, clientId));
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={primary} style={{ background: "var(--series-1)" }}>
        + Add a contact
      </button>
    );
  return (
    <form {...f.form} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-[12px] font-medium">
          Full name
          <input name="name" required minLength={3} className={`${input} mt-1`} style={inputStyle} />
        </label>
        <label className="text-[12px] font-medium">
          Work email
          <input name="email" type="email" required className={`${input} mt-1`} style={inputStyle} />
        </label>
        <label className="text-[12px] font-medium">
          Username (optional)
          <input name="username" placeholder="from the email if left blank" className={`${input} mt-1`} style={inputStyle} />
        </label>
      </div>
      <SitePicker sites={sites} chosen={[]} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={f.pending} className={primary} style={{ background: "var(--series-1)" }}>
          {f.pending ? "Adding…" : "Add, and show the temporary password"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btn} style={{ borderColor: "var(--hairline)" }}>
          Close
        </button>
      </div>
      <Result state={f.state} />
    </form>
  );
}

export function ContactTools({ userId, sites, chosen }: { userId: string; sites: Site[]; chosen: string[] }) {
  const [mode, setMode] = useState<"" | "sites" | "remove">("");
  const siteForm = useFormAction(setContactSites.bind(null, userId), { resetOnSuccess: false });
  const remove = useFormAction(removePortalContact.bind(null, userId));
  const reset = useFormAction(resetPortalPassword.bind(null, userId), { resetOnSuccess: false });
  const review = useFormAction(reviewPortalContact.bind(null, userId), { resetOnSuccess: false });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setMode(mode === "sites" ? "" : "sites")} className={btn} style={{ borderColor: "var(--hairline)" }}>
          Sites
        </button>
        <form {...review.form}>
          <button type="submit" disabled={review.pending} className={btn} style={{ borderColor: "var(--hairline)" }}>
            Still needed ✓
          </button>
        </form>
        <form {...reset.form}>
          <button type="submit" disabled={reset.pending} className={btn} style={{ borderColor: "var(--hairline)" }}>
            New password
          </button>
        </form>
        <button type="button" onClick={() => setMode(mode === "remove" ? "" : "remove")} className={btn} style={{ borderColor: "var(--status-critical)", color: "var(--critical-text)" }}>
          Remove
        </button>
      </div>
      <Result state={review.state} />
      <Result state={reset.state} />
      {mode === "sites" && (
        <form {...siteForm.form} className="space-y-2 rounded-md border p-3" style={{ borderColor: "var(--hairline)" }}>
          <SitePicker sites={sites} chosen={chosen} />
          <button type="submit" disabled={siteForm.pending} className={primary} style={{ background: "var(--series-1)" }}>
            Save sites
          </button>
          <Result state={siteForm.state} />
        </form>
      )}
      {mode === "remove" && (
        <form {...remove.form} className="flex flex-wrap items-end gap-2 rounded-md border p-3" style={{ borderColor: "var(--status-critical)" }}>
          <label className="text-[12px] font-medium">
            Why
            <input name="reason" required minLength={3} placeholder="e.g. left the client" className={`${input} mt-1 w-64`} style={inputStyle} />
          </label>
          <button type="submit" disabled={remove.pending} className={primary} style={{ background: "var(--status-critical)" }}>
            Remove their access
          </button>
          <Result state={remove.state} />
        </form>
      )}
    </div>
  );
}

/** The paid extras: only for clients who pay for them (26 September 2026). */
export function ServicesForm({ clientId, since, disabled }: { clientId: string; since: { portal: string | null; live: string | null; siteIssues: string | null }; disabled: boolean }) {
  const [portal, setPortal] = useState(!!since.portal);
  const f = useFormAction(setClientServices.bind(null, clientId), { resetOnSuccess: false });
  const day = (iso: string | null) => (iso ? `on since ${new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "off");
  const row = (name: string, label: string, why: string, on: string | null, needsPortal: boolean) => (
    <label className="flex items-start gap-2 text-[13px]" style={{ opacity: needsPortal && !portal ? 0.5 : 1 }}>
      <input type="checkbox" name={name} defaultChecked={!!on} disabled={disabled || (needsPortal && !portal)} onChange={name === "portal" ? (e) => setPortal(e.target.checked) : undefined} className="mt-1 h-4 w-4" />
      <span>
        <span className="font-medium">{label}</span> <span style={{ color: "var(--text-muted)" }}>· {day(on)}</span>
        <span className="block text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {why}
        </span>
      </span>
    </label>
  );
  return (
    <form {...f.form} className="space-y-3">
      {row("portal", "Client portal", "Logins for their people: the rota, shift record, incidents, requests and the monthly report. Off: every login at this client stops seeing anything.", since.portal, false)}
      {row("live", "Live view", "“On duty now” — officers arriving and check calls as they happen.", since.live, true)}
      {row("siteIssues", "Site issue reports", "Damage, leaks and other problems our officers find, with photos, once Control approves them. Off: officers still report them, to Control only.", since.siteIssues, true)}
      {!disabled && (
        <>
          <label className="block text-[12px] font-medium">
            Note (optional)
            <input name="note" placeholder="e.g. Agreed with their facilities manager, £x a month from 1 October" className={`${input} mt-1`} style={inputStyle} />
          </label>
          <button type="submit" disabled={f.pending} className={primary} style={{ background: "var(--series-1)" }}>
            Save
          </button>
        </>
      )}
      <Result state={f.state} />
    </form>
  );
}
