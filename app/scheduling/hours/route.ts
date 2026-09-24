import { type NextRequest } from "next/server";
import { canAccessPath } from "@/components/layout/nav";
import { getSession } from "@/lib/auth/server";
import { addDays, dayLabel, isDate, ukDate, ukInstant, ukTime } from "@/lib/core/rota";
import { db } from "@/lib/db/client";

/**
 * Hours for payroll, as a spreadsheet: every shift on the rota between two
 * dates, what was scheduled, when the officer booked on, and the hours from
 * then to the end (Control, 25 September 2026).
 *
 * Until book-off is recorded, a shift runs to its scheduled end; the column
 * says so. The download is logged, because payroll references leave the
 * platform in it.
 */
const MAX_DAYS = 62;

const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quoted when needed; a leading = + - @ is neutralised so a spreadsheet never runs it.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Sign in first.", { status: 401 });
  if (!canAccessPath(session.activeRole, "/scheduling")) return new Response("Your role does not export hours.", { status: 403 });
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!isDate(from) || !isDate(to) || to < from) return new Response("Give a from and to date, YYYY-MM-DD.", { status: 400 });
  if (addDays(from, MAX_DAYS) < to) return new Response(`Up to ${MAX_DAYS} days at a time.`, { status: 400 });

  const rows = await db.assignment.findMany({
    where: { state: { notIn: ["draft", "cancelled"] }, startsAt: { gte: ukInstant(from, "00:00"), lt: ukInstant(addDays(to, 1), "00:00") } },
    orderBy: [{ startsAt: "asc" }],
    include: {
      person: { select: { fullName: true, payrollRef: true, employment: { select: { pin: true } } } },
      post: { include: { site: { include: { client: true } } } },
      bookOn: true,
      bookOff: true,
      _count: { select: { checkCalls: true } },
      amendments: { select: { id: true } },
    },
  });

  const header = ["Date", "Day", "Officer", "PIN", "Payroll ref", "Client", "Site", "Post", "Scheduled start", "Scheduled end", "Scheduled hours", "Booked on", "Minutes late", "Ended", "Hours worked", "Check calls", "Changed after publishing", "Note"];
  const lines = rows.map((a) => {
    const scheduled = (a.endsAt.getTime() - a.startsAt.getTime()) / 3_600_000;
    const end = a.bookOff?.at ?? a.endsAt;
    const worked = a.bookOn ? Math.max(0, (end.getTime() - Math.max(a.bookOn.at.getTime(), a.startsAt.getTime())) / 3_600_000) : 0;
    const late = a.bookOn ? Math.max(0, Math.round((a.bookOn.at.getTime() - a.startsAt.getTime()) / 60_000)) : null;
    return [
      ukDate(a.startsAt),
      dayLabel(ukDate(a.startsAt)).slice(0, 3),
      a.person.fullName,
      a.person.employment?.pin ?? "",
      a.person.payrollRef ?? "",
      a.post.site.client.name,
      a.post.site.name,
      a.post.name,
      ukTime(a.startsAt),
      ukTime(a.endsAt),
      scheduled.toFixed(2),
      a.bookOn ? ukTime(a.bookOn.at) : "",
      late ?? "",
      a.bookOff ? `${ukTime(a.bookOff.at)} (booked off)` : `${ukTime(a.endsAt)} (scheduled end)`,
      worked.toFixed(2),
      a._count.checkCalls,
      a.amendments.length ? "yes" : "",
      !a.bookOn ? (a.endsAt > new Date() ? "Not started or not booked on yet" : "No book-on recorded — check before paying") : "",
    ]
      .map(cell)
      .join(",");
  });

  await db.event.create({
    data: {
      type: "rota.hours_exported",
      actorUserId: session.userId,
      actorRole: session.activeRole,
      department: "control",
      detail: `Hours exported for payroll, ${dayLabel(from)} to ${dayLabel(to)}: ${rows.length} shift${rows.length === 1 ? "" : "s"}.`,
    },
  });

  return new Response(`﻿${[header.map(cell).join(","), ...lines].join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hours-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
