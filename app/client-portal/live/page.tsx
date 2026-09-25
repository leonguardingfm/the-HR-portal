import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Empty, Muted, NotLinked, Pill, ukTime } from "@/components/client-portal/Bits";
import { clientScope } from "@/lib/auth/client-scope";
import { portalLive } from "@/lib/db/client-portal";

export const dynamic = "force-dynamic";

/**
 * On duty now (26 September 2026): live, as it happens — who is on each post
 * at the client's sites, whether they have arrived, and their check calls. A
 * late arrival shows as late, honestly, with what Control is doing about it.
 */
export default async function ClientLivePage() {
  const scope = await clientScope();
  if (!scope) return <NotLinked />;
  const live = await portalLive(scope);
  const sites = scope.sites.filter((s) => live.some((l) => l.siteId === s.id));
  return (
    <div className="space-y-5">
      <PageHeader title="On duty now" description="Every shift on now at your sites, and those starting in the next three hours. This page keeps itself up to date." />
      {sites.length === 0 ? (
        <Card title="Nobody on duty right now">
          <Empty>No shift is on at your sites now, and none starts in the next three hours.</Empty>
        </Card>
      ) : (
        sites.map((site) => (
          <Card key={site.id} title={site.name} subtitle={site.address ?? undefined}>
            <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
              {live
                .filter((l) => l.siteId === site.id)
                .map((l) => (
                  <li key={l.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)]" style={{ borderColor: "var(--hairline)" }}>
                    <div>
                      <p className="text-[14px] font-medium">{l.post}</p>
                      <Muted>
                        {ukTime(l.startsAt)}–{ukTime(l.endsAt)}
                      </Muted>
                    </div>
                    <p className="text-[13px]">{l.officer}</p>
                    <div className="space-y-1">
                      <Pill tone={l.tone}>{l.state}</Pill>
                      {l.detail && <Muted>{l.detail}</Muted>}
                      {l.checkCalls && <Muted>{l.checkCalls}</Muted>}
                    </div>
                  </li>
                ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
