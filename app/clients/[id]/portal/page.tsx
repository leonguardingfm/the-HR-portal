import Link from "next/link";
import { notFound } from "next/navigation";
import { AddContactForm, ContactTools, IdentityForm } from "@/components/clients/PortalAccessForms";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { canDo } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const REVIEW_DAYS = 183;

/**
 * A client's portal logins (26 September 2026): who at the client can see it,
 * which sites each sees, and what the contract lets them see of our officers.
 * Made and removed by Leon staff only; reviewed every six months.
 */
export default async function ClientPortalAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const client = await db.client.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      active: true,
      officerIdentity: true,
      sites: { where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } },
      portalUsers: {
        orderBy: [{ active: "desc" }, { displayName: "asc" }],
        select: { id: true, displayName: true, username: true, email: true, active: true, lastSignInAt: true, reviewedAt: true, createdAt: true, totpEnabledAt: true, portalSites: { select: { siteId: true, site: { select: { name: true } } } } },
      },
    },
  });
  if (!client) notFound();
  const may = canDo(session.activeRole, "client.portal");
  const now = Date.now();
  const due = (u: { reviewedAt: Date | null; createdAt: Date }) => now - (u.reviewedAt ?? u.createdAt).getTime() > REVIEW_DAYS * 86_400_000;
  const active = client.portalUsers.filter((u) => u.active);
  const removed = client.portalUsers.filter((u) => !u.active);
  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        <Link href="/clients" className="underline underline-offset-2">
          Clients, sites &amp; posts
        </Link>{" "}
        / {client.name} / Portal access
      </nav>
      <PageHeader
        title={`Client portal · ${client.name}`}
        description={`${active.length} active login${active.length === 1 ? "" : "s"}. They see only ${client.name}'s own sites — never another client's — and nothing internal.${may ? "" : " Only the account manager, the Admin Manager or the Managing Director can change these."}`}
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="Logins" subtitle="Each is checked every six months: are they still at the client, and should they still see this?" action={may && client.active ? <AddContactForm clientId={client.id} sites={client.sites} /> : undefined}>
          {active.length === 0 ? (
            <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Nobody at {client.name} has a login yet.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
              {active.map((u) => (
                <li key={u.id} className="grid gap-3 py-3.5 lg:grid-cols-[minmax(0,1fr)_auto]" style={{ borderColor: "var(--hairline)" }}>
                  <div className="min-w-0 text-[13px]">
                    <p className="text-[14px] font-medium">
                      {u.displayName} {due(u) && <span className="ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--wash-warning)" }}>Review due</span>}
                    </p>
                    <p style={{ color: "var(--text-secondary)" }}>
                      {u.username} · {u.email}
                    </p>
                    <p style={{ color: "var(--text-secondary)" }}>
                      Sees {u.portalSites.length ? u.portalSites.map((s) => s.site.name).join(", ") : "all sites"} · {u.lastSignInAt ? `last signed in ${formatDate(u.lastSignInAt)}` : "not signed in yet"} · checked {formatDate(u.reviewedAt ?? u.createdAt)}
                      {u.totpEnabledAt ? " · two-factor on" : ""}
                    </p>
                  </div>
                  {may && <ContactTools userId={u.id} sites={client.sites} chosen={u.portalSites.map((s) => s.siteId)} />}
                </li>
              ))}
            </ul>
          )}
          {removed.length > 0 && (
            <p className="mt-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
              Removed: {removed.map((u) => u.displayName).join(", ")}. Their history is kept.
            </p>
          )}
        </Card>
        <Card title="What they see of our officers" subtitle="Only what the contract requires (decision E17). It applies to everyone at this client.">
          <IdentityForm clientId={client.id} value={client.officerIdentity} disabled={!may} />
        </Card>
      </div>
    </div>
  );
}
