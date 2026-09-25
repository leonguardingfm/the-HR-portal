import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Empty, Muted, NotLinked, Pill, ukDay, ukTime } from "@/components/client-portal/Bits";
import { clientScope } from "@/lib/auth/client-scope";
import { OPS_RULES } from "@/lib/core/ops";
import { periodRange } from "@/lib/core/performance";
import { portalShifts, type ShiftRecord } from "@/lib/db/client-portal";

export const dynamic = "force-dynamic";

const PERIODS = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "month", label: "This month" },
  { id: "lastmonth", label: "Last month" },
] as const;

function arrival(s: ShiftRecord) {
  if (!s.bookedOnAt) return <Pill tone="bad">Did not arrive</Pill>;
  const late = (s.minutesLate ?? 0) > OPS_RULES.bookOnGraceMinutes;
  return <Pill tone={late ? "warn" : "good"}>{late ? `${ukTime(s.bookedOnAt)} · ${s.minutesLate} min late` : `${ukTime(s.bookedOnAt)} · on time`}</Pill>;
}

function calls(s: ShiftRecord) {
  if (!s.calls.required) return "Not required";
  if (s.calls.noSignal) return "Held on your site phone";
  if (!s.bookedOnAt) return "—";
  const { onTime, late, missed } = s.calls;
  return `${onTime} on time${late ? ` · ${late} late` : ""}${missed ? ` · ${missed} missed` : ""}`;
}

/**
 * The record of each finished shift at the client's sites (26 September
 * 2026): when the officer arrived, whether it was confirmed at the site, the
 * check calls, and any notable incident. The same records Control works from.
 */
export default async function ClientShiftsPage({ searchParams }: { searchParams: Promise<{ period?: string; site?: string }> }) {
  const scope = await clientScope();
  if (!scope) return <NotLinked />;
  const sp = await searchParams;
  const period = PERIODS.some((p) => p.id === sp.period) ? sp.period! : "7d";
  const range = periodRange(period, undefined, undefined);
  const site = scope.sites.find((s) => s.id === sp.site) ?? null;
  const all = await portalShifts(scope, range.from, range.to);
  const rows = site ? all.filter((r) => r.site === site.name) : all;
  const onTime = rows.filter((r) => r.bookedOnAt && (r.minutesLate ?? 0) <= OPS_RULES.bookOnGraceMinutes).length;
  const qs = new URLSearchParams({ period, ...(site ? { site: site.id } : {}) }).toString();
  const field = "h-9 rounded-md border px-2.5 text-[13px]";
  const fs = { background: "var(--surface-1)", borderColor: "var(--hairline)" };
  return (
    <div className="space-y-5">
      <PageHeader
        title="Shift record"
        description={`${range.label}${site ? ` · ${site.name}` : ""}: ${rows.length} finished shift${rows.length === 1 ? "" : "s"}, ${rows.length ? Math.round((onTime / rows.length) * 100) : 0}% arrived on time.`}
        action={
          <a href={`/client-portal/shifts/export?${qs}`} className="inline-flex h-9 items-center rounded-md border px-3 text-[12px] font-semibold" style={{ borderColor: "var(--hairline)" }}>
            ⬇ Download (CSV)
          </a>
        }
      />
      <form className="flex flex-wrap items-end gap-3 rounded-lg border px-4 py-3" style={{ borderColor: "var(--hairline)", background: "var(--surface-1)" }}>
        <label className="text-[12px] font-medium">
          Period
          <select name="period" defaultValue={period} className={`${field} mt-1 block`} style={fs}>
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {scope.sites.length > 1 && (
          <label className="text-[12px] font-medium">
            Site
            <select name="site" defaultValue={site?.id ?? ""} className={`${field} mt-1 block`} style={fs}>
              <option value="">All your sites</option>
              {scope.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="h-9 rounded-md px-4 text-[13px] font-semibold text-white" style={{ background: "var(--series-1)" }}>
          Show
        </button>
      </form>
      <Card title="Finished shifts" subtitle="Arrival is when the officer booked on. “Confirmed at your site” means their phone placed them there.">
        {rows.length === 0 ? (
          <Empty>No finished shifts in this period.</Empty>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-[13px]">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  {["Shift", "Post", "Officer", "Arrived", "Check calls", "Finished", "Incidents"].map((h) => (
                    <th key={h} className="border-b px-3 py-2 text-[11px] font-medium" style={{ borderColor: "var(--hairline)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="border-b px-3 py-2.5 whitespace-nowrap" style={{ borderColor: "var(--hairline)" }}>
                      {ukDay(r.startsAt)}
                      <Muted>
                        {ukTime(r.startsAt)}–{ukTime(r.endsAt)}
                      </Muted>
                    </td>
                    <td className="border-b px-3 py-2.5" style={{ borderColor: "var(--hairline)" }}>
                      {r.post}
                      <Muted>{r.site}</Muted>
                    </td>
                    <td className="border-b px-3 py-2.5" style={{ borderColor: "var(--hairline)" }}>
                      {r.officer}
                    </td>
                    <td className="border-b px-3 py-2.5" style={{ borderColor: "var(--hairline)" }}>
                      {arrival(r)}
                      {r.atSite && <Muted className="mt-1">✓ Confirmed at your site</Muted>}
                    </td>
                    <td className="border-b px-3 py-2.5" style={{ borderColor: "var(--hairline)" }}>
                      {calls(r)}
                    </td>
                    <td className="border-b px-3 py-2.5 whitespace-nowrap" style={{ borderColor: "var(--hairline)" }}>
                      {r.bookedOffAt ? ukTime(r.bookedOffAt) : r.bookedOnAt ? "At the shift's end" : "—"}
                    </td>
                    <td className="border-b px-3 py-2.5" style={{ borderColor: "var(--hairline)" }}>
                      {r.incidents ? <Pill tone="warn">{r.incidents}</Pill> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
