"use client";

import { useState } from "react";
import { Drawer } from "@/components/scheduling/Drawer";
import { Result, input, inputStyle } from "@/components/scheduling/RotaForms";
import { useFormAction } from "@/components/ui/useFormAction";
import { handOverMyWork, logHubTask, sendHubTestEmail } from "@/lib/actions/hub";
import type { ActionResult } from "@/lib/actions/types";
import { CATEGORIES, DEPARTMENTS, PRIORITIES, SOURCES, departmentLabel } from "@/lib/core/hub";
import { SAMPLE_EMAILS } from "@/lib/core/hub-samples";
import { localInput } from "./HubBits";

const primary = "h-10 w-full rounded-md text-[13px] font-semibold text-white disabled:opacity-60";
const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block text-[12px] font-medium">
    {label}
    <span className="mt-1 block">{children}</span>
  </label>
);

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

type Place = { id: string; name: string; sites: { id: string; name: string }[] };

/** A phone call, a WhatsApp, a walk-in: logged, owned and on the clock like an email. */
export function LogTaskButton({ departments, clients }: { departments: string[]; clients: Place[] }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("client_request");
  const f = useClosing(logHubTask, () => setOpen(false));
  return (
    <>
      <button type="button" data-shortcut="n" onClick={() => setOpen(true)} className="h-9 rounded-md px-3.5 text-[12px] font-semibold text-white" style={{ background: "var(--brand-navy)" }}>
        + Log manual task
      </button>
      {open && (
        <Drawer title="Log a task" subtitle="Anything that did not arrive by email. It gets a reference, an owner and the same clocks." onClose={() => setOpen(false)}>
          <form {...f.form} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <F label="Came in by">
                <select name="source" defaultValue="phone" className={input} style={inputStyle}>
                  {SOURCES.filter((s) => s.id !== "outlook" && s.id !== "client_portal").map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </F>
              <F label="When">
                <input name="receivedAt" type="datetime-local" defaultValue={localInput(new Date().toISOString())} className={input} style={inputStyle} />
              </F>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <F label="From (name)">
                <input name="senderName" className={input} style={inputStyle} />
              </F>
              <F label="Phone or email">
                <input name="contact" className={input} style={inputStyle} />
              </F>
            </div>
            <F label="Title">
              <input name="subject" required placeholder="e.g. Officer not arrived at Depot 7" className={input} style={inputStyle} />
            </F>
            <F label="What it is about">
              <textarea name="details" required rows={4} className={`${input} h-auto py-2`} style={inputStyle} />
            </F>
            <div className="grid grid-cols-2 gap-3">
              <F label="Category">
                <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={input} style={inputStyle}>
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </F>
              <F label="Priority">
                <select name="priority" defaultValue="medium" className={input} style={inputStyle}>
                  {PRIORITIES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </F>
            </div>
            {category === "other" && (
              <F label="What is it? (for “Other”)">
                <input name="categoryNote" required className={input} style={inputStyle} />
              </F>
            )}
            <div className="grid grid-cols-2 gap-3">
              <F label="Department">
                <select name="department" defaultValue={departments[0]} className={input} style={inputStyle}>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {departmentLabel(d)}
                    </option>
                  ))}
                </select>
              </F>
              <F label="Client and site (if any)">
                <select name="siteId" defaultValue="" className={input} style={inputStyle}>
                  <option value="">None</option>
                  {clients.map((c) => (
                    <optgroup key={c.id} label={c.name}>
                      {c.sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </F>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" name="take" defaultChecked className="h-4 w-4" /> I’ll take it on now
            </label>
            <button type="submit" disabled={f.pending} className={primary} style={{ background: "var(--series-1)" }}>
              {f.pending ? "Logging…" : "Log it"}
            </button>
            <Result state={f.state} />
          </form>
        </Drawer>
      )}
    </>
  );
}

/** Try it safely: an email into the test inbox, handled exactly as a real one will be. */
export function TestEmailButton({ mailboxes }: { mailboxes: { id: string; name: string; mode: string }[] }) {
  const [open, setOpen] = useState(false);
  const [sample, setSample] = useState("");
  const f = useClosing(sendHubTestEmail, () => setOpen(false));
  const s = SAMPLE_EMAILS.find((x) => x.key === sample);
  const test = mailboxes.filter((m) => m.mode === "test");
  if (!test.length) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="h-9 rounded-md border px-3 text-[12px] font-medium" style={{ borderColor: "var(--hairline)" }}>
        ✉ Send test email
      </button>
      {open && (
        <Drawer title="Send a test email" subtitle="Into the test inbox only. It is read, sorted and timed exactly like a real email; nothing is sent anywhere." onClose={() => setOpen(false)}>
          <form key={sample} {...f.form} className="space-y-3">
            <F label="Start from a sample (optional)">
              <select name="sample" value={sample} onChange={(e) => setSample(e.target.value)} className={input} style={inputStyle}>
                <option value="">Write my own</option>
                {SAMPLE_EMAILS.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.subject}
                  </option>
                ))}
              </select>
            </F>
            <F label="Into">
              <select name="mailboxId" defaultValue={test.find((m) => s && m.name.toLowerCase().startsWith(s.mailbox === "control" ? "control" : s.mailbox === "hr" ? "hr" : "accounts"))?.id ?? test[0].id} className={input} style={inputStyle}>
                {test.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </F>
            <div className="grid grid-cols-2 gap-3">
              <F label="From (name)">
                <input name="fromName" defaultValue={s?.fromName ?? ""} className={input} style={inputStyle} />
              </F>
              <F label="From (email)">
                <input name="fromAddress" type="email" defaultValue={s?.fromAddress ?? ""} placeholder="someone@example.com" className={input} style={inputStyle} />
              </F>
            </div>
            <F label="Subject">
              <input name="subject" defaultValue={s?.subject ?? ""} className={input} style={inputStyle} />
            </F>
            <F label="Message">
              <textarea name="body" rows={7} defaultValue={s?.body ?? ""} className={`${input} h-auto py-2`} style={inputStyle} />
            </F>
            <button type="submit" disabled={f.pending} className={primary} style={{ background: "var(--series-1)" }}>
              {f.pending ? "Sending…" : "Send into the test inbox"}
            </button>
            <Result state={f.state} />
          </form>
        </Drawer>
      )}
    </>
  );
}

/** End of shift: everything still open goes to the next person, with a note of where it has got to. */
export function HandOverButton({ mine, staff, meId }: { mine: { id: string; ref: string; subject: string }[]; staff: { id: string; name: string; onShift: boolean }[]; meId: string }) {
  const [open, setOpen] = useState(false);
  const f = useClosing(handOverMyWork, () => setOpen(false));
  if (!mine.length) return null;
  const others = staff.filter((s) => s.id !== meId);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="h-9 rounded-md border px-3 text-[12px] font-medium" style={{ borderColor: "var(--hairline)" }}>
        ⇄ Hand over my work ({mine.length})
      </button>
      {open && (
        <Drawer title="Hand over my work" subtitle="For the end of your shift. The next person owns them from now, and your note goes with them." onClose={() => setOpen(false)}>
          <form {...f.form} className="space-y-3">
            <fieldset className="space-y-1.5">
              <legend className="text-[12px] font-medium">What to hand over</legend>
              {mine.map((t) => (
                <label key={t.id} className="flex items-start gap-2 text-[13px]">
                  <input type="checkbox" name="taskId" value={t.id} defaultChecked className="mt-0.5 h-4 w-4" />
                  <span>
                    <span className="font-medium">{t.ref}</span> {t.subject}
                  </span>
                </label>
              ))}
            </fieldset>
            <F label="To">
              <select name="toUserId" required defaultValue="" className={input} style={inputStyle}>
                <option value="" disabled>
                  Choose who takes over
                </option>
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.onShift ? " — on shift now" : ""}
                  </option>
                ))}
              </select>
            </F>
            <F label="Handover note">
              <textarea name="note" required rows={4} placeholder="Where each one has got to, and what happens next" className={`${input} h-auto py-2`} style={inputStyle} />
            </F>
            <button type="submit" disabled={f.pending} className={primary} style={{ background: "var(--series-1)" }}>
              {f.pending ? "Handing over…" : "Hand over"}
            </button>
            <Result state={f.state} />
          </form>
        </Drawer>
      )}
    </>
  );
}

export { DEPARTMENTS };
