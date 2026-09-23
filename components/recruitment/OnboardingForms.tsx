"use client";

import { useFormAction } from "@/components/ui/useFormAction";
import { useActionState } from "react";
import {
  allocatePin,
  completeStep,
  confirmOnlineChecks,
  recordNextOfKin,
  recordSiaLicence,
  undoStep,
} from "@/lib/actions/onboarding";
import type { ActionResult } from "@/lib/actions/types";

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

const input =
  "h-9 w-full rounded-md border px-2.5 text-[12px] outline-none focus:border-[var(--series-1)] focus:ring-2 focus:ring-[var(--series-1)]/30";
const inputStyle = { background: "var(--surface-1)", color: "var(--text-primary)" } as const;

function Message({ state }: { state: ActionResult | null }) {
  if (!state || state.ok) return null;
  return (
    <p role="alert" className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--status-critical)" }}>
      {state.message}
    </p>
  );
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-8 rounded-md px-3 text-[12px] font-medium whitespace-nowrap text-white disabled:opacity-60"
      style={{ background: "var(--series-1)" }}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

/** A labelled field, compact enough to sit inside a checklist row. */
function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function useStep(action: Action) {
  return useActionState(action, null);
}

/** One click: the step is done. */
export function TickButton({ candidacyId, step }: { candidacyId: string; step: string }) {
  const [state, action, pending] = useStep(completeStep);
  return (
    <form action={action} className="text-right">
      <input type="hidden" name="candidacyId" value={candidacyId} />
      <input type="hidden" name="step" value={step} />
      <button
        type="submit"
        disabled={pending}
        className="h-8 rounded-md border px-3 text-[12px] font-medium whitespace-nowrap disabled:opacity-60"
        style={{ background: "var(--surface-1)" }}
      >
        {pending ? "Saving…" : "Mark done"}
      </button>
      <Message state={state} />
    </form>
  );
}

/** A step that has to say something, like the risk evaluation. */
export function NoteForm({ candidacyId, step, placeholder }: { candidacyId: string; step: string; placeholder: string }) {
  const { state, pending, form } = useFormAction(completeStep);
  return (
    <form {...form} className="mt-2 space-y-2">
      <input type="hidden" name="candidacyId" value={candidacyId} />
      <input type="hidden" name="step" value={step} />
      <textarea
        name="note"
        rows={2}
        required
        minLength={10}
        aria-label="Evaluation"
        placeholder={placeholder}
        className={`${input} h-auto py-2`}
        style={inputStyle}
      />
      <Submit pending={pending}>Save evaluation</Submit>
      <Message state={state} />
    </form>
  );
}

export function UndoButton({ candidacyId, step }: { candidacyId: string; step: string }) {
  const [state, action, pending] = useStep(undoStep);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="candidacyId" value={candidacyId} />
      <input type="hidden" name="step" value={step} />
      <button
        type="submit"
        disabled={pending}
        className="text-[11px] underline-offset-2 hover:underline"
        style={{ color: "var(--text-muted)" }}
      >
        {pending ? "Undoing…" : "Undo"}
      </button>
      <Message state={state} />
    </form>
  );
}

export function NextOfKinForm({ candidacyId }: { candidacyId: string }) {
  const { state, pending, form } = useFormAction(recordNextOfKin);
  return (
    <form {...form} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="candidacyId" value={candidacyId} />
      <Labelled label="Name">
        <input name="name" required autoComplete="off" className={input} style={inputStyle} />
      </Labelled>
      <Labelled label="Phone">
        <input name="phone" type="tel" required autoComplete="off" className={input} style={inputStyle} />
      </Labelled>
      <Submit pending={pending}>Save</Submit>
      <div className="sm:col-span-3">
        <Message state={state} />
      </div>
    </form>
  );
}

export function OnlineChecksForm({ candidacyId }: { candidacyId: string }) {
  const { state, pending, form } = useFormAction(confirmOnlineChecks);
  return (
    <form {...form} className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
      <input type="hidden" name="candidacyId" value={candidacyId} />
      <Labelled label="Note (optional)">
        <input name="note" autoComplete="off" placeholder="e.g. All five clear, recorded 21 Sept" className={input} style={inputStyle} />
      </Labelled>
      <Submit pending={pending}>Confirm checks</Submit>
      <div className="sm:col-span-2">
        <Message state={state} />
      </div>
    </form>
  );
}

export function SiaLicenceForm({ candidacyId, defaultName }: { candidacyId: string; defaultName: string }) {
  const { state, pending, form } = useFormAction(recordSiaLicence);
  return (
    <form {...form} className="mt-2 grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="candidacyId" value={candidacyId} />
      <Labelled label="Licence number (16 digits)">
        <input name="number" required inputMode="numeric" autoComplete="off" placeholder="1010 2233 4455 6677" className={input} style={inputStyle} />
      </Labelled>
      <Labelled label="Name exactly as on the badge">
        <input name="nameOnBadge" required autoComplete="off" defaultValue={defaultName} className={input} style={inputStyle} />
      </Labelled>
      <Labelled label="Licence type">
        <select name="kind" required defaultValue="sia_security_guarding" className={input} style={inputStyle}>
          <option value="sia_security_guarding">Security Guarding</option>
          <option value="sia_door_supervisor">Door Supervisor</option>
          <option value="sia_cctv">Public Space Surveillance (CCTV)</option>
          <option value="sia_close_protection">Close Protection</option>
        </select>
      </Labelled>
      <Labelled label="Expiry date">
        <input name="expiresAt" type="date" required className={input} style={inputStyle} />
      </Labelled>
      <div className="sm:col-span-2">
        <Submit pending={pending}>Record licence</Submit>
        <Message state={state} />
      </div>
    </form>
  );
}

export function PinForm({ candidacyId, teams }: { candidacyId: string; teams: { id: string; label: string }[] }) {
  const { state, pending, form } = useFormAction(allocatePin);
  return (
    <form {...form} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <input type="hidden" name="candidacyId" value={candidacyId} />
      <Labelled label="Control team">
        <select name="controlTeam" required defaultValue="" className={input} style={inputStyle}>
          <option value="" disabled>
            Choose…
          </option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </Labelled>
      <Labelled label="Conditional start (blank = today)">
        <input name="startedAt" type="date" className={input} style={inputStyle} />
      </Labelled>
      <Submit pending={pending}>Allocate PIN</Submit>
      <div className="sm:col-span-3">
        <Message state={state} />
      </div>
    </form>
  );
}
