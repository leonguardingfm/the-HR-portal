import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSession } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const COMING = [
  ["Your sites and posts", "Which officers are covering each post, shift by shift."],
  ["Requirements", "Ask for cover and follow it from received to filled."],
  ["Incidents and reports", "Incidents at your sites, and the reports that follow."],
  ["Feedback", "Tell us how the service is going."],
] as const;

/**
 * The client portal's front page.
 *
 * A client contact sees their own account and nothing internal — the route
 * guard in proxy.ts keeps every staff screen out of reach. The views listed
 * below need the account linked to a Client record first, so they are named
 * honestly as not built yet rather than shown empty.
 */
export default async function ClientPortalPage() {
  const session = await requireSession();
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { displayName: true, username: true, email: true, createdAt: true },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Welcome, ${user?.displayName ?? session.name}`}
        description="The Leon Guarding client portal. Your account is set up; the views below will appear here once it is linked to your organisation."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card title="Your account">
          <dl className="space-y-3 text-[13px]">
            {[
              ["Name", user?.displayName],
              ["Username", user?.username],
              ["Email", user?.email],
              ["Member since", user ? formatDate(user.createdAt) : null],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {k}
                </dt>
                <dd className="font-medium">{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Coming to the portal" subtitle="Available once your account is linked to your organisation.">
          <ul className="grid gap-3 sm:grid-cols-2">
            {COMING.map(([title, body]) => (
              <li
                key={title}
                className="rounded-md border p-3.5"
                style={{ borderStyle: "dashed" }}
              >
                <p className="text-[13px] font-medium">{title}</p>
                <p className="mt-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {body}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
            To have your account linked, contact your Leon Guarding account manager.
          </p>
        </Card>
      </div>
    </div>
  );
}
