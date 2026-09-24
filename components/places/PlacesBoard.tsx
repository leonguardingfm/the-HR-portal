"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/scheduling/Drawer";
import { Result, input, inputStyle } from "@/components/scheduling/RotaForms";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { useFormAction } from "@/components/ui/useFormAction";
import { saveClient, savePost, saveSite } from "@/lib/actions/places";
import type { ActionResult } from "@/lib/actions/types";
import { CHECK_CALL_RULE_LABELS, NIGHT_HOURS, type CheckCallRule } from "@/lib/core/duty";
import { RADIUS_LIMITS } from "@/lib/core/places";
import { mapLink } from "@/lib/core/proof";
import { formatDate } from "@/lib/format";

export interface PlacePost {
  id: string;
  name: string;
  pattern: string | null;
  requiresSiaLicence: boolean;
  screeningPeriodYears: number;
  checkCalls: CheckCallRule;
  loneWorking: boolean;
  mobileSignal: boolean;
  phone: string | null;
  instructions: string | null;
  active: boolean;
  regular: string | null;
  shiftsAhead: number;
}

export interface PlaceSite {
  id: string;
  name: string;
  address: string | null;
  clientRef: string | null;
  checkCallInstruction: string | null;
  contactName: string | null;
  contactPhone: string | null;
  location: { lat: number; lng: number } | null;
  radiusMetres: number;
  active: boolean;
  posts: PlacePost[];
}

export interface PlaceClient {
  id: string;
  name: string;
  screeningPeriodYears: number;
  requiresAdditionalInterview: boolean;
  regulatedActivity: boolean;
  contractStart: string | null;
  contractEnd: string | null;
  active: boolean;
  sites: PlaceSite[];
}

type Editing =
  | { kind: "client"; client?: PlaceClient }
  | { kind: "site"; clientId: string; clientName: string; site?: PlaceSite }
  | { kind: "post"; siteId: string; siteName: string; post?: PlacePost };

const small = "inline-flex h-7 items-center rounded-md border px-2.5 text-[12px] font-medium disabled:opacity-50";

/**
 * Every client, its sites and their posts, on one page: searched, checked for
 * what is missing, and edited in a panel from the right.
 */
export function PlacesBoard({ clients, denied }: { clients: PlaceClient[]; denied: string | null }) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"active" | "attention" | "all">("active");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [notice, setNotice] = useState<ActionResult | null>(null);

  const sites = clients.flatMap((c) => c.sites.filter((s) => c.active && s.active));
  const posts = sites.flatMap((s) => s.posts.filter((p) => p.active));
  const noLocation = sites.filter((s) => !s.location).length;
  const noInstructions = posts.filter((p) => !p.instructions).length;
  const noContact = sites.filter((s) => !s.contactPhone).length;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = (...xs: (string | null)[]) => !needle || xs.some((x) => x?.toLowerCase().includes(needle));
    const attention = (s: PlaceSite) => !s.location || !s.contactPhone || s.posts.some((p) => p.active && !p.instructions);
    return clients
      .filter((c) => show === "all" || c.active)
      .map((c) => ({
        ...c,
        sites: c.sites
          .filter((s) => show === "all" || s.active)
          .filter((s) => show !== "attention" || attention(s))
          .map((s) => ({ ...s, posts: s.posts.filter((p) => show === "all" || p.active) }))
          .filter((s) => hit(c.name, s.name, s.address, ...s.posts.map((p) => p.name))),
      }))
      .filter((c) => c.sites.length > 0 || (show !== "attention" && hit(c.name)));
  }, [clients, q, show]);

  const done = (r: ActionResult) => {
    setNotice(r);
    if (r.ok) setEditing(null);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients, sites & posts"
        description="Everything the rota and the duty checks run on. A post's check-call rule, signal and instructions decide what its officers do; a site's location is what their selfies are checked against. Nothing is deleted — make it inactive instead."
        action={
          <button
            type="button"
            disabled={!!denied}
            title={denied ?? undefined}
            onClick={() => setEditing({ kind: "client" })}
            className="inline-flex h-9 items-center rounded-md px-3 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--series-1)" }}
          >
            Add a client
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
        <span>
          <strong style={{ color: "var(--text-primary)" }}>{clients.filter((c) => c.active).length}</strong> clients ·{" "}
          <strong style={{ color: "var(--text-primary)" }}>{sites.length}</strong> sites · <strong style={{ color: "var(--text-primary)" }}>{posts.length}</strong> posts
        </span>
        {noLocation > 0 && <StatusPill severity="serious" label={`${noLocation} site${noLocation === 1 ? "" : "s"} with no location — selfies there cannot be checked`} wrap />}
        {noContact > 0 && <StatusPill severity="warning" label={`${noContact} site${noContact === 1 ? "" : "s"} with no contact phone`} wrap />}
        {noInstructions > 0 && <StatusPill severity="warning" label={`${noInstructions} post${noInstructions === 1 ? "" : "s"} with no instructions`} wrap />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a client, site or post" aria-label="Find a client, site or post" className={`${input} max-w-sm`} style={inputStyle} />
        {(
          [
            ["active", "Active"],
            ["attention", "Needs attention"],
            ["all", "Include inactive"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={show === id} onClick={() => setShow(id)} className="h-9 rounded-md border px-3 text-[12px]" style={{ borderColor: show === id ? "var(--text-primary)" : "var(--hairline)", fontWeight: show === id ? 600 : 400 }}>
            {label}
          </button>
        ))}
      </div>

      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-[13px]" style={{ borderColor: notice.ok ? "var(--status-good)" : "var(--status-critical)", background: notice.ok ? "var(--wash-good)" : "var(--wash-critical)" }}>
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" style={{ color: "var(--text-secondary)" }}>
            ✕
          </button>
        </div>
      )}

      {shown.length === 0 && (
        <p className="rounded-lg border px-4 py-8 text-center text-[13px]" style={{ borderColor: "var(--hairline)", color: "var(--text-secondary)" }}>
          {clients.length === 0 ? "No clients yet. Add the first one." : "Nothing matches."}
        </p>
      )}

      <div className="space-y-4">
        {shown.map((c) => (
          <section key={c.id} className="rounded-lg border" style={{ borderColor: "var(--hairline)", background: "var(--surface-1)", opacity: c.active ? 1 : 0.7 }}>
            <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold">
                  {c.name} {!c.active && <span className="text-[12px] font-normal" style={{ color: "var(--text-muted)" }}>· inactive</span>}
                </h2>
                <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {c.screeningPeriodYears}-year screening
                  {c.regulatedActivity && " · regulated activity"}
                  {c.requiresAdditionalInterview && " · additional interview"}
                  {c.contractStart && ` · contract from ${formatDate(c.contractStart)}`}
                  {c.contractEnd && ` to ${formatDate(c.contractEnd)}`}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button type="button" disabled={!!denied} title={denied ?? undefined} className={small} style={{ borderColor: "var(--hairline)" }} onClick={() => setEditing({ kind: "client", client: c })}>
                  Edit client
                </button>
                <button type="button" disabled={!!denied || !c.active} title={denied ?? undefined} className={small} style={{ borderColor: "var(--series-1)", color: "var(--series-1)" }} onClick={() => setEditing({ kind: "site", clientId: c.id, clientName: c.name })}>
                  Add a site
                </button>
              </div>
            </header>

            {c.sites.length === 0 ? (
              <p className="px-4 py-3 text-[13px]" style={{ color: "var(--text-muted)" }}>
                No sites yet.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                {c.sites.map((s) => {
                  const map = mapLink({ lat: s.location?.lat, lng: s.location?.lng, address: s.address });
                  return (
                    <li key={s.id} className="space-y-2 px-4 py-3" style={{ borderColor: "var(--hairline)", opacity: s.active ? 1 : 0.7 }}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold">
                            {s.name} {!s.active && <span className="text-[12px] font-normal" style={{ color: "var(--text-muted)" }}>· inactive</span>}
                          </p>
                          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                            {s.address ?? "No address"}
                            {map && (
                              <>
                                {" · "}
                                <a href={map} target="_blank" rel="noreferrer" className="underline">
                                  Map
                                </a>
                              </>
                            )}
                            {s.clientRef && ` · their ref ${s.clientRef}`}
                          </p>
                          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                            {s.contactName || s.contactPhone ? (
                              <>
                                On-site contact: {s.contactName ?? "—"}
                                {s.contactPhone && (
                                  <>
                                    {" · "}
                                    <a href={`tel:${s.contactPhone.replace(/\s/g, "")}`} className="underline">
                                      {s.contactPhone}
                                    </a>
                                  </>
                                )}
                              </>
                            ) : (
                              <span style={{ color: "var(--status-serious)" }}>No on-site contact — Control has nobody to ring at step 2</span>
                            )}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {s.location ? (
                            <StatusPill severity="good" label={`Location set · ${s.radiusMetres} m`} />
                          ) : (
                            <StatusPill severity="serious" label="No location" />
                          )}
                          <button type="button" disabled={!!denied} title={denied ?? undefined} className={small} style={{ borderColor: "var(--hairline)" }} onClick={() => setEditing({ kind: "site", clientId: c.id, clientName: c.name, site: s })}>
                            Edit site
                          </button>
                          <button type="button" disabled={!!denied || !s.active || !c.active} title={denied ?? undefined} className={small} style={{ borderColor: "var(--series-1)", color: "var(--series-1)" }} onClick={() => setEditing({ kind: "post", siteId: s.id, siteName: s.name })}>
                            Add a post
                          </button>
                        </div>
                      </div>
                      {s.posts.length === 0 ? (
                        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                          No posts yet.
                        </p>
                      ) : (
                        <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--hairline)" }}>
                          <table className="w-full min-w-[40rem] text-left text-[12px]">
                            <thead style={{ color: "var(--text-secondary)" }}>
                              <tr>
                                <th className="px-3 py-1.5 font-medium">Post</th>
                                <th className="px-3 py-1.5 font-medium">Pattern</th>
                                <th className="px-3 py-1.5 font-medium">Check calls</th>
                                <th className="px-3 py-1.5 font-medium">Conditions</th>
                                <th className="px-3 py-1.5 font-medium">Regular officer</th>
                                <th className="px-3 py-1.5 font-medium">Instructions</th>
                                <th className="px-3 py-1.5" />
                              </tr>
                            </thead>
                            <tbody>
                              {s.posts.map((p) => (
                                <tr key={p.id} className="border-t" style={{ borderColor: "var(--hairline)", opacity: p.active ? 1 : 0.6 }}>
                                  <td className="px-3 py-2 font-medium">
                                    {p.name}
                                    {!p.active && <span style={{ color: "var(--text-muted)" }}> · inactive</span>}
                                    {p.shiftsAhead > 0 && (
                                      <span className="block font-normal" style={{ color: "var(--text-muted)" }}>
                                        {p.shiftsAhead} shift{p.shiftsAhead === 1 ? "" : "s"} ahead
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">{p.pattern ?? "—"}</td>
                                  <td className="px-3 py-2">{CHECK_CALL_RULE_LABELS[p.checkCalls]}</td>
                                  <td className="px-3 py-2">
                                    {[p.loneWorking && "Lone working", !p.mobileSignal && "No signal", p.requiresSiaLicence ? "SIA" : "No SIA needed", `${p.screeningPeriodYears}-yr`].filter(Boolean).join(" · ")}
                                    {p.phone && (
                                      <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="block underline">
                                        {p.phone}
                                      </a>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">{p.regular ?? "Pool"}</td>
                                  <td className="px-3 py-2" style={{ color: p.instructions ? undefined : "var(--status-serious)" }}>
                                    {p.instructions ? `${p.instructions.slice(0, 60)}${p.instructions.length > 60 ? "…" : ""}` : "None yet"}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <button type="button" disabled={!!denied} title={denied ?? undefined} className={small} style={{ borderColor: "var(--hairline)" }} onClick={() => setEditing({ kind: "post", siteId: s.id, siteName: s.name, post: p })}>
                                      Edit
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>

      {editing?.kind === "client" && <ClientForm client={editing.client} onClose={() => setEditing(null)} onDone={done} />}
      {editing?.kind === "site" && <SiteForm clientId={editing.clientId} clientName={editing.clientName} site={editing.site} onClose={() => setEditing(null)} onDone={done} />}
      {editing?.kind === "post" && <PostForm siteId={editing.siteId} siteName={editing.siteName} post={editing.post} onClose={() => setEditing(null)} onDone={done} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The forms
// ---------------------------------------------------------------------------

type FormProps = { onClose: () => void; onDone: (r: ActionResult) => void };

function useSave(action: (prev: ActionResult | null, data: FormData) => Promise<ActionResult>, onDone: (r: ActionResult) => void) {
  return useFormAction(
    async (prev: ActionResult | null, data: FormData) => {
      const r = await action(prev, data);
      if (r.ok) onDone(r);
      return r;
    },
    { resetOnSuccess: false },
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-[12px] font-medium">
      <span>{label}</span>
      {children}
      {hint && (
        <span className="block font-normal" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function Check({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-[13px]">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4" />
      <span>
        {label}
        {hint && (
          <span className="block text-[12px]" style={{ color: "var(--text-muted)" }}>
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

function Save({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button type="submit" disabled={pending} className="h-10 w-full rounded-md text-[13px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--series-1)" }}>
      {pending ? "Saving…" : label}
    </button>
  );
}

function ClientForm({ client, onClose, onDone }: { client?: PlaceClient } & FormProps) {
  const { state, pending, form } = useSave(saveClient, onDone);
  return (
    <Drawer title={client ? `Edit ${client.name}` : "Add a client"} subtitle="The contract's terms reach every requirement and screening file for this client." onClose={onClose}>
      <form {...form} className="space-y-4">
        {client && <input type="hidden" name="id" value={client.id} />}
        <Field label="Client name">
          <input name="name" required defaultValue={client?.name} autoFocus className={input} style={inputStyle} />
        </Field>
        <Field label="Screening period" hint="From the contract: how far back BS 7858 screening looks for officers on this client's sites.">
          <select name="screeningPeriodYears" defaultValue={client?.screeningPeriodYears ?? 5} className={input} style={inputStyle}>
            <option value={5}>5 years</option>
            <option value={10}>10 years</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contract starts">
            <input type="date" name="contractStart" defaultValue={client?.contractStart ?? ""} className={input} style={inputStyle} />
          </Field>
          <Field label="Contract ends">
            <input type="date" name="contractEnd" defaultValue={client?.contractEnd ?? ""} className={input} style={inputStyle} />
          </Field>
        </div>
        <Check name="regulatedActivity" label="Regulated activity" hint="Posts may bring officers into contact with children or vulnerable adults." defaultChecked={client?.regulatedActivity} />
        <Check name="requiresAdditionalInterview" label="Additional interview required" hint="The client asks for a further interview before an officer starts." defaultChecked={client?.requiresAdditionalInterview} />
        {client && <Check name="active" label="Active client" hint="Untick when we stop covering them. Not while shifts are still ahead." defaultChecked={client.active} />}
        <Save pending={pending} label={client ? "Save changes" : "Add client"} />
        <Result state={state} />
      </form>
    </Drawer>
  );
}

function SiteForm({ clientId, clientName, site, onClose, onDone }: { clientId: string; clientName: string; site?: PlaceSite } & FormProps) {
  const { state, pending, form } = useSave(saveSite, onDone);
  const [location, setLocation] = useState(site?.location ? `${site.location.lat}, ${site.location.lng}` : "");
  const [finding, setFinding] = useState<string | null>(null);
  const here = () => {
    if (!navigator.geolocation) return setFinding("This browser cannot give a location.");
    setFinding("Finding where you are…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocation(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`);
        setFinding(`Set to where you are now (±${Math.round(p.coords.accuracy)} m). Only use this when you are at the site.`);
      },
      () => setFinding("The location was not given. Paste it from a map instead."),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };
  return (
    <Drawer title={site ? `Edit ${site.name}` : `Add a site to ${clientName}`} subtitle="Where it is, who to ring there, and how far from it an officer's selfie still counts as on site." onClose={onClose}>
      <form {...form} className="space-y-4">
        {site ? <input type="hidden" name="id" value={site.id} /> : <input type="hidden" name="clientId" value={clientId} />}
        <Field label="Site name">
          <input name="name" required defaultValue={site?.name} autoFocus className={input} style={inputStyle} />
        </Field>
        <Field label="Address">
          <textarea name="address" rows={2} defaultValue={site?.address ?? ""} className={`${input} h-auto py-2`} style={inputStyle} />
        </Field>
        <Field label="Location" hint="Paste “51.5074, -0.1278”, or a Google Maps link to the place (right-click the spot in Maps to copy its coordinates).">
          <input name="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="51.5074, -0.1278" className={input} style={inputStyle} />
        </Field>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <button type="button" onClick={here} className="h-8 rounded-md border px-3" style={{ borderColor: "var(--hairline)" }}>
            Use where I am now
          </button>
          {location && mapLink({ lat: Number(location.split(",")[0]), lng: Number(location.split(",")[1]) }) && (
            <a href={mapLink({ lat: Number(location.split(",")[0]), lng: Number(location.split(",")[1]) })!} target="_blank" rel="noreferrer" className="underline">
              Check it on a map
            </a>
          )}
          {finding && <span style={{ color: "var(--text-secondary)" }}>{finding}</span>}
        </div>
        <Field label="On-site radius (metres)" hint={`A selfie taken within this distance counts as at the site. ${RADIUS_LIMITS.default} m suits most sites; a large estate needs more.`}>
          <input type="number" name="radiusMetres" min={RADIUS_LIMITS.min} max={RADIUS_LIMITS.max} step={25} defaultValue={site?.radiusMetres ?? RADIUS_LIMITS.default} className={input} style={inputStyle} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="On-site contact">
            <input name="contactName" defaultValue={site?.contactName ?? ""} placeholder="e.g. Sam Price, gatehouse" className={input} style={inputStyle} />
          </Field>
          <Field label="Contact's phone">
            <input name="contactPhone" type="tel" defaultValue={site?.contactPhone ?? ""} className={input} style={inputStyle} />
          </Field>
        </div>
        <Field label="Client's reference for the site">
          <input name="clientRef" defaultValue={site?.clientRef ?? ""} className={input} style={inputStyle} />
        </Field>
        <Field label="Check-call instruction from the client">
          <input name="checkCallInstruction" defaultValue={site?.checkCallInstruction ?? ""} className={input} style={inputStyle} />
        </Field>
        {site && <Check name="active" label="Active site" hint="Untick when we stop covering it. Not while shifts are still ahead." defaultChecked={site.active} />}
        <Save pending={pending} label={site ? "Save changes" : "Add site"} />
        <Result state={state} />
      </form>
    </Drawer>
  );
}

function PostForm({ siteId, siteName, post, onClose, onDone }: { siteId: string; siteName: string; post?: PlacePost } & FormProps) {
  const { state, pending, form } = useSave(savePost, onDone);
  return (
    <Drawer title={post ? `Edit ${post.name}` : `Add a post at ${siteName}`} subtitle="What the officer on it does: when they make check calls, whether they can be reached, and what they need to know." onClose={onClose}>
      <form {...form} className="space-y-4">
        {post ? <input type="hidden" name="id" value={post.id} /> : <input type="hidden" name="siteId" value={siteId} />}
        <Field label="Post name">
          <input name="name" required defaultValue={post?.name} autoFocus placeholder="e.g. Night gatehouse" className={input} style={inputStyle} />
        </Field>
        <Field label="Usual pattern" hint="Days and hours, e.g. “Mon–Fri 19:00–07:00” or “Daily 06:00–18:00”. The rota suggests shifts from it.">
          <input name="pattern" defaultValue={post?.pattern ?? ""} className={input} style={inputStyle} />
        </Field>
        <fieldset className="space-y-1.5">
          <legend className="text-[12px] font-medium">Check calls</legend>
          {(Object.keys(CHECK_CALL_RULE_LABELS) as CheckCallRule[]).map((r) => (
            <label key={r} className="flex items-start gap-2 text-[13px]">
              <input type="radio" name="checkCalls" value={r} defaultChecked={(post?.checkCalls ?? "always") === r} className="mt-0.5" />
              <span>
                {CHECK_CALL_RULE_LABELS[r]}
                <span className="block text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {r === "always" ? "Hourly on every shift." : r === "nights_and_weekends" ? `Hourly on a shift with any hours ${NIGHT_HOURS.from}–${NIGHT_HOURS.to}, or on a Saturday or Sunday.` : "No hourly calls on this post."}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <Check name="loneWorking" label="Lone working" hint="The officer is on their own at the post." defaultChecked={post?.loneWorking} />
        <Check name="mobileSignal" label="Mobile signal at the post" hint="Untick where there is none: the officer books on before going in and the client holds contact on the site phone." defaultChecked={post?.mobileSignal ?? true} />
        <Check name="requiresSiaLicence" label="SIA licence required" defaultChecked={post?.requiresSiaLicence ?? true} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Screening period">
            <select name="screeningPeriodYears" defaultValue={post?.screeningPeriodYears ?? 5} className={input} style={inputStyle}>
              <option value={5}>5 years</option>
              <option value={10}>10 years</option>
            </select>
          </Field>
          <Field label="Phone at the post">
            <input name="phone" type="tel" defaultValue={post?.phone ?? ""} placeholder="The gatehouse line" className={input} style={inputStyle} />
          </Field>
        </div>
        <Field label="Instructions for the officer" hint="Shown to the officer on the shift in their portal: duties, patrol routes, keys, alarms, who to call.">
          <textarea name="instructions" rows={6} defaultValue={post?.instructions ?? ""} className={`${input} h-auto py-2`} style={inputStyle} />
        </Field>
        {post && <Check name="active" label="Active post" hint="Untick when it is no longer covered. Not while shifts are still ahead." defaultChecked={post.active} />}
        <Save pending={pending} label={post ? "Save changes" : "Add post"} />
        <Result state={state} />
      </form>
    </Drawer>
  );
}
