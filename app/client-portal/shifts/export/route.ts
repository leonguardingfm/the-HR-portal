import { type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { csvField } from "@/lib/core/audit";
import { periodRange } from "@/lib/core/performance";
import { db } from "@/lib/db/client";
import { portalScope, portalShifts } from "@/lib/db/client-portal";

export const dynamic = "force-dynamic";

const uk = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

/** The shift record as a spreadsheet — the client's own sites only, as on screen. Recorded. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  const scope = session ? await portalScope(session) : null;
  if (!session || !scope) return new Response("Not available.", { status: 403 });
  const q = req.nextUrl.searchParams;
  const range = periodRange(["7d", "30d", "month", "lastmonth"].includes(q.get("period") ?? "") ? q.get("period")! : "7d", undefined, undefined);
  const site = scope.sites.find((s) => s.id === q.get("site")) ?? null;
  const rows = (await portalShifts(scope, range.from, range.to)).filter((r) => !site || r.site === site.name);
  const lines = [
    ["Site", "Post", "Officer", "Starts", "Ends", "Arrived", "Minutes late", "Confirmed at site", "Check calls on time", "Check calls late", "Check calls missed", "Finished", "Notable or serious incidents"].map(csvField).join(","),
    ...rows.map((r) => [r.site, r.post, r.officer, uk(r.startsAt), uk(r.endsAt), uk(r.bookedOnAt), r.minutesLate ?? "", r.atSite ? "yes" : "no", r.calls.required && !r.calls.noSignal ? r.calls.onTime : "", r.calls.required && !r.calls.noSignal ? r.calls.late : "", r.calls.required && !r.calls.noSignal ? r.calls.missed : "", uk(r.bookedOffAt), r.incidents].map(csvField).join(",")),
  ];
  await db.event.create({ data: { type: "client.shift_record_downloaded", actorUserId: session.userId, actorRole: session.activeRole, department: "account_management", detail: `${scope.name} (${scope.clientName}) downloaded their shift record: ${range.label}${site ? `, ${site.name}` : ""}, ${rows.length} shifts.` } });
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="shift-record-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" },
  });
}
