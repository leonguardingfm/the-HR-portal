"use client";

import { ActionButton } from "@/components/ui/ActionButton";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { ClauseRef, StatusPill, Tag } from "@/components/ui/StatusPill";
import { useNow } from "@/components/ui/useNow";
import { RETENTION } from "@/lib/bs7858";
import { daysUntil, expirySeverity } from "@/lib/core/deployability";
import { formatDate } from "@/lib/format";
import { EXPIRY_WARNING_DAYS } from "@/lib/sla";
import { renewDocument } from "@/lib/actions/operations";
import type {
  ExpiringDocument,
  RetentionItemRow,
  WorkforceDeployability,
} from "@/lib/db/queries";

interface DisposalRow {
  id: string;
  at: string;
  rule: string;
  subjectDescription: string;
  itemsDestroyed: number;
  retainedInstead: string | null;
  performedBy: string;
  verified: boolean;
}

const RULE_LABELS: Record<string, string> = {
  unsuccessful_applicant_12_months: `${RETENTION.unsuccessfulApplicantMonths} months — unsuccessful applicant`,
  after_cessation_7_years: `${RETENTION.afterCessationYears} years — after employment ceased`,
  document_type_rule: "Document type rule",
  subject_request: "Subject request",
};

/**
 * The expiry register.
 *
 * One table for every document in the business that has a date on it — SIA
 * licences, right to work, visas, training certificates, site instructions and
 * client contracts — because they are one engine and one reminder rule, not six.
 *
 * Nothing on this page is stored as a status. Deployability is worked out from
 * the screening file and the dated documents each time it is asked, and the
 * retention queue is derived from when an application was withdrawn or an
 * employment ended. A maintained list would be right on the day it was written.
 */
export function ComplianceRegister({
  documents,
  workforce,
  retention,
  disposals,
  renewDenied,
}: {
  documents: ExpiringDocument[];
  workforce: WorkforceDeployability[];
  retention: RetentionItemRow[];
  disposals: DisposalRow[];
  renewDenied: string | null;
}) {
  const now = useNow();

  if (!now) {
    return <PageHeader title="Compliance" description="Reading the register…" />;
  }

  const dated = documents.map((d) => ({
    doc: d,
    days: daysUntil(d.expiresAt!, now),
    severity: expirySeverity(d.expiresAt, now),
  }));

  const expired = dated.filter((d) => d.days < 0);
  const within30 = dated.filter((d) => d.days >= 0 && d.days <= 30);
  const within90 = dated.filter((d) => d.days > 30 && d.days <= EXPIRY_WARNING_DAYS[0]);

  const blocked = workforce.filter((w) => !w.deployability.deployable);
  const warned = workforce.filter(
    (w) => w.deployability.deployable && w.deployability.warnings.length > 0,
  );
  const overdueDisposal = retention.filter((r) => daysUntil(r.dueAt, now) < 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compliance"
        description="Every document with a date on it, and who it stops. The dates are held in one place and warned on from one rule."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label="Expired"
          value={expired.length}
          detail="Past their date and still on the register"
          severity={expired.length > 0 ? "critical" : "good"}
          hero={expired.length > 0}
        />
        <StatTile
          label="Expiring within 30 days"
          value={within30.length}
          detail="Renewal should already be in hand"
          severity={within30.length > 0 ? "serious" : "good"}
        />
        <StatTile
          label="Expiring within 90 days"
          value={within90.length}
          detail={`First warning at ${EXPIRY_WARNING_DAYS[0]} days`}
          severity={within90.length > 0 ? "warning" : "good"}
        />
        <StatTile
          label="Cannot be deployed"
          value={blocked.length}
          detail={`of ${workforce.length} on the books`}
          severity={blocked.length > 0 ? "critical" : "good"}
        />
      </div>

      <Card
        title="Blocked from deployment"
        subtitle="Worked out from the screening file and the compliance documents. Nothing stores a 'deployable' flag, so it cannot drift."
      >
        {blocked.length === 0 ? (
          <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Nobody on the books is currently blocked.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {blocked.map((w) => (
              <li key={w.personId} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-medium">{w.personName}</p>
                  <StatusPill severity="critical" label="Cannot be rostered" />
                </div>
                <ul className="mt-1.5 space-y-1">
                  {w.deployability.blockers.map((b) => (
                    <li key={b.code} className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {b.label}
                      {b.clause && (
                        <>
                          {" "}
                          <ClauseRef clause={b.clause} />
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {warned.length > 0 && (
        <Card
          title="Deployable, but dated"
          subtitle="Not a block yet. This is the list the reminder engine works from, at 90, 60 and 30 days."
        >
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {warned.map((w) => (
              <li key={w.personId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{w.personName}</p>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {w.deployability.warnings.map((x) => x.label).join(" · ")}
                  </p>
                </div>
                <StatusPill severity={w.deployability.warnings[0].severity} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Retention and disposal"
        subtitle={`${RETENTION.unsuccessfulApplicantMonths} months for unsuccessful applicants, ${RETENTION.afterCessationYears} years after employment ends — and every deletion recorded.`}
        action={
          <div className="flex items-center gap-1.5">
            {overdueDisposal.length > 0 && (
              <StatusPill severity="critical" label={`${overdueDisposal.length} overdue`} />
            )}
            <Tag>Clause 11</Tag>
          </div>
        }
      >
        <div className="grid gap-6 xl:grid-cols-2">
          <div>
            <p className="mb-2 text-[12px] font-semibold">Due for disposal</p>
            {retention.length === 0 ? (
              <p className="py-4 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Nothing has reached its retention date.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                {retention.map((r) => {
                  const days = daysUntil(r.dueAt, now);
                  return (
                    <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] leading-snug">{r.description}</p>
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {RULE_LABELS[r.rule] ?? r.rule} · due {formatDate(r.dueAt)}
                        </p>
                      </div>
                      <StatusPill
                        severity={days < 0 ? "critical" : days <= 30 ? "warning" : "neutral"}
                        label={days < 0 ? `${Math.abs(days)} days overdue` : `in ${days} days`}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Derived from when each application was withdrawn or each
              employment ceased, not from a list anyone maintains. Overdue means
              we are holding data longer than the policy allows, which is a
              compliance failure in its own right — not a tidying job.
            </p>
          </div>

          <div>
            <p className="mb-2 text-[12px] font-semibold">Disposal log</p>
            <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
              {disposals.map((d) => (
                <li key={d.id} className="py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[12px] leading-snug">{d.subjectDescription}</p>
                    <span
                      className="tnum text-[11px] tabular-nums whitespace-nowrap"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {formatDate(d.at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    {d.itemsDestroyed} destroyed · {RULE_LABELS[d.rule] ?? d.rule} · {d.performedBy}
                    {d.verified ? " · countersigned" : ""}
                  </p>
                  {d.retainedInstead && (
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Kept: {d.retainedInstead}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Append-only, enforced in the database — an entry cannot be edited
              or deleted once written. Note what the entries do not contain:
              names. A disposal log that reproduces the data it destroyed has
              not destroyed it.
            </p>
          </div>
        </div>
      </Card>

      <Card
        title="The expiry register"
        subtitle="Officers, sites and clients in one list, soonest first — because a lapsed set of site instructions and a lapsed licence are the same kind of problem."
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-left">
                <th className="px-1 pb-2 font-medium">Document</th>
                <th className="px-1 pb-2 font-medium">Held by</th>
                <th className="px-1 pb-2 font-medium">Expires</th>
                <th className="px-1 pb-2 font-medium">Remaining</th>
                <th className="px-1 pb-2 font-medium">Status</th>
                <th className="px-1 pb-2 font-medium">Do</th>
              </tr>
            </thead>
            <tbody>
              {dated.map(({ doc, days, severity }) => (
                <tr key={doc.id} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
                  <td className="px-1 py-2.5">
                    <p className="font-medium">
                      {doc.typeLabel}
                      {doc.clause && (
                        <>
                          {" "}
                          <ClauseRef clause={doc.clause} />
                        </>
                      )}
                    </p>
                    {!doc.copyRetained && (
                      <p className="mt-0.5">
                        <Tag>Outcome only — no copy kept</Tag>
                      </p>
                    )}
                  </td>
                  <td className="px-1 py-2.5">{doc.ownerName}</td>
                  <td className="tnum px-1 py-2.5 tabular-nums whitespace-nowrap">
                    {formatDate(doc.expiresAt)}
                  </td>
                  <td className="tnum px-1 py-2.5 tabular-nums whitespace-nowrap">
                    {days < 0 ? `${Math.abs(days)} days over` : `${days} days`}
                  </td>
                  <td className="px-1 py-2.5">
                    <StatusPill
                      severity={severity}
                      label={
                        days < 0
                          ? "Expired"
                          : days <= 30
                            ? "Renew now"
                            : days <= 90
                              ? "Renewal due"
                              : "In date"
                      }
                    />
                  </td>
                  <td className="px-1 py-2.5">
                    {days <= 90 && (
                      <ActionButton
                        action={renewDocument.bind(null, doc.id)}
                        label="Renew"
                        variant={days < 0 ? "primary" : "quiet"}
                        denied={renewDenied}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
