import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireSession } from "@/lib/auth/server";
import { DEPARTMENTS, type HubDepartment } from "@/lib/core/hub";
import { PERIODS, minutesWords, periodRange } from "@/lib/core/performance";
import { db } from "@/lib/db/client";
import { getPerformance, type Kpis } from "@/lib/db/performance";

export const dynamic = "force-dynamic";

type SP = { period?: string; from?: string; to?: string; department?: string; test?: string; sort?: string };

const SORTS = {
  name: { label: "Name", key: (p: Row) => p.name, asc: true },
  closed: { label: "Closed", key: (p: Row) => p.closed, asc: false },
  sla: { label: "Within SLA", key: (p: Row) => p.withinSlaPct ?? -1, asc: false },
  accept: { label: "Time to accept", key: (p: Row) => p.avgAccept ?? 1e9, asc: true },
  breaches: { label: "Breaches", key: (p: Row) => p.breaches, asc: false },
} as const;
type Row = Awaited<ReturnType<typeof getPerformance>>["people"][number];

function Tile({ label, value, detail, tone }: { label: string; value: string | number; detail?: string; tone?: "good" | "bad" | "warn" }) {
  const colour = tone === "bad" ? "var(--critical-text)" : tone === "warn" ? "var(--warning-text)" : tone === "good" ? "var(--good-text)" : "var(--text-primary)";
  return (
    <div className="rounded-lg border px-4 py-3" style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}>
      <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
      <p className="tnum mt-1 text-[24px] leading-none font-semibold" style={{ color: colour }}>
        {value}
      </p>
      {detail && (
        <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {detail}
        </p>
      )}
    </div>
  );
}

const slaTone = (p: number | null) => (p === null ? undefined : p >= 95 ? "good" : p >= 85 ? "warn" : "bad");

/**
 * Performance (26 September 2026) — the Managing Director's view: the company
 * as a whole, each department, and each person, for any period. Everything is
 * counted from the records; test-inbox work is left out unless asked for.
 */
export default async function PerformancePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireSession();
  const sp = await searchParams;
  const period = sp.period ?? "7d";
  const range = periodRange(period, sp.from, sp.to);
  const department = DEPARTMENTS.some((d) => d.id === sp.department) ? (sp.department as HubDepartment) : null;
  const includeTest = sp.test === "1";
  const [perf, summaries] = await Promise.all([
    getPerformance({ from: range.from, to: range.to, department, includeTest }),
    db.emailMessage.findMany({ where: { purpose: "weekly_summary" }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, subject: true, createdAt: true, body: true } }),
  ]);
  const c: Kpis = perf.collective;
  const sort = (sp.sort && sp.sort in SORTS ? sp.sort : "closed") as keyof typeof SORTS;
  const people = [...perf.people].sort((a, b) => {
    const s = SORTS[sort];
    const x = s.key(a);
    const y = s.key(b);
    return (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) * (s.asc ? 1 : -1);
  });
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v) p.set(k, v);
    return p.toString();
  };
  const field = "h-9 rounded-md border px-2.5 text-[13px]";
  const fs = { background: "var(--surface-1)", borderColor: "var(--hairline)" };
  const th = "border-b px-3 py-2 font-medium whitespace-nowrap";
  const td = "border-b px-3 py-2 whitespace-nowrap";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Performance"
        description={`${range.label}${department ? ` · ${DEPARTMENTS.find((d) => d.id === department)?.label}` : " · the whole company"}${includeTest ? " · including the test inbox" : ""}. Counted from the records; times for HR and Accounts are office time.`}
        action={
          <div className="flex flex-wrap gap-2">
            <a href={`/performance/export?${qs({ kind: "people" })}`} className="inline-flex h-9 items-center rounded-md border px-3 text-[12px] font-semibold" style={{ borderColor: "var(--hairline)" }}>
              ⬇ People (CSV)
            </a>
            <a href={`/performance/export?${qs({ kind: "tasks" })}`} className="inline-flex h-9 items-center rounded-md border px-3 text-[12px] font-semibold" style={{ borderColor: "var(--hairline)" }}>
              ⬇ Tasks (CSV)
            </a>
            <Link href="/performance/settings" className="inline-flex h-9 items-center rounded-md border px-3 text-[12px] font-semibold" style={{ borderColor: "var(--hairline)" }}>
              ⚙ Hub settings
            </Link>
          </div>
        }
      />

      <form action="/performance" className="flex flex-wrap items-end gap-3 rounded-lg border px-4 py-3" style={{ borderColor: "var(--hairline)", background: "var(--surface-1)" }}>
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
        <label className="text-[12px] font-medium">
          From (for chosen dates)
          <input type="date" name="from" defaultValue={sp.from ?? ""} className={`${field} mt-1 block`} style={fs} />
        </label>
        <label className="text-[12px] font-medium">
          To
          <input type="date" name="to" defaultValue={sp.to ?? ""} className={`${field} mt-1 block`} style={fs} />
        </label>
        <label className="text-[12px] font-medium">
          Department
          <select name="department" defaultValue={department ?? ""} className={`${field} mt-1 block`} style={fs}>
            <option value="">Whole company</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-9 items-center gap-2 text-[12px]">
          <input type="checkbox" name="test" value="1" defaultChecked={includeTest} className="h-4 w-4" /> Include the test inbox
        </label>
        <button type="submit" className="h-9 rounded-md px-4 text-[13px] font-semibold text-white" style={{ background: "var(--series-1)" }}>
          Show
        </button>
      </form>

      <section aria-label="The whole picture" className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <Tile label="Emails and tasks in" value={c.received} detail={`${c.closed} closed in the period`} />
        <Tile label="Completed within SLA" value={c.withinSlaPct === null ? "—" : `${c.withinSlaPct}%`} detail={`of ${perf.measured} completed`} tone={slaTone(c.withinSlaPct)} />
        <Tile label="Average time to accept" value={minutesWords(c.avgAccept)} />
        <Tile label="Average to first action" value={minutesWords(c.avgFirstAction)} />
        <Tile label="Average to first response" value={minutesWords(c.avgFirstResponse)} />
        <Tile label="Average to resolve" value={minutesWords(c.avgResolution)} />
        <Tile label="SLA breaches" value={c.breaches} tone={c.breaches ? "bad" : "good"} detail="Missed accept, action or update" />
        <Tile label="Over time right now" value={c.overdueNow} detail={`${c.openNow} open · ${c.unassignedNow} with no owner`} tone={c.overdueNow ? "bad" : "good"} />
        <Tile label="Portal tasks done" value={c.portalDone} detail={`${c.portalOverdueNow} overdue now`} tone={c.portalOverdueNow ? "warn" : undefined} />
        <Tile label="Handovers · reassignments" value={`${perf.movements.handovers} · ${perf.movements.reassignments}`} />
      </section>

      <Card title="By department" subtitle="The same measures, department by department.">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                {["Department", "Staff", "In", "Closed", "Within SLA", "To accept", "To first action", "To resolve", "Breaches", "Over time now", "Portal tasks done"].map((h) => (
                  <th key={h} className={th} style={{ borderColor: "var(--hairline)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perf.departments.map((d) => (
                <tr key={d.id}>
                  <td className={`${td} font-medium`} style={{ borderColor: "var(--hairline)" }}>
                    <Link href={`/performance?${qs({ department: d.id })}`} className="underline-offset-2 hover:underline">
                      {d.label}
                    </Link>
                  </td>
                  {[d.staff, d.kpis.received, d.kpis.closed].map((v, i) => (
                    <td key={i} className={`${td} tnum`} style={{ borderColor: "var(--hairline)" }}>
                      {v}
                    </td>
                  ))}
                  <td className={`${td} tnum font-semibold`} style={{ borderColor: "var(--hairline)", color: d.kpis.withinSlaPct === null ? undefined : d.kpis.withinSlaPct >= 95 ? "var(--good-text)" : d.kpis.withinSlaPct >= 85 ? "var(--warning-text)" : "var(--critical-text)" }}>
                    {d.kpis.withinSlaPct === null ? "—" : `${d.kpis.withinSlaPct}%`}
                  </td>
                  {[minutesWords(d.kpis.avgAccept), minutesWords(d.kpis.avgFirstAction), minutesWords(d.kpis.avgResolution), d.kpis.breaches, d.kpis.overdueNow, d.kpis.portalDone].map((v, i) => (
                    <td key={i} className={`${td} tnum`} style={{ borderColor: "var(--hairline)" }}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="By person" subtitle="Everyone who works a mailbox or a department's queue. Open a name for their detail. Sort by a heading.">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[66rem] text-left text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                {[
                  ["name", "Person"],
                  [null, "Department"],
                  [null, "Accepted"],
                  ["closed", "Closed"],
                  ["sla", "Within SLA"],
                  ["accept", "To accept"],
                  [null, "To first action"],
                  [null, "To resolve"],
                  ["breaches", "Breaches"],
                  [null, "Handed over · to them"],
                  [null, "Portal tasks (on time)"],
                  [null, "Actions logged"],
                ].map(([key, label]) => (
                  <th key={label} className={th} style={{ borderColor: "var(--hairline)" }}>
                    {key ? (
                      <Link href={`/performance?${qs({ sort: key })}`} className="underline-offset-2 hover:underline" style={{ color: sort === key ? "var(--text-primary)" : undefined }}>
                        {label}
                        {sort === key ? " ▾" : ""}
                      </Link>
                    ) : (
                      label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--wash)]">
                  <td className={`${td} font-medium`} style={{ borderColor: "var(--hairline)" }}>
                    <Link href={`/performance/person/${p.id}?${qs({ sort: undefined })}`} className="underline underline-offset-2">
                      {p.name}
                    </Link>
                  </td>
                  <td className={td} style={{ borderColor: "var(--hairline)", color: "var(--text-secondary)" }}>
                    {p.department}
                  </td>
                  <td className={`${td} tnum`} style={{ borderColor: "var(--hairline)" }}>
                    {p.accepted}
                  </td>
                  <td className={`${td} tnum`} style={{ borderColor: "var(--hairline)" }}>
                    {p.closed}
                  </td>
                  <td className={`${td} tnum font-semibold`} style={{ borderColor: "var(--hairline)", color: p.withinSlaPct === null ? undefined : p.withinSlaPct >= 95 ? "var(--good-text)" : p.withinSlaPct >= 85 ? "var(--warning-text)" : "var(--critical-text)" }}>
                    {p.withinSlaPct === null ? "—" : `${p.withinSlaPct}%`}
                  </td>
                  {[minutesWords(p.avgAccept), minutesWords(p.avgFirstAction), minutesWords(p.avgResolution)].map((v, i) => (
                    <td key={i} className={`${td} tnum`} style={{ borderColor: "var(--hairline)" }}>
                      {v}
                    </td>
                  ))}
                  <td className={`${td} tnum`} style={{ borderColor: "var(--hairline)", color: p.breaches ? "var(--critical-text)" : undefined }}>
                    {p.breaches}
                  </td>
                  <td className={`${td} tnum`} style={{ borderColor: "var(--hairline)" }}>
                    {p.handedOut} · {p.handedIn}
                  </td>
                  <td className={`${td} tnum`} style={{ borderColor: "var(--hairline)" }}>
                    {p.portalDone}
                    {p.portalOnTimePct !== null ? ` (${p.portalOnTimePct}%)` : ""}
                  </td>
                  <td className={`${td} tnum`} style={{ borderColor: "var(--hairline)" }}>
                    {p.actions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Why things were late or unsuccessful" subtitle="The reasons and the corrective actions people gave when they closed them.">
          {perf.reasons.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Nothing late or unsuccessful in this period.
            </p>
          ) : (
            <ul className="space-y-3 text-[12px]">
              {perf.reasons.map((r) => (
                <li key={r.id}>
                  <Link href={`/hub/${r.id}`} className="font-semibold underline-offset-2 hover:underline">
                    {r.ref} · {r.subject}
                  </Link>
                  <span style={{ color: "var(--text-muted)" }}>
                    {" "}
                    · {r.outcome}
                    {r.breaches ? ` · ${r.breaches} breach${r.breaches === 1 ? "" : "es"}` : ""}
                    {r.owner ? ` · ${r.owner}` : ""}
                  </span>
                  <p>Reason: {r.reason}</p>
                  {r.corrective && <p style={{ color: "var(--text-secondary)" }}>Fix: {r.corrective}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Outcomes">
            {perf.outcomes.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                Nothing closed yet.
              </p>
            ) : (
              <ul className="space-y-1 text-[13px]">
                {perf.outcomes.map((o) => (
                  <li key={o.outcome} className="flex justify-between gap-3">
                    <span>{o.outcome}</span>
                    <span className="tnum font-semibold">{o.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Handovers and reassignments" subtitle="The latest moves, with the note left.">
            {perf.movements.latest.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                None.
              </p>
            ) : (
              <ul className="space-y-2 text-[12px]">
                {perf.movements.latest.map((m, i) => (
                  <li key={i}>
                    <Link href={`/hub/${m.taskId}`} className="font-semibold underline-offset-2 hover:underline">
                      {m.ref}
                    </Link>{" "}
                    {m.kind === "handover" ? `${m.from} handed over to ${m.to}` : `${m.by} reassigned it to ${m.to}`}
                    <span style={{ color: "var(--text-muted)" }}> · {new Date(m.at).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    {m.reason && <p style={{ color: "var(--text-secondary)" }}>“{m.reason}”</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {(
          [
            ["By category", perf.categories],
            ["By priority", perf.priorities],
            ["By client", perf.clients],
          ] as const
        ).map(([title, list]) => (
          <Card key={title} title={title}>
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <th className="pb-1 font-medium">&nbsp;</th>
                  <th className="pb-1 font-medium">In</th>
                  <th className="pb-1 font-medium">Within SLA</th>
                  <th className="pb-1 font-medium">To resolve</th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--text-muted)" }}>
                      Nothing in this period.
                    </td>
                  </tr>
                )}
                {list.map((r) => (
                  <tr key={r.key}>
                    <td className="py-1 capitalize">{r.label}</td>
                    <td className="tnum py-1">{r.received}</td>
                    <td className="tnum py-1">{r.withinSlaPct === null ? "—" : `${r.withinSlaPct}%`}</td>
                    <td className="tnum py-1">{minutesWords(r.avgResolution)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>

      <Card title="Weekly summaries" subtitle="Sent to you every Monday morning, and kept here.">
        {summaries.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            The first arrives next Monday at 07:00.
          </p>
        ) : (
          <ul className="space-y-2 text-[13px]">
            {summaries.map((s) => (
              <li key={s.id}>
                <details>
                  <summary className="cursor-pointer">
                    {s.subject} <span style={{ color: "var(--text-muted)" }}>· {s.createdAt.toLocaleDateString("en-GB")}</span>
                  </summary>
                  <pre className="mt-2 text-[12px] whitespace-pre-wrap" style={{ fontFamily: "inherit", color: "var(--text-secondary)" }}>
                    {s.body}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
