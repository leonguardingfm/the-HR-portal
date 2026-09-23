"use client";

import { useActionState } from "react";
import { approveAccount } from "@/lib/actions/accounts";

const EVIDENCE = [
  ["screened", "Their own BS 7858 screening is complete (6.1)"],
  ["nda", "A confidentiality agreement is on file (6.1)"],
  ["trained", "Screening training has been given and reviewed (6.2)"],
] as const;

/**
 * Approving a registration. For a screening department the approver has to
 * confirm the three pieces of 6.1/6.2 evidence, because the grant rule refuses
 * a screening role without them and the person cannot vouch for themselves.
 */
export function ApproveAccount({
  userId,
  screening,
  denied,
}: {
  userId: string;
  screening: boolean;
  denied?: string | null;
}) {
  const [state, action, pending] = useActionState(approveAccount, null);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      {screening && (
        <fieldset className="space-y-1.5">
          <legend className="sr-only">Screening evidence</legend>
          {EVIDENCE.map(([name, label]) => (
            <label key={name} className="flex items-start gap-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
              <input type="checkbox" name={name} className="mt-0.5" disabled={Boolean(denied)} />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      <button
        type="submit"
        disabled={pending || Boolean(denied)}
        title={denied ?? undefined}
        className="rounded border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap disabled:opacity-50"
        style={{ background: "var(--series-1)", borderColor: "var(--series-1)", color: "#fff" }}
      >
        {pending ? "Working…" : "Approve"}
      </button>
      {state && (
        <p
          className="text-[11px] leading-snug"
          style={{ color: state.ok ? "var(--status-good)" : "var(--status-critical)" }}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
