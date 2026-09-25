"use client";

import { useActionState, useId, useState } from "react";
import { signUp, type SignUpState } from "@/app/signup/actions";
import { Field, Notice, SubmitButton } from "./Field";

export interface DepartmentOption {
  id: string;
  label: string;
  description: string;
  /** Why it waits for approval, or null when it is active on registration. */
  needsApproval: string | null;
}

const EMPTY: SignUpState = {
  error: null,
  fields: {},
  values: { fullName: "", username: "", email: "", department: "" },
};

export function SignUpForm({
  departments,
  passwordMin,
}: {
  departments: DepartmentOption[];
  passwordMin: number;
}) {
  const [state, action, pending] = useActionState(signUp, EMPTY);
  const [dept, setDept] = useState(state.values.department);
  const selectId = useId();
  const chosen = departments.find((d) => d.id === dept);
  const f = state.fields;

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}

      <Field
        label="Full name"
        name="fullName"
        autoComplete="name"
        required
        defaultValue={state.values.fullName}
        error={f.fullName}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.values.username}
          error={f.username}
          hint="You sign in with this."
        />
        <Field
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values.email}
          error={f.email}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Password"
          name="password"
          password
          autoComplete="new-password"
          required
          minLength={passwordMin}
          error={f.password}
          hint={`At least ${passwordMin} characters.`}
        />
        <Field
          label="Confirm password"
          name="confirm"
          password
          autoComplete="new-password"
          required
          error={f.confirm}
        />
      </div>

      <div>
        <label htmlFor={selectId} className="block text-[12px] font-medium">
          Role / department
        </label>
        <select
          id={selectId}
          name="department"
          required
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          aria-invalid={f.department ? true : undefined}
          className="mt-1.5 h-10 w-full rounded-md border px-3 text-[13px] outline-none focus:border-[var(--series-1)] focus:ring-2 focus:ring-[var(--series-1)]/30"
          style={{
            background: "var(--surface-1)",
            color: dept ? "var(--text-primary)" : "var(--text-muted)",
            ...(f.department ? { borderColor: "var(--status-critical)" } : {}),
          }}
        >
          <option value="" disabled>
            Select your department
          </option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
              {d.needsApproval ? " (needs approval)" : ""}
            </option>
          ))}
        </select>
        {f.department ? (
          <p className="mt-1 text-[11px]" style={{ color: "var(--critical-text)" }}>
            {f.department}
          </p>
        ) : chosen ? (
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            {chosen.description}
          </p>
        ) : null}
      </div>

      {chosen?.needsApproval && (
        <Notice tone="info">
          <strong>This department needs approval.</strong> {chosen.needsApproval} Your account
          will be created now, and you can sign in once it has been approved.
        </Notice>
      )}

      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
}
