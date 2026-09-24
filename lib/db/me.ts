/**
 * An officer's own portal: their alerts, the open shifts they could offer
 * for, and what they have said about their availability. Their duties come
 * from getMyDuties (./queries). Everything here is read by the person on the
 * session — never by anything the page sends.
 */

import { addDays, clashWith, dayLabel, ukDate, ukInstant, ukTime } from "@/lib/core/rota";
import { db } from "./client";

/** Open alerts addressed to this account — a missed book-on, an overdue check call, news from Control. */
export async function getMyAlerts(userId: string) {
  const rows = await db.workItem.findMany({
    where: { ownerUserId: userId, ownerRole: null, state: "open" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, title: true, createdAt: true },
  });
  return rows.map((r) => ({ id: r.id, title: r.title, at: r.createdAt.toISOString() }));
}

/** How far ahead open shifts are shown to officers. */
const OPEN_SHIFT_DAYS = 14;

export interface MyOpenShift {
  id: string;
  postName: string;
  siteName: string;
  date: string;
  label: string;
  startsAt: string;
  endsAt: string;
  offered: "waiting" | "declined" | null;
}

/**
 * Open shifts in the next two weeks this officer might take: not on a site
 * they are kept off, and not clashing with a shift they already have. The
 * full check — deployability, hours, rest — is made when they offer, as
 * Control's rota would make it.
 */
export async function getMyOpenShifts(personId: string, now = new Date()): Promise<MyOpenShift[]> {
  const until = new Date(now.getTime() + OPEN_SHIFT_DAYS * 86_400_000);
  const [open, mine, kept, offers] = await Promise.all([
    db.openShift.findMany({
      where: { assignmentId: null, cancelledAt: null, startsAt: { gt: now, lt: until }, post: { active: true, site: { active: true, client: { active: true } } } },
      orderBy: { startsAt: "asc" },
      include: { post: { include: { site: true } } },
      take: 200,
    }),
    db.assignment.findMany({ where: { personId, state: { not: "cancelled" }, endsAt: { gt: now }, startsAt: { lt: until } }, select: { startsAt: true, endsAt: true } }),
    db.siteExclusion.findMany({ where: { personId, liftedAt: null }, select: { siteId: true } }),
    db.shiftVolunteer.findMany({ where: { personId, state: { in: ["waiting", "declined"] } }, select: { openShiftId: true, state: true } }),
  ]);
  const keptOff = new Set(kept.map((k) => k.siteId));
  const offerOf = new Map(offers.map((o) => [o.openShiftId, o.state as "waiting" | "declined"]));
  return open
    .filter((o) => !keptOff.has(o.post.siteId) && !clashWith(mine, o))
    .map((o) => ({
      id: o.id,
      postName: o.post.name,
      siteName: o.post.site.name,
      date: ukDate(o.startsAt),
      label: `${dayLabel(ukDate(o.startsAt))} ${ukTime(o.startsAt)}–${ukTime(o.endsAt)}`,
      startsAt: o.startsAt.toISOString(),
      endsAt: o.endsAt.toISOString(),
      offered: offerOf.get(o.id) ?? null,
    }));
}

/** The next four weeks, Monday first, with what they said and where they already work. */
export async function getMyAvailability(personId: string, now = new Date()) {
  const today = ukDate(now);
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, i));
  const [rows, shifts, leave] = await Promise.all([
    db.availability.findMany({
      where: { personId, date: { gte: new Date(`${days[0]}T00:00:00Z`), lte: new Date(`${days[days.length - 1]}T00:00:00Z`) } },
      select: { date: true, kind: true },
    }),
    db.assignment.findMany({
      where: { personId, state: { notIn: ["cancelled", "draft"] }, endsAt: { gt: now }, startsAt: { lt: new Date(now.getTime() + 29 * 86_400_000) } },
      select: { startsAt: true, endsAt: true, post: { select: { name: true } } },
    }),
    db.holidayRequest.findMany({
      where: { personId, decision: { in: ["approved", "pending"] }, endsOn: { gt: now }, startsOn: { lt: new Date(now.getTime() + 29 * 86_400_000) } },
      select: { startsOn: true, endsOn: true, decision: true },
    }),
  ]);
  const leaveOn = (d: string) => {
    const at = ukInstant(d, "12:00");
    return leave.find((l) => l.startsOn <= at && at < l.endsOn)?.decision ?? null;
  };
  const said: Record<string, "available" | "unavailable"> = {};
  for (const r of rows) said[r.date.toISOString().slice(0, 10)] = r.kind;
  const shiftOn = new Map<string, string>();
  for (const s of shifts) shiftOn.set(ukDate(s.startsAt), `${s.post.name} ${ukTime(s.startsAt)}–${ukTime(s.endsAt)}`);
  return {
    said,
    days: days.map((d) => ({ date: d, label: dayLabel(d), weekday: dayLabel(d).slice(0, 3), shift: shiftOn.get(d) ?? null, leave: leaveOn(d) as "approved" | "pending" | null })),
  };
}

/** Their leave this year: what they have, what is taken and waiting, and their requests. */
export async function getMyLeave(personId: string, now = new Date()) {
  const [ent, requests] = await Promise.all([
    db.holidayEntitlement.findFirst({ where: { personId, leaveYearStart: { lte: now }, leaveYearEnd: { gt: now } } }),
    db.holidayRequest.findMany({
      where: { personId, OR: [{ endsOn: { gt: new Date(now.getTime() - 60 * 86_400_000) } }, { decision: "pending" }] },
      orderBy: { startsOn: "asc" },
      take: 12,
    }),
  ]);
  const inYear = ent ? await db.holidayRequest.findMany({ where: { personId, decision: { in: ["approved", "pending"] }, startsOn: { gte: ent.leaveYearStart, lt: ent.leaveYearEnd } }, select: { decision: true, hoursRequested: true } }) : [];
  const sum = (d: string) => inYear.filter((r) => r.decision === d).reduce((n, r) => n + r.hoursRequested, 0);
  return {
    entitlement: ent ? ent.entitlementHours + ent.carriedOverHours : null,
    taken: sum("approved"),
    waiting: sum("pending"),
    yearEnds: ent ? ukDate(new Date(ent.leaveYearEnd.getTime() - 1)) : null,
    requests: requests
      .filter((r) => r.decision !== "cancelled" || r.endsOn > now)
      .map((r) => ({ id: r.id, from: ukDate(r.startsOn), to: ukDate(new Date(r.endsOn.getTime() - 1)), hours: r.hoursRequested, decision: r.decision, note: r.note })),
  };
}

export type MyLeave = Awaited<ReturnType<typeof getMyLeave>>;

/** Control's number, which officers ring from their portal. */
export async function getControlPhone(): Promise<string | null> {
  const s = await db.setting.findUnique({ where: { key: "control.phone" } });
  return s?.value || null;
}
