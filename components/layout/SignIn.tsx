"use client";

import { useState } from "react";
import { ROLE_OPTIONS } from "@/lib/roles";
import type { Role } from "@/lib/types";
import { useSession } from "./SessionContext";

/**
 * Sign-in.
 *
 * Name, then the role you are working as for this session. Both are required,
 * because the second is what lets the portal show who is doing which work in
 * real time — a job title cannot do that when people hold several roles and
 * move between teams.
 *
 * No role is preselected. A default would get accepted without being read, and
 * the whole point of the field is that it reflects what the person is actually
 * doing today.
 */
export function SignIn() {
  const { signIn } = useSession();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [touched, setTouched] = useState(false);

  const nameValid = name.trim().length > 1;
  const valid = nameValid && role !== "";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div
        className="w-full max-w-md rounded-lg border p-6"
        style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}
      >
        <h1 className="text-lg font-semibold tracking-tight">HR Portal</h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Recruitment &amp; Vetting. Sign in with your name and the role you are
          working as right now.
        </p>

        <form
          className="mt-6 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (valid) signIn(name, role as Role);
          }}
        >
          <div>
            <label htmlFor="name" className="block text-[12px] font-medium">
              Your name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ahmed"
              aria-invalid={touched && !nameValid}
              className="mt-1.5 w-full rounded border px-2.5 py-2 text-[13px]"
              style={{
                background: "var(--page)",
                borderColor:
                  touched && !nameValid ? "var(--status-critical)" : "var(--hairline)",
                color: "var(--text-primary)",
              }}
            />
            {touched && !nameValid && (
              <p className="mt-1 text-[11px]" style={{ color: "var(--status-critical)" }}>
                Enter the name you are known by, so your work is attributed to you.
              </p>
            )}
          </div>

          <fieldset>
            <legend className="text-[12px] font-medium">Working as</legend>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
              Pick the role you are performing this session. You can change it
              later without signing out.
            </p>
            <div className="mt-2 space-y-1.5">
              {ROLE_OPTIONS.map((option) => {
                const selected = role === option.id;
                return (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-start gap-2.5 rounded border p-2.5"
                    style={{
                      borderColor: selected ? "var(--series-1)" : "var(--hairline)",
                      background: selected ? "var(--wash)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={option.id}
                      checked={selected}
                      onChange={() => setRole(option.id)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">
                        {option.label}
                        {option.clause && (
                          <span
                            className="ml-1.5 text-[10px] font-normal"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {option.clause}
                          </span>
                        )}
                      </span>
                      <span
                        className="block text-[11px] leading-snug"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {option.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {touched && role === "" && (
              <p className="mt-1.5 text-[11px]" style={{ color: "var(--status-critical)" }}>
                Choose the role you are working as.
              </p>
            )}
          </fieldset>

          <button
            type="submit"
            className="w-full rounded px-3 py-2 text-[13px] font-medium"
            style={{
              background: valid ? "var(--series-1)" : "var(--wash-neutral)",
              color: valid ? "#ffffff" : "var(--text-muted)",
              cursor: valid ? "pointer" : "not-allowed",
            }}
          >
            Sign in
          </button>
        </form>

        <p className="mt-5 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
          This records who is doing what; it does not verify who you are. Real
          authentication arrives with the Phase&nbsp;1 backend, where identity
          comes from company sign-on and the active role is recorded against
          every action in the audit log.
        </p>
      </div>
    </main>
  );
}
