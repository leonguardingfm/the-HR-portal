"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/actions/types";

/**
 * A button that performs a real write.
 *
 * Three states worth designing for, not two: it worked, it was refused, and
 * it is in flight. A refusal is a normal outcome — the wrong role, or the state
 * changed under you — so it is shown in place rather than thrown as an error,
 * and the message says whose job it is instead.
 *
 * When the role cannot take the action at all the button is rendered disabled
 * with the reason, not hidden. People need to know the thing exists and who
 * owns it, or they ring round asking why they cannot find it.
 */
export function ActionButton({
  action,
  label,
  fields,
  variant = "quiet",
  denied,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  label: string;
  fields?: Record<string, string>;
  variant?: "primary" | "quiet";
  denied?: string | null;
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
          {label}
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <form action={formAction}>
        {fields &&
          Object.entries(fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <button
          type="submit"
          disabled={pending}
          className="rounded border px-2 py-1 text-[11px] font-medium whitespace-nowrap disabled:opacity-60"
          style={
            variant === "primary"
              ? { background: "var(--series-1)", borderColor: "var(--series-1)", color: "#fff" }
              : {
                  background: "var(--surface-1)",
                  borderColor: "var(--hairline)",
                  color: "var(--text-primary)",
                }
          }
        >
          {pending ? "Working…" : label}
        </button>
      </form>
      {state && (
        <span
          className="max-w-[22rem] text-[11px] leading-snug"
          style={{ color: state.ok ? "var(--status-good)" : "var(--status-critical)" }}
        >
          {state.message}
        </span>
      )}
    </span>
  );
}
