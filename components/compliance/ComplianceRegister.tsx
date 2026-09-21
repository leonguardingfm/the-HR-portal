"use client";

import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { ClauseRef, StatusPill, Tag } from "@/components/ui/StatusPill";
import { useNow } from "@/components/ui/useNow";
import { daysUntil, expirySeverity } from "@/lib/core/deployability";
import { documentTypeById } from "@/lib/core/documents";
import { formatDate } from "@/lib/format";
import {
  deployabilityFor,
  expiringDocuments,
  personName,
  workforcePersonIds,
} from "@/lib/mock/ops";
import { EXPIRY_WARNING_DAYS } from "@/lib/sla";

/**
 * The expiry register.
 *
 * One table for every document in the business that has a date on it — SIA
 * licences, right to work, visas, training certificates, site instructions and
 * client contracts — because they are one engine and one reminder rule, not six
 * (docs/platform/02 §2.5).
 *
 * The compliance dates are read from the person record, not maintained here. A
 * second list is a second thing to be wrong, which is the whole argument of the
 * single-source-of-truth register.
 */
export function ComplianceRegister() {
  const now = useNow();

  if (!now) {
    return <PageHeader title="Compliance" description="Loading the expiry register…" />;
  }

  const docs = expiringDocuments();
  const dated = docs.map((d) => ({
    doc: d,
    type: documentTypeById(d.typeId),
    days: daysUntil(d.expiresAt!, now),
    severity: expirySeverity(d.expiresAt, now),
  }));

  const expired = dated.filter((d) => d.days < 0);
  const within30 = dated.filter((d) => d.days >= 0 && d.days <= 30);
  const within90 = dated.filter((d) => d.days > 30 && d.days <= EXPIRY_WARNING_DAYS[0]);

  // Deployability is derived on demand, which is why it can never be stale.
  const blocked = workforcePersonIds()
    .map((personId) => ({ personId, d: deployabilityFor(personId, true, now) }))
    .filter((x) => !x.d.deployable);

  const warned = workforcePersonIds()
    .map((personId) => ({ personId, d: deployabilityFor(personId, true, now) }))
    .filter((x) => x.d.deployable && x.d.warnings.length > 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compliance"
        description="Every document with a date on it, and who it stops. The dates are read from the person record — this page maintains nothing of its own."
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
          detail="Assignment publication is blocked for these people"
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
            {blocked.map(({ personId, d }) => (
              <li key={personId} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-medium">{personName(personId)}</p>
                  <StatusPill severity="critical" label="Cannot be rostered" />
                </div>
                <ul className="mt-1.5 space-y-1">
                  {d.blockers.map((b) => (
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
            {warned.map(({ personId, d }) => (
              <li key={personId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{personName(personId)}</p>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {d.warnings.map((w) => w.label).join(" · ")}
                  </p>
                </div>
                <StatusPill severity={d.warnings[0].severity} />
              </li>
            ))}
          </ul>
        </Card>
      )}

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
              </tr>
            </thead>
            <tbody>
              {dated.map(({ doc, type, days, severity }) => (
                <tr key={doc.id} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
                  <td className="px-1 py-2.5">
                    <p className="font-medium">
                      {type?.label ?? doc.typeId}
                      {type?.clause && (
                        <>
                          {" "}
                          <ClauseRef clause={type.clause} />
                        </>
                      )}
                    </p>
                    {type && !type.copyRetained && (
                      <p className="mt-0.5">
                        <Tag>Outcome only — no copy kept</Tag>
                      </p>
                    )}
                  </td>
                  <td className="px-1 py-2.5">{doc.ownerName}</td>
                  <td className="tnum px-1 py-2.5 tabular-nums whitespace-nowrap">{formatDate(doc.expiresAt)}</td>
                  <td className="tnum px-1 py-2.5 tabular-nums whitespace-nowrap">
                    {days < 0 ? `${Math.abs(days)} days over` : `${days} days`}
                  </td>
                  <td className="px-1 py-2.5">
                    <StatusPill
                      severity={severity}
                      label={days < 0 ? "Expired" : days <= 30 ? "Renew now" : days <= 90 ? "Renewal due" : "In date"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          This register replaces INDEL&rsquo;s expiry alerting rather than
          running alongside it — two systems watching the same dates is how they
          come to disagree. That is decision C21 in docs/proposal/07, and it
          needs confirming before INDEL&rsquo;s alerts are switched off.
        </p>
      </Card>
    </div>
  );
}
