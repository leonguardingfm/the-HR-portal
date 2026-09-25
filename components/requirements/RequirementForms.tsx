"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { useFormAction } from "@/components/ui/useFormAction";
import {
  cancelRequirement,
  raiseRequirement,
  recordPoolCheck,
  releaseToSourcing,
  removeAllocation,
  type RaiseState,
} from "@/lib/actions/requirements";
import type { ActionResult } from "@/lib/actions/types";

const field = "h-9 rounded-md border px-2.5 text-[13px] outline-none focus:border-[var(--series-1)] focus:ring-2 focus:ring-[var(--series-1)]/30";
const input = `${field} w-full`;
const inputStyle = { background: "var(--surface-1)", color: "var(--text-primary)" } as const;
const primary = "h-9 rounded-md px-4 text-[12px] font-medium whitespace-nowrap text-white disabled:opacity-50";
const quiet = "h-8 rounded-md border px-3 text-[12px] font-medium whitespace-nowrap disabled:opacity-50";

function Result({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className="mt-1.5 text-[12px] leading-snug"
      style={{ color: state.ok ? "var(--good-text)" : "var(--critical-text)" }}
    >
      {state.message}
    </p>
  );
}

function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block text-[12px] font-medium ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      <span className="mt-1.5 block">{children}</span>
      {hint && (
        <span className="mt-1 block text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export interface ClientOption {
  id: string;
  name: string;
  screeningPeriodYears: number;
  requiresAdditionalInterview: boolean;
  sites: { id: string; name: string; posts: { name: string }[] }[];
}

/** A1: raise a requirement. The site list follows the client; the post list follows the site. */
export function RaiseRequirementForm({ clients }: { clients: ClientOption[] }) {
  const [state, dispatch, pending] = useActionState<RaiseState, FormData>(raiseRequirement, {
    error: null,
    createdId: null,
    reference: null,
  });
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const client = clients.find((c) => c.id === clientId);
  const site = client?.sites.find((s) => s.id === siteId);

  // Submitted without React's automatic reset, so a refusal keeps what was typed.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  }

  if (state.createdId) {
    return (
      <div className="space-y-3">
        <p role="status" className="rounded-md px-3 py-2.5 text-[13px]" style={{ background: "var(--wash-good)" }}>
          <strong>{state.reference}</strong> raised. Control has a pool-check task due within one working day.
        </p>
        <div className="flex gap-2">
          <Link href={`/requirements/${state.createdId}`} className={`${primary} inline-flex items-center`} style={{ background: "var(--series-1)" }}>
            Open it and check the pool
          </Link>
          <a href="/requirements/new" className={`${quiet} inline-flex items-center`} style={{ background: "var(--surface-1)" }}>
            Raise another
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      {state.error && (
        <p role="alert" className="rounded-md px-3 py-2.5 text-[12px] sm:col-span-2" style={{ background: "var(--wash-critical)" }}>
          {state.error}
        </p>
      )}
      <Field label="Client">
        <select
          name="clientId"
          required
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setSiteId("");
          }}
          className={input}
          style={inputStyle}
        >
          <option value="" disabled>
            Choose the client…
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Site">
        <select name="siteId" required value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={!client} className={input} style={inputStyle}>
          <option value="" disabled>
            {client ? "Choose the site…" : "Choose the client first"}
          </option>
          {client?.sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      {client && (
        <p className="rounded-md px-3 py-2 text-[12px] sm:col-span-2" style={{ background: "var(--wash-neutral)" }}>
          {client.name}&rsquo;s contract: <strong>{client.screeningPeriodYears}-year screening period</strong>
          {client.requiresAdditionalInterview ? " · the client holds an additional interview of its own" : ""}. This is what the vetting deadline is set from.
        </p>
      )}
      <Field label="Post" hint={site?.posts.length ? "Pick an existing post or type a new one." : undefined}>
        <input name="post" required list="site-posts" autoComplete="off" placeholder="e.g. Gatehouse, night" className={input} style={inputStyle} />
        <datalist id="site-posts">
          {site?.posts.map((p) => <option key={p.name} value={p.name} />)}
        </datalist>
      </Field>
      <Field label="Officers needed">
        <input name="headcount" type="number" min={1} max={50} defaultValue={1} required className={input} style={inputStyle} />
      </Field>
      <Field label="Cover needed from">
        <input name="startDate" type="date" required className={input} style={inputStyle} />
      </Field>
      <Field label="Shift pattern (optional)">
        <input name="shiftPattern" autoComplete="off" placeholder="e.g. 4 on 4 off, 19:00–07:00" className={input} style={inputStyle} />
      </Field>
      <Field label="Control team">
        <select name="controlTeam" required defaultValue="" className={input} style={inputStyle}>
          <option value="" disabled>
            Choose…
          </option>
          <option value="alpha">Control Alpha</option>
          <option value="bravo">Control Bravo</option>
        </select>
      </Field>
      <Field label="Note (optional)" wide>
        <input name="note" autoComplete="off" placeholder="Anything the client said: site induction, uniform, who to report to" className={input} style={inputStyle} />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={primary} style={{ background: "var(--series-1)" }}>
          {pending ? "Raising…" : "Raise requirement"}
        </button>
        <Link href="/requirements" className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function PoolCheckForm({ requirementId, current }: { requirementId: string; current: string | null }) {
  const { state, pending, form } = useFormAction(recordPoolCheck);
  return (
    <form {...form} className="space-y-2">
      <input type="hidden" name="requirementId" value={requirementId} />
      <textarea
        name="note"
        rows={2}
        required
        aria-label="What the pool check found"
        defaultValue={current ?? ""}
        placeholder="Who you tried and what they said — e.g. Wesley and Liam asked, neither free Tuesdays"
        className={`${input} h-auto py-2`}
        style={inputStyle}
      />
      <button type="submit" disabled={pending} className={quiet} style={{ background: "var(--surface-1)" }}>
        {pending ? "Saving…" : "Record the pool check"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function ReleaseForm({ requirementId, remaining }: { requirementId: string; remaining: number }) {
  const { state, pending, form } = useFormAction(releaseToSourcing);
  return (
    <form {...form} className="space-y-2">
      <input type="hidden" name="requirementId" value={requirementId} />
      <textarea
        name="note"
        rows={2}
        required
        aria-label="Why the pool cannot cover it"
        placeholder="Why the pool cannot cover it — this is what HR is handed"
        className={`${input} h-auto py-2`}
        style={inputStyle}
      />
      <button type="submit" disabled={pending} className={primary} style={{ background: "var(--series-1)" }}>
        {pending ? "Releasing…" : `Release ${remaining} place${remaining === 1 ? "" : "s"} to HR`}
      </button>
      <Result state={state} />
    </form>
  );
}

export function RemoveAllocationForm({ allocationId }: { allocationId: string }) {
  const { state, pending, form } = useFormAction(removeAllocation);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-[11px] underline-offset-2 hover:underline" style={{ color: "var(--text-muted)" }}>
        Take off
      </button>
    );
  }
  return (
    <form {...form} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="allocationId" value={allocationId} />
      <input name="reason" required aria-label="Why they are coming off" placeholder="Why" className={`${field} h-8 w-48`} style={inputStyle} />
      <button type="submit" disabled={pending} className={quiet} style={{ background: "var(--surface-1)" }}>
        {pending ? "Saving…" : "Take off"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function CancelForm({ requirementId }: { requirementId: string }) {
  const { state, pending, form } = useFormAction(cancelRequirement);
  return (
    <details className="rounded-md border" style={{ borderColor: "var(--hairline)" }}>
      <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium select-none" style={{ color: "var(--text-secondary)" }}>
        Cancel this requirement
      </summary>
      <form {...form} className="space-y-2 border-t px-3 pt-3 pb-3" style={{ borderColor: "var(--hairline)" }}>
        <input type="hidden" name="requirementId" value={requirementId} />
        <input name="reason" required aria-label="Why it is cancelled" placeholder="Why — the client withdrew it, raised in error" className={input} style={inputStyle} />
        <button
          type="submit"
          disabled={pending}
          className={quiet}
          style={{ borderColor: "var(--status-critical)", color: "var(--critical-text)", background: "var(--surface-1)" }}
        >
          {pending ? "Cancelling…" : "Cancel requirement"}
        </button>
        <Result state={state} />
      </form>
    </details>
  );
}
