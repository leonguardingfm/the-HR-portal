"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createCandidate, type NewCandidateState } from "@/lib/actions/recruitment";
import { Field, Notice } from "@/components/auth/Field";

const EMPTY: NewCandidateState = {
  error: null,
  fields: {},
  match: null,
  createdId: null,
  values: { fullName: "", email: "", phone: "", dateOfBirth: "", source: "", requirementId: "" },
};

const selectClass =
  "mt-1.5 h-10 w-full rounded-md border px-3 text-[13px] outline-none focus:border-[var(--series-1)] focus:ring-2 focus:ring-[var(--series-1)]/30";

export function NewCandidateForm({
  sources,
  requirements,
  defaultRequirementId,
}: {
  sources: { value: string; label: string }[];
  requirements: { id: string; label: string }[];
  defaultRequirementId?: string;
}) {
  const [state, action, pending] = useActionState(createCandidate, EMPTY);
  const f = state.fields;
  const v = state.values;

  if (state.createdId) {
    return (
      <div className="space-y-3">
        <Notice tone="success">
          <strong>Candidate added.</strong> They are at Sourcing and assigned to you.
        </Notice>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/candidates/${state.createdId}`}
            className="inline-flex h-9 items-center rounded-md px-3.5 text-[12px] font-medium text-white"
            style={{ background: "var(--series-1)" }}
          >
            Open their record
          </Link>
          {/* A full load, so the form starts empty rather than on this result. */}
          <a
            href="/candidates/new"
            className="inline-flex h-9 items-center rounded-md border px-3.5 text-[12px] font-medium"
            style={{ background: "var(--surface-1)" }}
          >
            Add another
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}

      {state.match && (
        <div
          role="alert"
          className="space-y-2.5 rounded-md border p-3.5 text-[12px] leading-relaxed"
          style={{ background: "var(--wash-warning)", borderColor: "var(--hairline)" }}
        >
          <p>
            <strong>This looks like {state.match.name}</strong>, who is already on record — matched
            by {state.match.via}. One person keeps one record, so their history carries over.
          </p>
          <div className="flex flex-wrap gap-2">
            {state.match.openCandidacyId ? (
              <Link
                href={`/candidates/${state.match.openCandidacyId}`}
                className="inline-flex h-8 items-center rounded-md px-3 font-medium text-white"
                style={{ background: "var(--series-1)" }}
              >
                Open their current application
              </Link>
            ) : null}
            {!state.error && (
              <button
                type="submit"
                name="existingPersonId"
                value={state.match.personId}
                disabled={pending}
                className="inline-flex h-8 items-center rounded-md border px-3 font-medium"
                style={{ background: "var(--surface-1)" }}
              >
                Add a new application for {state.match.name}
              </button>
            )}
          </div>
        </div>
      )}

      <Field
        label="Full name"
        name="fullName"
        autoComplete="off"
        required
        defaultValue={v.fullName}
        error={f.fullName}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Email address" name="email" type="email" autoComplete="off" defaultValue={v.email} error={f.email ?? f.contact} />
        <Field label="Phone" name="phone" type="tel" autoComplete="off" defaultValue={v.phone} error={f.phone} hint="Email or phone — at least one." />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Date of birth (optional)"
          name="dateOfBirth"
          type="date"
          defaultValue={v.dateOfBirth}
          error={f.dateOfBirth}
          hint="Strengthens the duplicate check."
        />
        <div>
          <label htmlFor="source" className="block text-[12px] font-medium">
            Source
          </label>
          <select key={`s-${v.source}`} id="source" name="source" defaultValue={v.source} className={selectClass} style={{ background: "var(--surface-1)" }}>
            <option value="">Not recorded</option>
            {sources.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="requirementId" className="block text-[12px] font-medium">
          Requirement
        </label>
        <select
          id="requirementId"
          name="requirementId"
          key={`r-${v.requirementId}`}
          defaultValue={v.requirementId || defaultRequirementId || ""}
          className={selectClass}
          style={{ background: "var(--surface-1)" }}
        >
          <option value="">General pool — no specific requirement</option>
          {requirements.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          The client decides which interviews are needed. Some ask for an additional interview of their own.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-md px-5 text-[13px] font-medium text-white disabled:opacity-60"
          style={{ background: "var(--series-1)" }}
        >
          {pending ? "Checking…" : "Add candidate"}
        </button>
        <Link href="/candidates" className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
