import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { requireSession } from "@/lib/auth/server";
import { DEPARTMENTS, type HubDepartment } from "@/lib/core/hub";
import { minutesWords, periodRange } from "@/lib/core/performance";
import { ROLE_LABELS } from "@/lib/labels";
import { getPerformance, getPersonPerformance } from "@/lib/db/performance";

export const dynamic = "force-dynamic";

type SP = { period?: string; from?: string; to?: string; department?: string; test?: string };

/** One person's performance, for the Managing Director: their figures, day by day, and what lies behind them. */
export default async function PersonPerformancePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const range = periodRange(sp.period ?? "7d", sp.from, sp.to);
  const f = { from: range.from, to: range.to, department: DEPARTMENTS.some((d) => d.id === sp.department) ? (sp.department as HubDepartment) : null, includeTest: sp.test === "1" };
  const [p, all] = await Promise.all([getPersonPerformance(id, f), getPerformance({ ...f, department: null })]);
  if (!p) notFound();
  const me = all.people.find((x) => x.id === id);
  const back = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const max = Math.max(1, ...p.daily.map((d) => Math.max(d.accepted, d.closed, d.breaches)));
  const w = Math.max(320, p.daily.length * 36);
  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        <Link href={`/performance?${back}`} className="underline underline-offset-2">
          Performance
        </Link>{" "}
        / {p.user.name}
      </nav>
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{p.user.name}</h1>
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          {p.user.roles.map((r) => ROLE_LABELS[r]).join(" · ")} · {range.label}
          {f.includeTest ? " · including the test inbox" : ""}
        </p>
      </header>
      {me && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          {[
            ["Accepted", me.accepted],
            ["Closed", me.closed],
            ["Within SLA", me.withinSlaPct === null ? "—" : `${me.withinSlaPct}%`],
            ["To accept (avg)", minutesWords(me.avgAccept)],
            ["To first action (avg)", minutesWords(me.avgFirstAction)],
            ["To resolve (avg)", minutesWords(me.avgResolution)],
            ["SLA breaches", me.breaches],
            ["Handed over · to them", `${me.handedOut} · ${me.handedIn}`],
            ["Reassigned away", me.reassignedAway],
            ["Portal tasks done", `${p.portal.done}${p.portal.done ? ` (${Math.round((p.portal.onTime / p.portal.done) * 100)}% on time)` : ""}`],
            ["Actions logged", me.actions],
            ["Last active", me.lastSeen ? new Date(me.lastSeen).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border px-4 py-3" style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {label}
              </p>
              <p className="tnum mt-1 text-[20px] font-semibold">{value}</p>
            </div>
          ))}
        </section>
      )}

      <Card title="Day by day" subtitle="Tasks accepted, closed, and SLA breaches while they held them.">
        <div className="overflow-x-auto">
          <svg role="img" aria-label={`Day by day for ${p.user.name}`} width={w} height={170} className="block">
            {p.daily.map((d, i) => {
              const x = 20 + i * 36;
              const bar = (v: number, dx: number, colour: string) => <rect x={x + dx} y={130 - (v / max) * 110} width={8} height={(v / max) * 110} fill={colour} rx={1} />;
              return (
                <g key={d.day}>
                  {bar(d.accepted, 0, "var(--series-1)")}
                  {bar(d.closed, 10, "var(--status-good)")}
                  {bar(d.breaches, 20, "var(--status-critical)")}
                  <text x={x + 14} y={148} fontSize={9} textAnchor="middle" fill="var(--text-muted)">
                    {d.day.slice(8)}/{d.day.slice(5, 7)}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="mt-1 flex gap-4 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            <span><span style={{ color: "var(--accent-text)" }}>■</span> Accepted</span>
            <span><span style={{ color: "var(--good-text)" }}>■</span> Closed</span>
            <span><span style={{ color: "var(--critical-text)" }}>■</span> Breaches</span>
          </p>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title={`Closed · ${p.closed.length}`}>
          <ul className="space-y-1.5 text-[12px]">
            {p.closed.length === 0 && <li style={{ color: "var(--text-muted)" }}>None in this period.</li>}
            {p.closed.map((t) => (
              <li key={t.id} className="flex flex-wrap justify-between gap-2">
                <Link href={`/hub/${t.id}`} className="underline-offset-2 hover:underline">
                  {t.ref} · {t.subject}
                </Link>
                <span style={{ color: t.withinSla === false ? "var(--critical-text)" : "var(--text-secondary)" }}>
                  {t.outcome} · {minutesWords(t.minutes)} · {t.withinSla === false ? "outside SLA" : "within SLA"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-5">
          <Card title={`Breaches · ${p.breaches.length}`}>
            <ul className="space-y-1.5 text-[12px]">
              {p.breaches.length === 0 && <li style={{ color: "var(--text-muted)" }}>None in this period.</li>}
              {p.breaches.map((b, i) => (
                <li key={i}>
                  <Link href={`/hub/${b.id}`} className="underline-offset-2 hover:underline">
                    {b.ref}
                  </Link>{" "}
                  — {b.clock === "accept" ? "not accepted in time" : b.clock === "action" ? "no action in time" : "no update in time"}
                  {b.reason && <span style={{ color: "var(--text-secondary)" }}> · “{b.reason}”</span>}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="What they did" subtitle="Actions logged, by kind.">
            <ul className="space-y-1 text-[12px]">
              {p.actionGroups.length === 0 && <li style={{ color: "var(--text-muted)" }}>Nothing logged in this period.</li>}
              {p.actionGroups.map(([g, n]) => (
                <li key={g} className="flex justify-between">
                  <span className="capitalize">{g.replace(/_/g, " ")}</span>
                  <span className="tnum font-semibold">{n}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
