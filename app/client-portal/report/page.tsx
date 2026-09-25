import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Muted, NotLinked, Stat } from "@/components/client-portal/Bits";
import { PrintButton } from "@/components/client-portal/PrintButton";
import { clientScope } from "@/lib/auth/client-scope";
import { minutesWords } from "@/lib/core/performance";
import { addDays, ukDate, ukInstant } from "@/lib/core/rota";
import { portalMonth } from "@/lib/db/client-portal";

export const dynamic = "force-dynamic";

const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" });
const nextMonth = (ym: string) => addDays(`${ym}-28`, 5).slice(0, 7);
const prevMonth = (ym: string) => addDays(`${ym}-01`, -1).slice(0, 7);
const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

/**
 * The month in figures (26 September 2026): cover delivered, arrival on time,
 * check calls, incidents and requests — counted from the records, for the
 * client's own sites. Printable, for a contract review.
 */
export default async function ClientReportPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const scope = await clientScope();
  if (!scope) return <NotLinked />;
  const sp = await searchParams;
  const thisMonth = ukDate(new Date()).slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") && sp.month! <= thisMonth ? sp.month! : thisMonth;
  const from = ukInstant(`${month}-01`, "00:00");
  const to = ukInstant(`${nextMonth(month)}-01`, "00:00");
  const m = await portalMonth(scope, from, to);
  return (
    <div className="space-y-5">
      <PageHeader
        title={`Monthly report · ${monthName(month)}`}
        description={`${scope.clientName}${scope.allSites ? "" : " · your sites"}${month === thisMonth ? " · so far this month" : ""}. Counted from the records Control works from.`}
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <a href={`/client-portal/report?month=${prevMonth(month)}`} className="inline-flex h-9 items-center rounded-md border px-3 text-[12px] font-semibold" style={{ borderColor: "var(--hairline)" }}>
              ← {monthName(prevMonth(month))}
            </a>
            {month < thisMonth && (
              <a href={`/client-portal/report?month=${nextMonth(month)}`} className="inline-flex h-9 items-center rounded-md border px-3 text-[12px] font-semibold" style={{ borderColor: "var(--hairline)" }}>
                {monthName(nextMonth(month))} →
              </a>
            )}
            <PrintButton />
          </div>
        }
      />
      <section aria-label="Cover" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Hours covered" value={`${m.hoursCovered} of ${m.hoursScheduled}`} detail={`${m.shifts} shift${m.shifts === 1 ? "" : "s"} finished`} tone={m.hoursScheduled && m.hoursCovered < m.hoursScheduled ? "warn" : "good"} />
        <Stat label="Officers arrived on time" value={pct(m.onTimePct)} detail="Within 15 minutes of the start" tone={m.onTimePct === null ? undefined : m.onTimePct >= 95 ? "good" : "warn"} />
        <Stat label="Check calls on time" value={pct(m.checkCallPct)} detail="Where the post has check calls by phone" tone={m.checkCallPct === null ? undefined : m.checkCallPct >= 95 ? "good" : "warn"} />
        <Stat label="Shifts not covered" value={m.shiftsUncovered} tone={m.shiftsUncovered ? "bad" : "good"} detail={m.shiftsUncovered ? "Each one is reviewed" : "Every shift covered"} />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Incidents">
          <p className="text-[14px]">
            <strong>{m.incidents.serious}</strong> serious · <strong>{m.incidents.notable}</strong> notable
          </p>
          <Muted className="mt-1">Minor entries in the site log are not counted here.</Muted>
        </Card>
        <Card title="Your requests">
          <p className="text-[14px]">
            <strong>{m.requests.raised}</strong> raised · <strong>{m.requests.done}</strong> done · <strong>{m.requests.open}</strong> still open
          </p>
          <Muted className="mt-1">
            On average taken on in {minutesWords(m.requests.avgFirstResponseMin)} and finished in {minutesWords(m.requests.avgResolveMin)}.
          </Muted>
        </Card>
      </div>
      {m.bySite.length > 1 && (
        <Card title="By site">
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left text-[13px]">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  {["Site", "Shifts", "Arrived on time", "Incidents"].map((h) => (
                    <th key={h} className="border-b px-5 py-2 text-[11px] font-medium" style={{ borderColor: "var(--hairline)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.bySite.map((s) => (
                  <tr key={s.site}>
                    <td className="border-b px-5 py-2" style={{ borderColor: "var(--hairline)" }}>
                      {s.site}
                    </td>
                    <td className="tnum border-b px-5 py-2" style={{ borderColor: "var(--hairline)" }}>
                      {s.shifts}
                    </td>
                    <td className="tnum border-b px-5 py-2" style={{ borderColor: "var(--hairline)" }}>
                      {pct(s.onTimePct)}
                    </td>
                    <td className="tnum border-b px-5 py-2" style={{ borderColor: "var(--hairline)" }}>
                      {s.incidents}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
