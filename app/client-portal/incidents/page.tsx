import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Empty, Muted, NotLinked, Pill, ukDay, ukTime } from "@/components/client-portal/Bits";
import { clientScope } from "@/lib/auth/client-scope";
import { portalIncidents } from "@/lib/db/client-portal";

export const dynamic = "force-dynamic";

/** Notable and serious incidents at the client's sites, the last ninety days (26 September 2026). Minor log entries stay internal. */
export default async function ClientIncidentsPage() {
  const scope = await clientScope();
  if (!scope) return <NotLinked />;
  const rows = await portalIncidents(scope, new Date(Date.now() - 90 * 86_400_000));
  return (
    <div className="space-y-5">
      <PageHeader title="Incidents" description="Notable and serious incidents at your sites in the last ninety days, as the officer reported them." />
      <Card title={`${rows.length} incident${rows.length === 1 ? "" : "s"}`}>
        {rows.length === 0 ? (
          <Empty>No notable or serious incidents at your sites in the last ninety days.</Empty>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {rows.map((i) => (
              <li key={i.id} className="space-y-1.5 py-3.5" style={{ borderColor: "var(--hairline)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={i.severity === "serious" ? "bad" : "warn"}>{i.severity === "serious" ? "Serious" : "Notable"}</Pill>
                  <p className="text-[13px] font-medium">
                    {ukDay(i.at)} {ukTime(i.at)} · {i.site} — {i.post}
                  </p>
                </div>
                <p className="text-[14px] whitespace-pre-line">{i.summary}</p>
                <Muted>
                  Reported by {i.officer === "Officer assigned" ? "the officer on duty" : i.officer}
                  {i.toldAt ? ` · you were told at ${ukTime(i.toldAt)} on ${ukDay(i.toldAt)}` : ""}
                  {i.reviewed ? " · reviewed by the Control Room" : " · being reviewed by the Control Room"}
                </Muted>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
