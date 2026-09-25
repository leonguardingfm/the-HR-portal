"use client";

import { useState } from "react";
import { Drawer } from "@/components/scheduling/Drawer";
import { Result, input, inputStyle } from "@/components/scheduling/RotaForms";
import { Card } from "@/components/ui/Card";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { useFormAction } from "@/components/ui/useFormAction";
import { grantRole, resetUserPassword, resetUserTwoFactor, revokeRole, setTwoFactorPolicy, unlockUser } from "@/lib/actions/accounts";
import type { ActionResult } from "@/lib/actions/types";
import { ROLE_DEPARTMENT, ROLE_LABELS } from "@/lib/labels";
import type { Role } from "@/lib/types";

export interface PersonRow {
  id: string;
  name: string;
  username: string | null;
  roles: Role[];
  lockedUntil: string | null;
  twoFactor: boolean;
  lastSignInAt: string | null;
  screening: { own: boolean; nda: boolean; training: string | null; blocked: string | null } | null;
}

const GRANTABLE: Role[] = ["control", "shift_supervisor", "operations_manager", "recruitment", "recruitment_manager", "vetting_admin", "vetting_controller", "admin_officer", "admin_manager", "finance_officer", "top_management", "auditor", "sales"];
type Act = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

function Action({ label, title, subtitle, action, children, submit, danger = false }: { label: string; title: string; subtitle: string; action: Act; children?: React.ReactNode; submit: string; danger?: boolean }) {
  const [open, setOpen] = useState(false);
  const f = useFormAction(action, { resetOnSuccess: false });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-[12px] underline underline-offset-2" style={{ color: danger ? "var(--status-critical)" : "var(--series-1)" }}>
        {label}
      </button>
      {open && (
        <Drawer title={title} subtitle={subtitle} onClose={() => setOpen(false)}>
          <form {...f.form} className="space-y-3">
            {children}
            <button type="submit" disabled={f.pending} className="h-10 w-full rounded-md text-[13px] font-semibold text-white disabled:opacity-60" style={{ background: danger ? "var(--status-critical)" : "var(--series-1)" }}>
              {f.pending ? "…" : submit}
            </button>
            <Result state={f.state} />
          </form>
        </Drawer>
      )}
    </>
  );
}

/**
 * Who holds which role, for real (26 September 2026): the Managing Director
 * gives and takes away roles here, with a reason each time; the Admin Manager
 * resets a forgotten password or a lost phone's two-factor, and unlocks an
 * account. Every one of these is written to the audit log.
 */
export function PeopleRoles({ rows, meId, can, policy }: { rows: PersonRow[]; meId: string; can: { grant: boolean; reset: boolean; policy: boolean }; policy: string }) {
  const [q, setQ] = useState("");
  const shown = rows.filter((r) => !q || `${r.name} ${r.username ?? ""} ${r.roles.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const pol = useFormAction(setTwoFactorPolicy, { resetOnSuccess: false });
  return (
    <div className="space-y-5">
      <Card
        title="People and roles"
        subtitle="Everyone with an account, from the database. Roles are given and taken away here — with a reason, recorded — so a promotion or a transfer is an edit, not a release."
        action={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person or role" aria-label="Find a person or role" className="h-8 w-52 rounded-md border px-2.5 text-[12px]" style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }} />}
      >
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[60rem] border-collapse text-left">
            <thead>
              <tr className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                <th className="px-5 pb-2 font-medium">Person</th>
                <th className="pb-2 pr-3 font-medium">Roles held</th>
                <th className="pb-2 pr-3 font-medium">Sign-in</th>
                <th className="pb-2 pr-3 font-medium">Screening competence (6.1, 6.2)</th>
                <th className="pb-2 pr-5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => {
                const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                return (
                  <tr key={u.id} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
                    <td className="px-5 py-2.5">
                      <p className="text-[13px] font-medium">{u.name}</p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {u.username ?? "no username"}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 && <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>None</span>}
                        {u.roles.map((r) =>
                          can.grant && u.id !== meId && r !== "officer" && r !== "client" ? (
                            <Action key={r} label={`${ROLE_LABELS[r]} ×`} title={`Take away ${ROLE_LABELS[r]} from ${u.name}`} subtitle="If they are working in that role now, they are signed out of it at once." action={revokeRole.bind(null, u.id, r)} submit="Take the role away" danger>
                              <label className="block text-[12px] font-medium">
                                Why
                                <input name="reason" required className={`${input} mt-1`} style={inputStyle} placeholder="e.g. moved to HR" />
                              </label>
                            </Action>
                          ) : (
                            <Tag key={r}>{ROLE_LABELS[r]}</Tag>
                          ),
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-[12px]">
                      <div className="flex flex-wrap items-center gap-1">
                        {locked ? <StatusPill severity="critical" label="Locked" /> : null}
                        <StatusPill severity={u.twoFactor ? "good" : "neutral"} label={u.twoFactor ? "Two-factor on" : "Password only"} />
                      </div>
                      <p className="mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {u.lastSignInAt ? `Last in ${new Date(u.lastSignInAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Not signed in yet"}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {u.screening ? (
                        <>
                          <span>{u.screening.own ? "Screened" : "Not screened"} · {u.screening.nda ? "NDA on file" : "No NDA"} · training {u.screening.training ? new Date(u.screening.training).toLocaleDateString("en-GB") : "none"}</span>
                          {u.screening.blocked && <p style={{ color: "var(--status-critical)" }}>{u.screening.blocked}</p>}
                        </>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>Not a screening role</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-5">
                      <div className="flex flex-col items-start gap-1">
                        {can.grant && u.id !== meId && (
                          <Action label="Give a role" title={`Give ${u.name} a role`} subtitle="For a lasting change. Cover for an absence is a delegation, below." action={grantRole.bind(null, u.id)} submit="Give the role">
                            <label className="block text-[12px] font-medium">
                              Role
                              <select name="role" required className={`${input} mt-1`} style={inputStyle} defaultValue="">
                                <option value="" disabled>
                                  Choose
                                </option>
                                {GRANTABLE.filter((r) => !u.roles.includes(r)).map((r) => (
                                  <option key={r} value={r}>
                                    {ROLE_LABELS[r]} · {ROLE_DEPARTMENT[r]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block text-[12px] font-medium">
                              Why
                              <input name="basis" required className={`${input} mt-1`} style={inputStyle} placeholder="e.g. Promoted to Shift Supervisor from 1 October" />
                            </label>
                          </Action>
                        )}
                        {can.reset && u.id !== meId && u.username && (
                          <Action label="Reset password" title={`Reset ${u.name}'s password`} subtitle="A temporary password is shown once, for you to give them in person or by phone. They choose their own when they next sign in." action={resetUserPassword.bind(null, u.id)} submit="Make a temporary password" />
                        )}
                        {can.reset && u.twoFactor && (
                          <Action label="Reset two-factor" title={`Reset ${u.name}'s two-factor`} subtitle="For a lost or new phone. Check it is really them first — ring them on the number you hold." action={resetUserTwoFactor.bind(null, u.id)} submit="Reset two-factor" danger>
                            <label className="block text-[12px] font-medium">
                              Why
                              <input name="reason" required className={`${input} mt-1`} style={inputStyle} placeholder="e.g. lost phone, confirmed by phone call" />
                            </label>
                          </Action>
                        )}
                        {can.reset && locked && <Action label="Unlock" title={`Unlock ${u.name}`} subtitle="Their account was locked after too many wrong passwords or codes." action={unlockUser.bind(null, u.id)} submit="Unlock" />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          A screening role cannot be given until the person is screened themselves, has a confidentiality agreement on file and holds training that is in date (6.1, 6.2). Someone else always grants your own roles, and higher management can never be left empty.
        </p>
      </Card>

      <Card title="Two-factor sign-in" subtitle="Who must use a code from an authenticator app as well as their password. Anyone it applies to is asked to set it up when they next sign in.">
        <form {...pol.form} className="flex flex-wrap items-end gap-3">
          <fieldset className="space-y-1.5" disabled={!can.policy}>
            {(
              [
                ["off", "Optional for everyone"],
                ["managers", "Required for managers and screening staff (recommended at go-live)"],
                ["staff", "Required for all office staff"],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 text-[13px]">
                <input type="radio" name="policy" value={v} defaultChecked={policy === v} className="h-4 w-4" />
                {l}
              </label>
            ))}
          </fieldset>
          {can.policy && (
            <button type="submit" disabled={pol.pending} className="h-9 rounded-md px-3 text-[12px] font-semibold text-white" style={{ background: "var(--series-1)" }}>
              Save
            </button>
          )}
          <Result state={pol.state} />
        </form>
      </Card>
    </div>
  );
}
