import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewCandidateForm } from "@/components/recruitment/NewCandidateForm";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { getOpenRequirements } from "@/lib/db/recruitment";
import { formatDate } from "@/lib/format";
import { SOURCE_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

/**
 * Add a candidate.
 *
 * The duplicate check runs before any record exists, against email, phone and
 * name-plus-date-of-birth — so the same person stops appearing under four
 * spellings across four spreadsheets.
 */
export default async function NewCandidatePage({
  searchParams,
}: {
  searchParams: Promise<{ requirement?: string }>;
}) {
  const session = await requireSession();
  const { requirement } = await searchParams;
  const denied = deniedReason(session.activeRole, "candidacy.create");
  const requirements = await getOpenRequirements();

  return (
    <div className="space-y-5">
      <nav className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/candidates" className="hover:underline">
          Recruitment
        </Link>{" "}
        / New candidate
      </nav>
      <PageHeader
        title="New candidate"
        description="Checked against everyone already on record before it is saved. The candidate starts at Sourcing, assigned to you."
      />
      <div className="max-w-2xl">
        <Card>
          <div className="pt-5">
            {denied ? (
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                {denied}
              </p>
            ) : (
              <NewCandidateForm
                sources={Object.entries(SOURCE_LABELS).map(([value, label]) => ({ value, label }))}
                requirements={requirements.map((r) => ({
                  id: r.id,
                  label: `${r.reference} · ${r.client.name} — ${r.site.name} · ${r.headcountRequired} × ${r.post}, from ${formatDate(r.startDate)}`,
                }))}
                defaultRequirementId={requirements.some((r) => r.id === requirement) ? requirement : undefined}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
