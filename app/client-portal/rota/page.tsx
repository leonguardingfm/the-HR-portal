import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Empty, Muted, NotLinked, Pill, ukDay, ukDayKey, ukTime } from "@/components/client-portal/Bits";
import { clientScope } from "@/lib/auth/client-scope";
import { portalRota } from "@/lib/db/client-portal";

export const dynamic = "force-dynamic";

/** The next two weeks of cover at the client's sites, day by day (26 September 2026). */
export default async function ClientRotaPage() {
  const scope = await clientScope();
  if (!scope) return <NotLinked />;
  const rota = await portalRota(scope, 14);
  const days = [...new Set(rota.map((r) => ukDayKey(r.startsAt)))];
  const gaps = rota.filter((r) => !r.covered).length;
  return (
    <div className="space-y-5">
      <PageHeader title="Coming up" description={`The next two weeks at your sites: ${rota.length} shift${rota.length === 1 ? "" : "s"}${gaps ? `, ${gaps} still being covered` : ", every one covered"}. The rota can change; this page always shows the latest.`} />
      {rota.length === 0 ? (
        <Card title="Nothing booked yet">
          <Empty>No shifts are on the rota at your sites for the next two weeks.</Empty>
        </Card>
      ) : (
        days.map((day) => {
          const today = rota.filter((r) => ukDayKey(r.startsAt) === day);
          return (
            <Card key={day} title={ukDay(today[0].startsAt)} subtitle={`${today.length} shift${today.length === 1 ? "" : "s"}`}>
              <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                {today.map((r) => (
                  <li key={r.id} className="grid gap-1 py-2.5 sm:grid-cols-[8rem_minmax(0,1.4fr)_minmax(0,1fr)]" style={{ borderColor: "var(--hairline)" }}>
                    <p className="tnum text-[13px] font-medium">
                      {ukTime(r.startsAt)}–{ukTime(r.endsAt)}
                    </p>
                    <div>
                      <p className="text-[13px]">{r.post}</p>
                      <Muted>{r.site}</Muted>
                    </div>
                    <div>{r.covered ? <p className="text-[13px]">{r.officer}</p> : <Pill tone="warn">Cover being arranged</Pill>}</div>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}
