import { type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { csvField, typeWords } from "@/lib/core/audit";
import { db } from "@/lib/db/client";
import { auditWhere, type AuditFilter } from "@/lib/db/audit";

export const dynamic = "force-dynamic";

/**
 * The audit log as a spreadsheet, filtered as on screen — for the Managing
 * Director and the auditor only. Taking a copy is recorded in the log itself.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !["top_management", "auditor"].includes(session.activeRole)) return new Response("Only the Managing Director and the auditor can export the audit log.", { status: 403 });
  const q = req.nextUrl.searchParams;
  const f: AuditFilter = { from: q.get("from"), to: q.get("to"), who: q.get("who"), department: q.get("department"), group: q.get("group"), person: q.get("person"), text: q.get("text") };
  const where = await auditWhere(f);
  const rows = await db.event.findMany({ where, orderBy: { at: "desc" }, take: 50_000, select: { at: true, type: true, detail: true, department: true, actorRole: true, actorSystem: true, actor: { select: { displayName: true } } } });
  const filterWords = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(", ") || "no filter";
  await db.event.create({ data: { type: "audit.exported", actorUserId: session.userId, actorRole: session.activeRole, department: "administration", detail: `Downloaded ${rows.length} audit log entries (${filterWords}).` } });
  const lines = [
    ["When (UTC)", "Who", "Role", "Department", "What", "Type", "Detail"].map(csvField).join(","),
    ...rows.map((r) => [r.at.toISOString(), r.actor?.displayName ?? r.actorSystem ?? "Portal", r.actorRole ?? "", r.department, typeWords(r.type), r.type, r.detail ?? ""].map(csvField).join(",")),
  ];
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leon-audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
