import { type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { csvField } from "@/lib/core/audit";
import { DEPARTMENTS, categoryLabel, clockMinutesBetween, outcomeOf, priorityOf, statusOf, taskRef, type HubDepartment } from "@/lib/core/hub";
import { performanceScope, periodRange } from "@/lib/core/performance";
import { db } from "@/lib/db/client";
import { officeHoursFor } from "@/lib/db/hub";
import { getPerformance } from "@/lib/db/performance";

export const dynamic = "force-dynamic";

/**
 * Performance as a spreadsheet, filtered as on screen: one row per person, or
 * one row per task. The Managing Director may take any of it; a department's
 * head only their own department's. Taking it is recorded.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  const scope = session ? performanceScope(session.activeRole) : null;
  if (!session || !scope) return new Response("Only the Managing Director and each department's head can export performance.", { status: 403 });
  const q = req.nextUrl.searchParams;
  const range = periodRange(q.get("period") ?? "7d", q.get("from") ?? undefined, q.get("to") ?? undefined);
  const department = scope.all ? (DEPARTMENTS.some((d) => d.id === q.get("department")) ? (q.get("department") as HubDepartment) : null) : scope.department;
  const includeTest = q.get("test") === "1";
  const kind = q.get("kind") === "tasks" ? "tasks" : "people";
  let lines: string[];
  if (kind === "people") {
    const perf = await getPerformance({ from: range.from, to: range.to, department, includeTest });
    lines = [
      ["Person", "Department", "Accepted", "Closed", "Within SLA %", "Avg minutes to accept", "Avg minutes to first action", "Avg minutes to resolve", "SLA breaches", "Handed over", "Handed to them", "Reassigned away", "Portal tasks done", "Portal on time %", "Actions logged"].map(csvField).join(","),
      ...perf.people.map((p) => [p.name, p.department, p.accepted, p.closed, p.withinSlaPct, p.avgAccept, p.avgFirstAction, p.avgResolution, p.breaches, p.handedOut, p.handedIn, p.reassignedAway, p.portalDone, p.portalOnTimePct, p.actions].map(csvField).join(",")),
    ];
  } else {
    const tasks = await db.hubTask.findMany({
      where: { ...(includeTest ? {} : { test: false }), ...(department ? { department } : {}), receivedAt: { gte: range.from, lt: range.to } },
      include: { mailbox: { select: { address: true, officeHoursOnly: true } }, client: { select: { name: true } }, site: { select: { name: true } }, owner: { select: { displayName: true } } },
      orderBy: { receivedAt: "asc" },
      take: 50_000,
    });
    const m = (t: (typeof tasks)[number], a: Date | null, b: Date | null) => (a && b ? Math.round(clockMinutesBetween(a, b, officeHoursFor(t))) : "");
    lines = [
      ["Reference", "Received (UTC)", "Source", "Mailbox", "Department", "Sender", "Subject", "Category", "Priority", "Client", "Site", "Owner", "Status", "Outcome", "Within SLA", "Breaches", "Minutes to accept", "Minutes to first action", "Minutes to first response", "Minutes to resolve", "Reason", "Corrective action"].map(csvField).join(","),
      ...tasks.map((t) =>
        [taskRef(t), t.receivedAt.toISOString(), t.source, t.mailbox?.address ?? "", t.department, t.senderName ?? t.senderAddress ?? "", t.subject, categoryLabel(t.category), priorityOf(t.priority).label, t.client?.name ?? "", t.site?.name ?? "", t.owner?.displayName ?? "", statusOf(t.status).label, t.outcome ? outcomeOf(t.outcome)?.label ?? t.outcome : "", t.withinSla === null ? "" : t.withinSla ? "yes" : "no", t.breaches, m(t, t.receivedAt, t.acceptedAt), m(t, t.receivedAt, t.firstActionAt), m(t, t.receivedAt, t.firstResponseAt), m(t, t.receivedAt, t.completedAt), t.outcomeReason ?? "", t.correctiveAction ?? ""]
          .map(csvField)
          .join(","),
      ),
    ];
  }
  await db.event.create({ data: { type: "audit.performance_exported", actorUserId: session.userId, actorRole: session.activeRole, department: department === "control" ? "control" : department === "recruitment" ? "recruitment" : "administration", detail: `Downloaded performance (${kind}, ${range.label}${department ? `, ${department}` : ""}${includeTest ? ", with test inbox" : ""}): ${lines.length - 1} rows.` } });
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leon-performance-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" },
  });
}
