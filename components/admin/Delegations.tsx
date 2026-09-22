import { Card } from "@/components/ui/Card";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { ActionForm } from "./ActionForm";
import { delegateRole, revokeDelegation } from "@/lib/actions/delegation";
// The limit comes from the rules module, not from the actions file: a
// "use server" file may only export async functions, so a constant re-exported
// through it breaks the build. Worth knowing before doing it again.
import { MAX_DELEGATION_DAYS } from "@/lib/auth/delegation";
import { ROLE_LABELS } from "@/lib/labels";
import { ROLE_OPTIONS } from "@/lib/roles";
import { formatShortDate } from "@/lib/format";
import type { Role } from "@/lib/types";

export interface DelegationRow {
  id: string;
  role: Role;
  fromName: string;
  toName: string;
  grantedByName: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  daysLeft: number;
  live: boolean;
}

export interface PastDelegationRow {
  id: string;
  role: Role;
  fromName: string;
  toName: string;
  startsAt: string;
  endsAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

/**
 * Cover for an absence.
 *
 * The screen states the two things it exists to prevent, because the reasoning
 * is the feature: falling back to "anyone senior" widens who can approve every
 * time somebody takes leave, and granting the role permanently is not a
 * delegation — it is a second appointment nobody decided to make.
 */
export function Delegations({
  active,
  past,
  users,
  denied,
}: {
  active: DelegationRow[];
  past: PastDelegationRow[];
  users: { id: string; name: string; roles: Role[] }[];
  denied: string | null;
}) {
  const userOptions = users.map((u) => ({ value: u.id, label: u.name }));

  return (
    <Card
      title="Delegated roles"
      subtitle={`Cover for an absence: a named person, for a named period, with an end date that cannot be left off. At most ${MAX_DELEGATION_DAYS} days — longer than that is an appointment, not cover.`}
    >
      <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
        {active.map((d) => (
          <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                {ROLE_LABELS[d.role]}
                <Tag>{d.fromName} → {d.toName}</Tag>
              </p>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {formatShortDate(d.startsAt)} to {formatShortDate(d.endsAt)} · granted by {d.grantedByName}
              </p>
              <p className="mt-1 text-[12px]">{d.reason}</p>
              <div className="mt-2">
                <ActionForm
                  action={revokeDelegation.bind(null, d.id)}
                  submitLabel="Take it back"
                  denied={denied}
                  compact
                  fields={[
                    { name: "reason", label: "Why", required: true, placeholder: "They are back early" },
                  ]}
                />
              </div>
            </div>
            <StatusPill
              severity={!d.live ? "neutral" : d.daysLeft <= 3 ? "warning" : "good"}
              label={!d.live ? "starts later" : `${d.daysLeft}d left`}
            />
          </li>
        ))}
        {active.length === 0 && (
          <li className="py-4 text-[13px]" style={{ color: "var(--text-secondary)" }}>
            No role is currently lent to anyone.
          </li>
        )}
      </ul>

      <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--hairline)" }}>
        <p className="mb-2 text-[12px] font-medium">Lend a role</p>
        <ActionForm
          action={delegateRole}
          submitLabel="Lend it"
          variant="primary"
          denied={denied}
          fields={[
            {
              name: "role",
              label: "Role",
              kind: "select",
              required: true,
              options: ROLE_OPTIONS.filter((r) => r.id !== "auditor").map((r) => ({
                value: r.id,
                label: r.label,
              })),
            },
            { name: "fromUserId", label: "Whose role it is", kind: "select", required: true, options: userOptions },
            { name: "toUserId", label: "Who is covering", kind: "select", required: true, options: userOptions },
            { name: "days", label: `For how many days (max ${MAX_DELEGATION_DAYS})`, kind: "number", required: true, value: "14" },
            { name: "reason", label: "Why", required: true, placeholder: "Annual leave, 3–17 October" },
          ]}
        />
      </div>

      {past.length > 0 && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--hairline)" }}>
          <p className="mb-2 text-[12px] font-medium">Ended</p>
          <ul className="space-y-1">
            {past.map((d) => (
              <li key={d.id} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                {ROLE_LABELS[d.role]}: {d.fromName} → {d.toName},{" "}
                {formatShortDate(d.startsAt)} to {formatShortDate(d.endsAt)}
                {d.revokedAt
                  ? ` · taken back ${formatShortDate(d.revokedAt)} — ${d.revokedReason}`
                  : " · expired"}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
            Kept rather than deleted. Approvals were signed under these, so the period each one
            covered has to stay answerable after it has ended.
          </p>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>
        A delegation relaxes no separation rule. The deputy is a different person, so somebody holding
        higher management in their own right and Finance Officer by delegation still cannot sign both
        rungs of a large payment — the database indexes the approver, not the role. Nobody may lend a
        role they do not hold, or arrange their own cover.
      </p>
    </Card>
  );
}
