import { Card } from "@/components/ui/Card";
import { ClauseRef, StatusPill } from "@/components/ui/StatusPill";
import { formatDate } from "@/lib/format";
import { officers, screeningFiles, candidateById } from "@/lib/mock/data";
import type { Severity } from "@/lib/types";

interface ExceptionRow {
  label: string;
  subject: string;
  clause: string;
  severity: Severity;
  status: string;
  owner: string;
}

/**
 * Exceptions queue.
 *
 * Small, and usually empty — that is the point. Everything here needs a named
 * human decision that the portal deliberately will not make on its own.
 */
export function ExceptionsQueue() {
  const rows: ExceptionRow[] = [];

  for (const file of screeningFiles) {
    const name = candidateById(file.candidateId)?.fullName ?? file.candidateId;
    if (file.status === "risk_acceptance_required") {
      rows.push({
        label: "Risk acceptance required",
        subject: name,
        clause: "7.4f",
        severity: "critical",
        status: file.outstandingSummary,
        owner: "Top management",
      });
    }
    if (file.status === "statutory_declaration_required") {
      rows.push({
        label: "Statutory declaration approval",
        subject: name,
        clause: "7.7i",
        severity: "serious",
        status: "Prior documented approval needed",
        owner: "Top management",
      });
    }
    if (file.status === "controller_review_2") {
      rows.push({
        label: "Controller review — completed file",
        subject: name,
        clause: "7.7",
        severity: "warning",
        status: "File complete, awaiting review",
        owner: file.controller ?? "Unassigned",
      });
    }
  }

  const soon = officers.filter((o) => {
    const days = Math.ceil(
      (new Date(o.siaLicenceExpiry).getTime() - Date.now()) / 86_400_000,
    );
    return days <= 90;
  });

  for (const o of soon) {
    const days = Math.ceil(
      (new Date(o.siaLicenceExpiry).getTime() - Date.now()) / 86_400_000,
    );
    rows.push({
      label: "SIA licence expiring",
      subject: o.siaBadgeName,
      clause: "7.3.2a8",
      severity: days <= 30 ? "critical" : days <= 60 ? "serious" : "warning",
      status: `Expires ${formatDate(o.siaLicenceExpiry)} — not deployable after`,
      owner: "Control",
    });
  }

  rows.push({
    label: "Records due for secure disposal",
    subject: "4 unsuccessful applicants",
    clause: "11.1",
    severity: "warning",
    status: "12 months reached — controller approval needed",
    owner: "Vetting controller",
  });

  return (
    <Card
      title="Exceptions"
      subtitle="Decisions the portal will not make on its own. Each needs a named human."
    >
      <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
        {rows.map((row, i) => (
          <li key={`${row.label}-${i}`} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <p className="text-[13px] font-medium">
                {row.label}{" "}
                <span className="font-normal" style={{ color: "var(--text-secondary)" }}>
                  — {row.subject}
                </span>
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {row.status} · <ClauseRef clause={row.clause} /> · {row.owner}
              </p>
            </div>
            <StatusPill severity={row.severity} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
