"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/actions/types";

export interface Field {
  name: string;
  label: string;
  kind?: "text" | "number" | "date" | "select" | "textarea" | "hidden";
  /** For a select. */
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  value?: string;
}

/**
 * A write that needs something typed.
 *
 * The same three states as ActionButton — it worked, it was refused, it is in
 * flight — but with fields, because several Admin decisions cannot honestly be
 * a single click. An approval over the high threshold has to carry its grounds;
 * a rejection has to say why. Making those a required field here is the first
 * of three places that rule is enforced, and the server and the database are
 * the other two.
 *
 * A role that cannot take the action at all gets the form disabled with the
 * reason, rather than the form disappearing. People need to know the thing
 * exists and whose job it is.
 */
export function ActionForm({
  action,
  fields,
  submitLabel,
  variant = "quiet",
  denied,
  compact = false,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  fields: Field[];
  submitLabel: string;
  variant?: "primary" | "quiet";
  denied?: string | null;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  if (denied) {
    return (
      <span className="inline-flex flex-col gap-1">
        <button
          type="button"
          disabled
          title={denied}
          className="cursor-not-allowed rounded border px-2 py-1 text-[11px] font-medium opacity-50"
          style={{
            borderStyle: "dashed",
            borderColor: "var(--hairline)",
            color: "var(--text-secondary)",
          }}
        >
          {submitLabel}
        </button>
        <span className="max-w-xs text-[10px] leading-snug" style={{ color: "var(--text-muted)" }}>
          {denied}
        </span>
      </span>
    );
  }

  const inputStyle = {
    borderColor: "var(--hairline)",
    background: "var(--surface-2, var(--surface-1))",
    color: "var(--text-primary)",
  } as const;

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <div className={compact ? "flex flex-wrap items-end gap-1.5" : "flex flex-col gap-1.5"}>
        {fields.map((f) => {
          const kind = f.kind ?? "text";
          if (kind === "hidden") {
            return <input key={f.name} type="hidden" name={f.name} value={f.value ?? ""} />;
          }
          return (
            <label key={f.name} className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {f.label}
                {f.required && " *"}
              </span>
              {kind === "select" ? (
                <select
                  name={f.name}
                  required={f.required}
                  defaultValue={f.value}
                  className="rounded border px-1.5 py-1 text-[12px]"
                  style={inputStyle}
                >
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : kind === "textarea" ? (
                <textarea
                  name={f.name}
                  required={f.required}
                  placeholder={f.placeholder}
                  defaultValue={f.value}
                  rows={2}
                  className="w-full rounded border px-1.5 py-1 text-[12px]"
                  style={inputStyle}
                />
              ) : (
                <input
                  type={kind}
                  name={f.name}
                  required={f.required}
                  placeholder={f.placeholder}
                  defaultValue={f.value}
                  step={kind === "number" ? "any" : undefined}
                  className={`rounded border px-1.5 py-1 text-[12px] ${compact ? "w-28" : "w-full"}`}
                  style={inputStyle}
                />
              )}
            </label>
          );
        })}

        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded border px-2 py-1 text-[11px] font-medium"
          style={
            variant === "primary"
              ? {
                  borderColor: "var(--text-primary)",
                  background: "var(--text-primary)",
                  color: "var(--surface-1)",
                  opacity: pending ? 0.6 : 1,
                }
              : {
                  borderColor: "var(--hairline)",
                  color: "var(--text-primary)",
                  opacity: pending ? 0.6 : 1,
                }
          }
        >
          {pending ? "Working…" : submitLabel}
        </button>
      </div>

      {state && (
        <p
          role="status"
          className="max-w-md text-[11px] leading-snug"
          style={{ color: state.ok ? "var(--status-good)" : "var(--status-serious)" }}
        >
          {state.ok ? "✓ " : "✕ "}
          {state.message}
        </p>
      )}
    </form>
  );
}
