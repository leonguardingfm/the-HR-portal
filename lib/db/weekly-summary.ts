/**
 * The Managing Director's weekly summary (26 September 2026): every Monday
 * from 07:00 UK time, last week's figures — the company, each department, who
 * did well and who is struggling, and why tasks went over — emailed to each
 * Managing Director and kept on the Performance page. Sent once a week, however
 * often the worker runs and whenever the server restarts.
 */

import { minutesWords } from "@/lib/core/performance";
import { addDays, mondayOf, ukDate, ukInstant, ukTime } from "@/lib/core/rota";
import { db } from "./client";
import { sendEmail } from "./email";
import { getPerformance, type Kpis } from "./performance";

const KEY = "performance.weekly_summary_week";

const pctWords = (n: number | null) => (n === null ? "—" : `${n}%`);
const change = (now: number | null, before: number | null, unit = "") => (now === null || before === null || now === before ? "" : ` (${now > before ? "up" : "down"} ${Math.abs(now - before)}${unit} on the week before)`);

function kpiLines(k: Kpis, before?: Kpis) {
  return [
    `  Received ${k.received}, closed ${k.closed}${before ? change(k.closed, before.closed) : ""}`,
    `  Within SLA: ${pctWords(k.withinSlaPct)}${before ? change(k.withinSlaPct, before.withinSlaPct, " points") : ""}`,
    `  Average time to accept ${minutesWords(k.avgAccept)} · to first action ${minutesWords(k.avgFirstAction)} · to close ${minutesWords(k.avgResolution)}`,
    `  SLA breaches: ${k.breaches}${before ? change(k.breaches, before.breaches) : ""} · still open now: ${k.openNow} (${k.overdueNow} over time, ${k.unassignedNow} with no owner)`,
  ];
}

/** Last week's summary as plain text. Monday is the date of the week summarised. */
export async function buildWeeklySummary(monday: string, now = new Date()) {
  const from = ukInstant(monday, "00:00");
  const to = ukInstant(addDays(monday, 7), "00:00");
  const [perf, prev] = await Promise.all([
    getPerformance({ from, to, department: null, includeTest: false }, now),
    getPerformance({ from: ukInstant(addDays(monday, -7), "00:00"), to: from, department: null, includeTest: false }, now),
  ]);
  const worked = perf.people.filter((p) => p.accepted + p.closed > 0);
  const best = worked.filter((p) => p.closed >= 3 && p.withinSlaPct !== null).sort((a, b) => b.withinSlaPct! - a.withinSlaPct! || b.closed - a.closed).slice(0, 3);
  const struggling = worked.filter((p) => p.breaches >= 2).sort((a, b) => b.breaches - a.breaches).slice(0, 5);
  const lines = [
    `The week of ${monday} to ${addDays(monday, 6)}.`,
    "",
    "THE COMPANY",
    ...kpiLines(perf.collective, prev.collective),
    "",
    "BY DEPARTMENT",
    ...perf.departments.flatMap((d) => [`${d.label} (${d.staff} staff)`, ...kpiLines(d.kpis, prev.departments.find((x) => x.id === d.id)?.kpis)]),
    "",
    "PEOPLE",
    best.length ? `  Best within SLA: ${best.map((p) => `${p.name} ${pctWords(p.withinSlaPct)} of ${p.closed}`).join(" · ")}` : "  Nobody closed three or more tasks.",
    struggling.length ? `  Most breaches: ${struggling.map((p) => `${p.name} ${p.breaches}`).join(" · ")}` : "  Nobody had two or more breaches.",
    `  ${worked.length} people worked tasks; ${perf.movements.handovers} handovers, ${perf.movements.reassignments} reassignments.`,
    "",
    "WHY TASKS WENT OVER OR FAILED",
    ...(perf.reasons.length ? perf.reasons.slice(0, 8).map((r) => `  ${r.ref} (${r.owner ?? "no owner"}, ${r.outcome}): ${r.reason}${r.corrective ? ` — to stop it again: ${r.corrective}` : ""}`) : ["  None recorded."]),
    "",
    `The full picture, person by person: ${(process.env.APP_URL ?? "").replace(/\/$/, "")}/performance?period=custom&from=${monday}&to=${addDays(monday, 6)}`,
  ];
  return { subject: `Weekly performance — week of ${monday}: ${pctWords(perf.collective.withinSlaPct)} within SLA, ${perf.collective.breaches} breaches`, body: lines.join("\n") };
}

/** Monday from 07:00 UK time, once per week. Returns how many were sent. */
export async function sendWeeklySummaryIfDue(now = new Date()) {
  const today = ukDate(now);
  if (mondayOf(today) !== today || ukTime(now) < "07:00") return 0;
  const week = addDays(today, -7);
  const last = await db.setting.findUnique({ where: { key: KEY } });
  if (last?.value === week) return 0;
  // Claimed first, so two servers never both send it.
  const claimed = last
    ? await db.setting.updateMany({ where: { key: KEY, value: last.value }, data: { value: week } })
    : await db.setting.createMany({ data: [{ key: KEY, value: week, valueType: "string", label: "The last week the Managing Director's summary was sent for", usedBy: "performance" }], skipDuplicates: true });
  if (!claimed.count) return 0;
  const { subject, body } = await buildWeeklySummary(week, now);
  const mds = await db.user.findMany({ where: { active: true, roles: { some: { role: "top_management", revokedAt: null } } }, select: { id: true, email: true, displayName: true } });
  let sent = 0;
  for (const md of mds) {
    // Kept even with no address, so it still shows on the Performance page.
    await sendEmail({ to: md.email ?? `${md.displayName} (no email address)`, subject, body, purpose: "weekly_summary" });
    sent++;
  }
  await db.event.create({ data: { type: "performance.weekly_summary", actorSystem: "worker", department: "administration", detail: `Weekly performance summary for the week of ${week} sent to ${sent} Managing Director${sent === 1 ? "" : "s"}.` } });
  return sent;
}
