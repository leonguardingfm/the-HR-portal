import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { RaiseRequirementForm } from "@/components/requirements/RequirementForms";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { getClientsWithSites } from "@/lib/db/requirements";

export const dynamic = "force-dynamic";

/** A1: a client asks for cover. Logged the same working day. */
export default async function NewRequirementPage() {
  const session = await requireSession();
  const denied = deniedReason(session.activeRole, "requirement.raise");
  const clients = await getClientsWithSites();

  return (
    <div className="space-y-5">
      <nav className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/requirements" className="hover:underline">
          Client requirements
        </Link>{" "}
        / Raise
      </nav>
      <PageHeader
        title="Raise a requirement"
        description="What the client has asked for. The screening period comes from the client's contract, which is what every vetting deadline for this requirement is set from."
      />
      <div className="max-w-3xl">
        <Card>
          <div className="pt-5">
            {denied ? (
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                {denied}
              </p>
            ) : (
              <RaiseRequirementForm
                clients={clients.map((c) => ({
                  id: c.id,
                  name: c.name,
                  screeningPeriodYears: c.screeningPeriodYears,
                  requiresAdditionalInterview: c.requiresAdditionalInterview,
                  sites: c.sites.map((s) => ({ id: s.id, name: s.name, posts: s.posts })),
                }))}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
