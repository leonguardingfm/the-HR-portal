"use client";

import { useId, useState } from "react";

const inputClass =
  "h-11 w-full rounded-xl border px-3.5 text-[14px] outline-none transition-shadow focus:border-[var(--series-1)] focus:ring-2 focus:ring-[var(--series-1)]/30";

/**
 * One labelled form field. The error sits under the input and is wired to it
 * with aria-describedby, so a screen reader reads it with the field.
 */
export function Field({
  label,
  name,
  error,
  hint,
  type = "text",
  password = false,
  children,
  ...input
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  password?: boolean;
  children?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-[12px] font-medium">
        {label}
      </label>
      <div className="relative mt-1.5">
        {children ?? (
          <input
            id={id}
            name={name}
            type={password ? (shown ? "text" : "password") : type}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`${inputClass} ${password ? "pr-16" : ""}`}
            style={{
              background: "var(--surface-1)",
              color: "var(--text-primary)",
              ...(error ? { borderColor: "var(--status-critical)" } : {}),
            }}
            {...input}
          />
        )}
        {password && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 px-3 text-[11px] font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            {shown ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-[11px]" style={{ color: "var(--critical-text)" }}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 w-full rounded-full text-[14px] font-semibold transition-[opacity,transform] hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
      style={{ background: "var(--button-bg, var(--series-1))", color: "var(--button-fg, #fff)" }}
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  const bg = tone === "error" ? "var(--wash-critical)" : tone === "success" ? "var(--wash-good)" : "var(--wash-warning)";
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="rounded-md px-3 py-2.5 text-[12px] leading-relaxed"
      style={{ background: bg, color: "var(--text-primary)" }}
    >
      {children}
    </div>
  );
}
