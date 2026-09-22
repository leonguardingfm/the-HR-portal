import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { ActionForm } from "@/components/admin/ActionForm";
import { AdminItemList } from "@/components/admin/AdminItemList";
import { Meter } from "@/components/ui/Meter";
import { adminPerms } from "@/lib/actions/admin-perms";
import { satisfyEvidence } from "@/lib/actions/admin";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { adminCategory } from "@/lib/core/admin";
import { getAccreditations, getAdminItems } from "@/lib/db/admin-queries";
import { ROLE_LABELS } from "@/lib/labels";
import { formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  derived_screening: "From screening records",
  derived_quality: "From inspections",
  derived_training: "From training records",
  document: "A document on file",
  manual: "Recorded by hand",
};

/**
 * Accreditations.
 *
 * This is the strongest de-duplication in the department, and the screen is
 * built to show it: most of what an accreditation asks for is work the
 * platform already recorded. A derived requirement names the query that
 * answers it and cannot be ticked by hand — ticking it would replace evidence
 * with an assertion, which is exactly what an assessor is there to catch.
 */
export default async function AdminAccreditationsPage() {
  const session = await requireSession();
  const [accreditations, items] = await Promise.all([
    getAccreditations(),
    getAdminItems({ category: "accreditations", limit: 50 }),
  ]);
  const perms = adminPerms(session.activeRole);
  const evidenceDenied = deniedReason(session.activeRole, "accreditation.evidence");
  const category = adminCategory("accreditations");

  const atRisk = accreditations.filter((a) => a.atRisk);
  const dueSoon = accreditations.filter((a) => a.daysToExpiry >= 0 && a.daysToExpiry <= 90);
  const derivedTotal = accreditations.reduce((s, a) => s + a.derived, 0);
  const requirementTotal = accreditations.reduce((s, a) => s + a.total, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Accreditations" description={category.purpose} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Held" value={accreditations.filter((a) => a.state === "held").length} detail="Current accreditations" />
        <StatTile
          label="Renewal inside 90 days"
          value={dueSoon.length}
          detail={`${dueSoon.filter((a) => a.evidenceComplete).length} with evidence complete`}
          severity={dueSoon.some((a) => !a.evidenceComplete) ? "warning" : "good"}
        />
        <StatTile
          label="At risk"
          value={atRisk.length}
          detail="Inside 30 days with no submission"
          severity={atRisk.length > 0 ? "critical" : "good"}
          hero={atRisk.length > 0}
        />
        <StatTile
          label="Evidence gathered automatically"
          value={
            requirementTotal === 0 ? "—" : `${Math.round((derivedTotal / requirementTotal) * 100)}%`
          }
          detail={`${derivedTotal} of ${requirementTotal} requirements answered by records already held`}
        />
      </div>

      {accreditations.map((a) => (
        <Card
          key={a.id}
          title={`${a.name} — ${a.body}`}
          subtitle={`${a.scope}${a.certificateNumber ? ` · certificate ${a.certificateNumber}` : ""}`}
          action={
            <div className="flex flex-col items-end gap-1">
              <StatusPill
                severity={
                  a.atRisk
                    ? "critical"
                    : a.daysToExpiry < 0
                      ? "critical"
                      : a.daysToExpiry <= 90
                        ? "warning"
                        : "good"
                }
                label={
                  a.daysToExpiry < 0
                    ? `Expired ${Math.abs(a.daysToExpiry)}d ago`
                    : `${a.daysToExpiry}d to expiry`
                }
              />
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Expires {formatShortDate(a.expiresOn)}
                {a.nextAuditOn ? ` · audit ${formatShortDate(a.nextAuditOn)}` : ""}
                {a.ownerRole ? ` · ${ROLE_LABELS[a.ownerRole]}` : ""}
              </span>
            </div>
          }
        >
          <div className="mb-3">
            <Meter
              label={`Evidence gathered — ${a.gathered} of ${a.total}`}
              fraction={a.total === 0 ? 0 : a.gathered / a.total}
              severity={a.evidenceComplete ? "good" : a.daysToExpiry <= 90 ? "warning" : "neutral"}
            />
            <p className="mt-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
              {a.derived} of {a.total} requirements are answered by records the platform already holds;{" "}
              {a.satisfied} more have been recorded by hand.
              {a.lastSubmittedOn
                ? ` Last submission ${formatShortDate(a.lastSubmittedOn)}.`
                : " No submission recorded yet."}
            </p>
          </div>

          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {a.requirements.map((r) => {
              const derived = r.source.startsWith("derived_");
              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium">
                      {r.clause && (
                        <span style={{ color: "var(--text-muted)" }}>{r.clause} — </span>
                      )}
                      {r.label}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <Tag>{SOURCE_LABELS[r.source] ?? r.source}</Tag>
                      {r.derivedFrom && (
                        <span style={{ color: "var(--text-secondary)" }}>{r.derivedFrom}</span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {derived ? (
                      <StatusPill severity="good" label="Assembled" />
                    ) : r.satisfiedAt ? (
                      <StatusPill severity="good" label={`Satisfied ${formatShortDate(r.satisfiedAt)}`} />
                    ) : (
                      <ActionForm
                        action={satisfyEvidence.bind(null, r.id)}
                        submitLabel="Mark satisfied"
                        denied={evidenceDenied}
                        compact
                        fields={[{ name: "note", label: "Note", placeholder: "Where it is" }]}
                      />
                    )}
                  </div>
                </li>
              );
            })}
            {a.requirements.length === 0 && (
              <li className="py-4 text-center text-[12px]" style={{ color: "var(--text-secondary)" }}>
                No evidence requirements recorded against this accreditation yet.
              </li>
            )}
          </ul>
        </Card>
      ))}

      {accreditations.length === 0 && (
        <Card title="No accreditations recorded">
          <p className="py-4 text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Nothing set up yet. Each accreditation carries its expiry, its next audit date and its
            evidence requirements; the derived ones assemble themselves from screening, inspection and
            training records already in the platform.
          </p>
        </Card>
      )}

      <Card title="Accreditation work" subtitle="Tasks and requests in this category.">
        <AdminItemList items={items} perms={perms} empty="No accreditation work outstanding." />
      </Card>
    </div>
  );
}
