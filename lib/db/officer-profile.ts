/**
 * One officer, for Control: who they are and how to reach them, whether they
 * can work, where they are this week and next, how reliable they have been,
 * what they have said about their availability, the sites they know and the
 * ones they are kept off (Control, 25 September 2026).
 *
 * Deployability comes from the same pool query the Officers page and the rota
 * use, so the three can never disagree about whether someone may work.
 */

import { addDays, ukDate, ukTime, dayLabel } from "@/lib/core/rota";
import { db } from "./client";
import { getOfficerPool } from "./officers";

/** How far back the record looks. */
export const RECORD_DAYS = 90;

export async function getOfficerProfile(personId: string, now = new Date()) {
  const pool = await getOfficerPool(now);
  const officer = pool.find((o) => o.personId === personId);
  const person = await db.person.findUnique({
    where: { id: personId },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      nextOfKinName: true,
      nextOfKinPhone: true,
      user: { select: { id: true, status: true, _count: { select: { pushSubscriptions: true } } } },
      employment: { select: { pin: true, state: true, startedAt: true, controlTeam: true, weeklyHours: true } },
    },
  });
  if (!person) return null;

  const since = new Date(now.getTime() - RECORD_DAYS * 86_400_000);
  const until = new Date(now.getTime() + 14 * 86_400_000);
  const today = ukDate(now);
  const [shifts, cameOff, alerts, proofs, incidents, exclusions, availability, sites, events] = await Promise.all([
    db.assignment.findMany({
      where: { personId, state: { notIn: ["draft", "cancelled"] }, startsAt: { gte: since, lt: until } },
      orderBy: { startsAt: "asc" },
      include: { post: { include: { site: true } }, bookOn: { include: { proof: true } }, _count: { select: { checkCalls: true } } },
    }),
    db.coverNeed.findMany({ where: { from: { personId }, raisedAt: { gte: since } }, select: { reason: true } }),
    db.event.groupBy({ by: ["type"], where: { personId, at: { gte: since }, type: { in: ["duty.alert.missed.control", "duty.alert.bookOn.control", "duty.running_late"] } }, _count: { _all: true } }),
    db.dutyProof.findMany({ where: { assignment: { personId }, receivedAt: { gte: since } }, select: { atSite: true, liveCamera: true } }),
    db.incident.count({ where: { reportedByPersonId: personId, at: { gte: since } } }),
    db.siteExclusion.findMany({
      where: { personId },
      orderBy: { addedAt: "desc" },
      include: { site: { include: { client: true } } },
    }),
    db.availability.findMany({
      where: { personId, date: { gte: new Date(`${today}T00:00:00Z`), lte: new Date(`${addDays(today, 27)}T00:00:00Z`) } },
      orderBy: { date: "asc" },
      select: { date: true, kind: true, note: true },
    }),
    db.assignment.groupBy({ by: ["postId"], where: { personId, state: { notIn: ["draft", "cancelled"] }, startsAt: { gte: since, lt: now } }, _count: { _all: true } }),
    db.event.findMany({ where: { personId }, orderBy: { at: "desc" }, take: 15, select: { id: true, at: true, detail: true, type: true } }),
  ]);
  const posts = await db.post.findMany({ where: { id: { in: sites.map((s) => s.postId) } }, include: { site: true } });

  const past = shifts.filter((s) => s.endsAt <= now);
  const ahead = shifts.filter((s) => s.endsAt > now);
  const bookedOn = past.filter((s) => s.bookOn);
  const onTime = bookedOn.filter((s) => s.bookOn!.at.getTime() - s.startsAt.getTime() <= 15 * 60_000);
  const count = (t: string) => alerts.find((a) => a.type === t)?._count._all ?? 0;

  const knows = new Map<string, { site: string; count: number }>();
  for (const s of sites) {
    const p = posts.find((x) => x.id === s.postId);
    if (!p) continue;
    const k = knows.get(p.siteId) ?? { site: p.site.name, count: 0 };
    k.count += s._count._all;
    knows.set(p.siteId, k);
  }

  return {
    person,
    officer,
    ahead: ahead.map((s) => ({
      id: s.id,
      when: `${dayLabel(ukDate(s.startsAt))} ${ukTime(s.startsAt)}–${ukTime(s.endsAt)}`,
      where: `${s.post.name}, ${s.post.site.name}`,
      now: s.startsAt <= now,
      bookedOn: s.bookOn ? ukTime(s.bookOn.at) : null,
      state: s.state,
    })),
    record: {
      days: RECORD_DAYS,
      worked: past.length,
      bookedOn: bookedOn.length,
      onTime: onTime.length,
      lateBookOns: count("duty.alert.bookOn.control"),
      missedCalls: count("duty.alert.missed.control"),
      runningLate: count("duty.running_late"),
      cameOff: cameOff.length,
      noShows: cameOff.filter((c) => c.reason === "no_show").length,
      selfies: proofs.length,
      selfiesAway: proofs.filter((p) => p.atSite === false).length,
      incidents,
    },
    recent: past
      .slice(-8)
      .reverse()
      .map((s) => ({
        id: s.id,
        when: `${dayLabel(ukDate(s.startsAt))} ${ukTime(s.startsAt)}–${ukTime(s.endsAt)}`,
        where: `${s.post.name}, ${s.post.site.name}`,
        bookOn: s.bookOn ? { at: ukTime(s.bookOn.at), late: Math.round((s.bookOn.at.getTime() - s.startsAt.getTime()) / 60_000), proof: s.bookOn.proof ? { code: s.bookOn.proof.code, atSite: s.bookOn.proof.atSite } : null } : null,
        calls: s._count.checkCalls,
      })),
    exclusions: exclusions.map((x) => ({
      id: x.id,
      site: `${x.site.name}, ${x.site.client.name}`,
      reason: x.reason,
      addedAt: x.addedAt.toISOString(),
      liftedAt: x.liftedAt?.toISOString() ?? null,
      liftedReason: x.liftedReason,
    })),
    availability: availability.map((a) => ({ date: a.date.toISOString().slice(0, 10), kind: a.kind, note: a.note })),
    knows: [...knows.values()].sort((a, b) => b.count - a.count),
    events: events.map((e) => ({ id: e.id, at: e.at.toISOString(), detail: e.detail ?? e.type })),
  };
}

export type OfficerProfile = NonNullable<Awaited<ReturnType<typeof getOfficerProfile>>>;
