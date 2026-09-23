import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { CONTROL_LABELS, REQUIREMENT_STATUS_LABELS } from "@/lib/labels";
import { daysSince, formatDate } from "@/lib/format";
import { clientById, openRequirements, siteById } from "@/lib/mock/data";
import type { ControlId, Requirement, Severity } from "@/lib/types";

/** Ageing drives the colour: an open requirement past its start date is late. */
function requirementSeverity(r: Requirement): Severity {
  const daysToStart = -daysSince(r.startDate);
  const age = r.releasedToSourcingAt ? daysSince(r.releasedToSourcingAt) : 0;
  if (daysToStart < 0) return "critical";
  if (daysToStart <= 7 || age > 30) return "serious";
  if (age > 14) return "warning";
  return "good";
}

export function RequirementBoard() {
  const grouped: Record<ControlId, Requirement[]> = { alpha: [], bravo: [] };
  for (const r of openRequirements()) grouped[r.control].push(r);

  return (
    <Card
      title="Requirements outstanding"
      subtitle="Split by control. Ageing is measured from the handover to HR, not from the client request."
      action={
        <Link href="/requirements" className="text-[12px] underline" style={{ color: "var(--text-secondary)" }}>
          All requirements
        </Link>
      }
    >
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        {(["alpha", "bravo"] as ControlId[]).map((control) => (
          <div key={control} className="min-w-0">
            <h3 className="mb-2 text-[12px] font-semibold">
              {CONTROL_LABELS[control].name}{" "}
              <span className="font-normal" style={{ color: "var(--text-muted)" }}>
                ({CONTROL_LABELS[control].alias})
              </span>
            </h3>
            <ul className="space-y-2">
              {grouped[control].map((r) => {
                const client = clientById(r.clientId);
                const site = siteById(r.siteId);
                const severity = requirementSeverity(r);
                const remaining = r.headcountRequired - r.headcountAllocated;
                return (
                  <li
                    key={r.id}
                    className="rounded border p-3"
                    style={{ borderColor: "var(--hairline)", background: "var(--surface-1)" }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">
                          {r.post} — {site?.name}
                        </p>
                        <p className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {client?.name} · {r.reference} · {r.shiftPattern}
                        </p>
                      </div>
                      <StatusPill
                        severity={severity}
                        label={
                          -daysSince(r.startDate) < 0
                            ? `Start date passed`
                            : `Starts ${formatDate(r.startDate)}`
                        }
                      />
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <Tag>
                        <span className="tnum tabular-nums">
                          {r.headcountAllocated}/{r.headcountRequired}
                        </span>
                        &nbsp;allocated
                      </Tag>
                      {remaining > 0 && (
                        <Tag>
                          <span className="tnum tabular-nums">{remaining}</span>&nbsp;still needed
                        </Tag>
                      )}
                      <Tag>{REQUIREMENT_STATUS_LABELS[r.status]}</Tag>
                      <Tag>{client?.screeningPeriodYears}-year screening</Tag>
                      {r.releasedToSourcingAt && (
                        <Tag>
                          <span className="tnum tabular-nums">
                            {daysSince(r.releasedToSourcingAt)}
                          </span>
                          &nbsp;days with HR
                        </Tag>
                      )}
                      <Tag>{r.owner ?? "Unassigned"}</Tag>
                    </div>
                  </li>
                );
              })}
              {grouped[control].length === 0 && (
                <li className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Nothing outstanding.
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
