import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Empty, Muted, NotLinked, Pill, ukDay, ukTime } from "@/components/client-portal/Bits";
import { RequestForm } from "@/components/client-portal/RequestForm";
import { clientScope } from "@/lib/auth/client-scope";
import { portalRequests } from "@/lib/db/client-portal";
import { CLIENT_REQUEST_KINDS } from "@/lib/db/hub";

export const dynamic = "force-dynamic";

/**
 * Requests (26 September 2026): the client asks, and follows it through.
 * Each becomes a task for the team that deals with it, on the same clocks as
 * an email; the client sees where it is and what we have told them.
 */
export default async function ClientRequestsPage() {
  const scope = await clientScope();
  if (!scope) return <NotLinked />;
  const rows = await portalRequests(scope);
  const open = rows.filter((r) => r.open);
  return (
    <div className="space-y-5">
      <PageHeader title="Requests" description="Ask for extra cover, a change, or anything else. It goes straight to the team that deals with it, and you can follow it here." />
      <Card title="Send a request">
        <RequestForm kinds={CLIENT_REQUEST_KINDS.map((k) => ({ id: k.id, label: k.label }))} sites={scope.sites.map((s) => ({ id: s.id, name: s.name }))} />
      </Card>
      <Card title={`Your requests · ${open.length} open`} subtitle={scope.allSites ? "Everyone at your organisation who uses the portal sees these." : "Requests about your sites, and ones about no site in particular."}>
        {rows.length === 0 ? (
          <Empty>No requests yet.</Empty>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {rows.map((r) => (
              <li key={r.id} style={{ borderColor: "var(--hairline)" }}>
                <Link href={`/client-portal/requests/${r.id}`} className="flex flex-wrap items-start justify-between gap-2 py-3 hover:bg-[var(--wash)]">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium">
                      {r.ref} · {r.subject}
                    </p>
                    <Muted>
                      {ukDay(r.receivedAt)} {ukTime(r.receivedAt)} · {r.mine ? "you" : r.raisedBy}
                      {r.site ? ` · ${r.site}` : ""}
                    </Muted>
                    {r.update && <p className="mt-1 text-[13px]">“{r.update}”</p>}
                  </div>
                  <Pill tone={r.stage.tone}>{r.stage.label}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
