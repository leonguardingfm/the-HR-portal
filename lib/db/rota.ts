/**
 * The rota week — everything the builder needs to draw one Monday-to-Sunday
 * and to say, for any post and any officer, whether asking makes sense.
 *
 * The officer side is sent whole (their deployability inputs and their shifts
 * around the week) so the page can answer "can Wesley do Tuesday and Wednesday
 * nights?" as the boxes are ticked. The server asks the same questions again
 * when the answer is recorded; the page is only ever a preview.
 */

import type { Prisma } from "@prisma/client";
import type { DeployabilityInput } from "@/lib/core/deployability";
import {
  DEFAULT_WEEKLY_HOURS,
  KNOWS_POST_DAYS,
  addDays,
  hoursProblem,
  restProblem,
  parsePattern,
  ukDate,
  ukInstant,
  ukTime,
  weekDates,
  type AskAnswer,
  type AskChannel,
  type Leave,
  type OffReason,
  clashWith,
  leaveProblem,
  type Pattern,
} from "@/lib/core/rota";
import { db } from "./client";
import { getDeployabilityInputs, shiftDeployability } from "./queries";

export interface RotaPost {
  id: string;
  siteId: string;
  name: string;
  siteName: string;
  clientName: string;
  pattern: string | null;
  parsed: Pattern | null;
  requiresSiaLicence: boolean;
  loneWorking: boolean;
  regular: { id: string; name: string } | null;
  /** Officers allocated to this post through a client requirement. */
  allocated: { personId: string; reference: string }[];
}

export interface RotaShift {
  id: string;
  postId: string;
  personId: string;
  personName: string;
  /** UK date the shift starts on — the column it sits in. */
  date: string;
  start: string;
  end: string;
  startsAt: string;
  endsAt: string;
  state: "draft" | "published" | "amended" | "completed" | "cancelled";
  /** Drafts only: whether the deployability check would let it through. */
  check: { allowed: boolean; blockers: string[]; warnings: string[] } | null;
  /** Changed after it was published. */
  amended: boolean;
  bookedOn: boolean;
  /** The officer came off this shift. */
  cameOff: { reason: OffReason; note: string | null; at: string } | null;
  /** This shift covers for an officer who came off. */
  coverFor: { name: string; reason: OffReason } | null;
}

export interface RotaCoverNeed {
  id: string;
  postId: string;
  postName: string;
  siteName: string;
  /** UK date the cover starts on — the column it sits in. */
  date: string;
  start: string;
  end: string;
  startsAt: string;
  endsAt: string;
  reason: OffReason;
  note: string | null;
  fromPersonId: string;
  fromName: string;
  raisedAt: string;
  raisedBy: string;
  status: "open" | "covered" | "closed";
  coverName: string | null;
  closedReason: string | null;
}

/** A shift on the rota with nobody on it yet. */
export interface RotaOpenShift {
  id: string;
  postId: string;
  /** UK date it starts on — the column it sits in. */
  date: string;
  start: string;
  end: string;
  startsAt: string;
  endsAt: string;
  /** Officers who have offered for it in their portal, still waiting for Control. */
  offeredBy: string[];
}

export interface RotaOfficer {
  id: string;
  name: string;
  pin: string | null;
  team: string | null;
  /** Their agreed hours: the most the rota may give them in a week. */
  weeklyHours: number;
  input: DeployabilityInput;
  /** Every live shift they hold from two days before the week to two after. */
  busy: { startsAt: string; endsAt: string; label: string }[];
  /** postId → shifts on it in the four weeks before this one. */
  shiftsHere: Record<string, number>;
  /** Leave across the span: approved is unavailable, pending is a warning. */
  leave: { startsAt: string; endsAt: string; approved: boolean }[];
  /** Sites they are kept off: the rota refuses them there. */
  excludedSites: string[];
  /** What they said in their portal about each day of the span. */
  said: Record<string, "available" | "unavailable">;
}

export interface RotaAsk {
  id: string;
  personId: string;
  personName: string;
  postId: string;
  postName: string;
  siteName: string;
  date: string;
  start: string;
  end: string;
  askedAt: string;
  askedBy: string;
  channel: AskChannel | "portal";
  answer: AskAnswer;
  note: string | null;
  coverNeedId: string | null;
}

export interface RotaChange {
  id: string;
  postName: string;
  siteName: string;
  change: string;
  reason: string;
  at: string;
  by: string;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The rota for one week, or several from the same Monday — a month is planned in one go. */
export async function getRotaWeek(monday: string, weeks = 1) {
  const days = Array.from({ length: weeks }, (_, w) => weekDates(addDays(monday, 7 * w))).flat();
  const from = ukInstant(monday, "00:00");
  const to = ukInstant(addDays(monday, 7 * weeks), "00:00");
  const around = { from: ukInstant(addDays(monday, -2), "00:00"), to: ukInstant(addDays(monday, 7 * weeks + 2), "00:00") };

  const [posts, inputs, weekShifts, nearShifts, history, allocations, asks] = await Promise.all([
    db.post.findMany({
      where: { active: true, site: { active: true, client: { active: true } } },
      include: { site: { include: { client: true } }, regularPerson: { select: { id: true, fullName: true } } },
    }),
    getDeployabilityInputs(),
    db.assignment.findMany({
      // Live shifts, and the ones an officer came off — those stay on the
      // roster, struck through, so the change is visible where it happened.
      where: { startsAt: { gte: from, lt: to }, OR: [{ state: { not: "cancelled" } }, { leftCover: { isNot: null } }] },
      orderBy: { startsAt: "asc" },
      include: {
        person: { select: { fullName: true } },
        post: { include: { site: true } },
        amendments: { orderBy: { at: "desc" } },
        bookOn: { select: { id: true } },
        leftCover: { select: { reason: true, note: true, raisedAt: true } },
        covers: { select: { reason: true, from: { select: { person: { select: { fullName: true } } } } } },
      },
    }),
    db.assignment.findMany({
      where: { state: { not: "cancelled" }, startsAt: { lt: around.to }, endsAt: { gt: around.from } },
      select: { id: true, personId: true, startsAt: true, endsAt: true, post: { select: { name: true, site: { select: { name: true } } } } },
    }),
    db.assignment.groupBy({
      by: ["personId", "postId"],
      where: { state: { not: "cancelled" }, startsAt: { gte: new Date(from.getTime() - KNOWS_POST_DAYS * 86_400_000), lt: from } },
      _count: { _all: true },
    }),
    db.requirementAllocation.findMany({
      where: { releasedAt: null, requirement: { status: { not: "cancelled" } } },
      include: { requirement: { select: { reference: true, siteId: true, post: true } } },
    }),
    db.shiftAsk.findMany({
      where: { startsAt: { gte: from, lt: to } },
      orderBy: { askedAt: "desc" },
      include: { person: { select: { fullName: true } }, post: { include: { site: true } } },
    }),
  ]);
  const [coverNeeds, openRows, leave, excluded, said] = await Promise.all([
    getCoverNeeds({ startsAt: { gte: from, lt: to } }),
    db.openShift.findMany({
      where: { startsAt: { gte: from, lt: to }, cancelledAt: null, assignmentId: null },
      orderBy: { startsAt: "asc" },
      include: { volunteers: { where: { state: "waiting" }, select: { personId: true } } },
    }),
    leaveFor([...inputs.keys()], around.from, around.to),
    exclusionsFor([...inputs.keys()]),
    availabilityFor([...inputs.keys()], days[0], days[days.length - 1]),
  ]);

  const poolIds = [...inputs.keys()];
  const userIds = new Set<string>();
  asks.forEach((a) => userIds.add(a.askedById));
  weekShifts.forEach((s) => s.amendments.forEach((m) => m.byUserId && userIds.add(m.byUserId)));
  const [people, users] = await Promise.all([
    db.person.findMany({
      where: { id: { in: poolIds } },
      select: { id: true, fullName: true, employment: { select: { pin: true, controlTeam: true, weeklyHours: true } } },
    }),
    db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, displayName: true } }),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.displayName]));

  // Posts in the order Control reads them: client, site, post.
  posts.sort(
    (a, b) =>
      a.site.client.name.localeCompare(b.site.client.name) ||
      a.site.name.localeCompare(b.site.name) ||
      a.name.localeCompare(b.name),
  );

  const rotaPosts: RotaPost[] = posts.map((p) => ({
    id: p.id,
    siteId: p.siteId,
    name: p.name,
    siteName: p.site.name,
    clientName: p.site.client.name,
    pattern: p.pattern,
    parsed: parsePattern(p.pattern),
    requiresSiaLicence: p.requiresSiaLicence,
    loneWorking: p.loneWorking,
    regular: p.regularPerson ? { id: p.regularPerson.id, name: p.regularPerson.fullName } : null,
    allocated: allocations
      .filter((a) => a.requirement.siteId === p.siteId && sameName(a.requirement.post, p.name))
      .map((a) => ({ personId: a.personId, reference: a.requirement.reference })),
  }));
  const postIds = new Set(rotaPosts.map((p) => p.id));

  const limitOf = new Map(people.map((p) => [p.id, p.employment?.weeklyHours ?? DEFAULT_WEEKLY_HOURS]));

  const shifts: RotaShift[] = weekShifts
    .filter((s) => postIds.has(s.postId))
    .map((s) => {
      const d = s.state === "draft" ? shiftDeployability(inputs, s.personId, s.post.requiresSiaLicence, s.endsAt) : null;
      // A draft over the officer's weekly hours, short of rest, or on a site
      // they are kept off is blocked like any other.
      const theirs = nearShifts.filter((n) => n.personId === s.personId && n.id !== s.id).map((n) => ({ ...n, label: `${n.post.name}, ${n.post.site.name}` }));
      const over =
        s.state === "draft"
          ? hoursProblem(theirs, [s], limitOf.get(s.personId) ?? DEFAULT_WEEKLY_HOURS) ??
            restProblem(theirs, [s]) ??
            (excluded.get(s.personId)?.has(s.post.siteId) ? `Kept off ${s.post.site.name}.` : null)
          : null;
      return {
        id: s.id,
        postId: s.postId,
        personId: s.personId,
        personName: s.person.fullName,
        date: ukDate(s.startsAt),
        start: ukTime(s.startsAt),
        end: ukTime(s.endsAt),
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        state: s.state as RotaShift["state"],
        check: d
          ? {
              allowed: d.deployable && !over,
              blockers: [...d.blockers.map((b) => b.label), ...(over ? [over] : [])],
              warnings: d.warnings.map((w) => w.label),
            }
          : null,
        amended: s.amendments.length > 0,
        bookedOn: !!s.bookOn,
        cameOff: s.leftCover
          ? { reason: s.leftCover.reason as OffReason, note: s.leftCover.note, at: s.leftCover.raisedAt.toISOString() }
          : null,
        coverFor: s.covers ? { name: s.covers.from.person.fullName, reason: s.covers.reason as OffReason } : null,
      };
    });

  const shiftsHere = new Map<string, Record<string, number>>();
  for (const h of history) {
    const m = shiftsHere.get(h.personId) ?? {};
    m[h.postId] = h._count._all;
    shiftsHere.set(h.personId, m);
  }

  const officers: RotaOfficer[] = people
    .map((p) => ({
      id: p.id,
      name: p.fullName,
      pin: p.employment?.pin ?? null,
      team: p.employment?.controlTeam ?? null,
      weeklyHours: p.employment?.weeklyHours ?? DEFAULT_WEEKLY_HOURS,
      input: inputs.get(p.id)!.input,
      busy: nearShifts
        .filter((s) => s.personId === p.id)
        .map((s) => ({
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          label: `${s.post.name}, ${s.post.site.name}`,
        })),
      shiftsHere: shiftsHere.get(p.id) ?? {},
      leave: (leave.get(p.id) ?? []).map((l) => ({ startsAt: l.startsAt.toISOString(), endsAt: l.endsAt.toISOString(), approved: l.approved })),
      excludedSites: [...(excluded.get(p.id) ?? [])],
      said: said.get(p.id) ?? {},
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rotaAsks: RotaAsk[] = asks.map((a) => ({
    id: a.id,
    personId: a.personId,
    personName: a.person.fullName,
    postId: a.postId,
    postName: a.post.name,
    siteName: a.post.site.name,
    date: ukDate(a.startsAt),
    start: ukTime(a.startsAt),
    end: ukTime(a.endsAt),
    askedAt: a.askedAt.toISOString(),
    askedBy: userName.get(a.askedById) ?? "Control",
    channel: a.channel as AskChannel | "portal",
    answer: a.answer as AskAnswer,
    note: a.note,
    coverNeedId: a.coverNeedId,
  }));

  const changes: RotaChange[] = weekShifts.flatMap((s) =>
    s.amendments.map((m) => ({
      id: m.id,
      postName: s.post.name,
      siteName: s.post.site.name,
      change: m.change,
      reason: m.reason,
      at: m.at.toISOString(),
      by: (m.byUserId && userName.get(m.byUserId)) || "Control",
    })),
  );

  return {
    monday,
    weeks,
    days,
    from: from.toISOString(),
    to: to.toISOString(),
    posts: rotaPosts,
    shifts,
    officers,
    asks: rotaAsks,
    changes,
    // Cover marked as not needed on the calendar is off the rota, like a removed open shift (26 September 2026).
    coverNeeds: coverNeeds.filter((c) => postIds.has(c.postId) && !(c.status === "closed" && c.closedReason?.startsWith("Not needed:"))),
    openShifts: openRows
      .filter((o) => postIds.has(o.postId))
      .map(
        (o): RotaOpenShift => ({
          id: o.id,
          postId: o.postId,
          date: ukDate(o.startsAt),
          start: ukTime(o.startsAt),
          end: ukTime(o.endsAt),
          startsAt: o.startsAt.toISOString(),
          endsAt: o.endsAt.toISOString(),
          offeredBy: o.volunteers.map((v) => v.personId),
        }),
      ),
  };
}

/**
 * Leave that touches a window, by person. Approved leave means they are not
 * available; a request still waiting is shown as a warning, not a block.
 * Refused and cancelled requests are not leave.
 */
export async function leaveFor(personIds: string[], from: Date, to: Date): Promise<Map<string, Leave[]>> {
  const rows = await db.holidayRequest.findMany({
    where: { personId: { in: personIds }, decision: { in: ["approved", "pending"] }, startsOn: { lt: to }, endsOn: { gt: from } },
    select: { personId: true, startsOn: true, endsOn: true, decision: true },
  });
  const out = new Map<string, Leave[]>();
  for (const r of rows) {
    out.set(r.personId, [...(out.get(r.personId) ?? []), { startsAt: r.startsOn, endsAt: r.endsOn, approved: r.decision === "approved" }]);
  }
  return out;
}

/** Cover needs, newest-starting last, with the names a person reads them by. */
async function getCoverNeeds(where: Prisma.CoverNeedWhereInput): Promise<RotaCoverNeed[]> {
  const rows = await db.coverNeed.findMany({
    where,
    orderBy: { startsAt: "asc" },
    include: {
      post: { include: { site: true } },
      from: { select: { personId: true, person: { select: { fullName: true } } } },
      cover: { select: { person: { select: { fullName: true } } } },
    },
  });
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.raisedById))] } },
    select: { id: true, displayName: true },
  });
  const userName = new Map(users.map((u) => [u.id, u.displayName]));
  return rows.map((c) => ({
    id: c.id,
    postId: c.postId,
    postName: c.post.name,
    siteName: c.post.site.name,
    date: ukDate(c.startsAt),
    start: ukTime(c.startsAt),
    end: ukTime(c.endsAt),
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    reason: c.reason as OffReason,
    note: c.note,
    fromPersonId: c.from.personId,
    fromName: c.from.person.fullName,
    raisedAt: c.raisedAt.toISOString(),
    raisedBy: userName.get(c.raisedById) ?? "Control",
    status: c.coverAssignmentId ? "covered" : c.closedAt ? "closed" : "open",
    coverName: c.cover?.person.fullName ?? null,
    closedReason: c.closedReason,
  }));
}

/** Every cover need still open, whichever week it is in: the sick-call list. */
export function getOpenCoverNeeds(now = new Date()) {
  return getCoverNeeds({ coverAssignmentId: null, closedAt: null, endsAt: { gt: now } });
}

/** The sites each officer is kept off, while the exclusion stands. */
export async function exclusionsFor(personIds: string[]): Promise<Map<string, Set<string>>> {
  const rows = await db.siteExclusion.findMany({ where: { personId: { in: personIds }, liftedAt: null }, select: { personId: true, siteId: true } });
  const out = new Map<string, Set<string>>();
  for (const r of rows) out.set(r.personId, new Set([...(out.get(r.personId) ?? []), r.siteId]));
  return out;
}

/** What each officer said in their portal about each day, from one UK date to another. */
export async function availabilityFor(personIds: string[], fromDate: string, toDate: string): Promise<Map<string, Record<string, "available" | "unavailable">>> {
  const rows = await db.availability.findMany({
    where: { personId: { in: personIds }, date: { gte: new Date(`${fromDate}T00:00:00Z`), lte: new Date(`${toDate}T00:00:00Z`) } },
    select: { personId: true, date: true, kind: true },
  });
  const out = new Map<string, Record<string, "available" | "unavailable">>();
  for (const r of rows) out.set(r.personId, { ...(out.get(r.personId) ?? {}), [r.date.toISOString().slice(0, 10)]: r.kind });
  return out;
}

/**
 * Why these shifts cannot go to this officer on this post's site because of
 * where and when they already work — weekly hours, eleven hours' rest, or a
 * site they are kept off — or null. `exclude` leaves out the shift being
 * changed or published, so it is not counted twice.
 */
export async function workingTimeProblemFor(
  personId: string,
  windows: { startsAt: Date; endsAt: Date }[],
  exclude: string[] = [],
  siteId?: string,
): Promise<string | null> {
  if (siteId) {
    const kept = await db.siteExclusion.findFirst({ where: { personId, siteId, liftedAt: null }, include: { site: { select: { name: true } } } });
    if (kept) return `They are kept off ${kept.site.name}: ${kept.reason}`;
  }
  if (windows.length === 0) return null;
  const earliest = Math.min(...windows.map((w) => w.startsAt.getTime()));
  const latest = Math.max(...windows.map((w) => w.endsAt.getTime()));
  const held = await db.assignment.findMany({
    where: { personId, state: { not: "cancelled" }, id: { notIn: exclude }, startsAt: { lt: new Date(latest + 2 * 86_400_000) }, endsAt: { gt: new Date(earliest - 2 * 86_400_000) } },
    select: { startsAt: true, endsAt: true, post: { select: { name: true, site: { select: { name: true } } } } },
  });
  return (await hoursProblemFor(personId, windows, exclude)) ?? restProblem(held.map((h) => ({ ...h, label: `${h.post.name}, ${h.post.site.name}` })), windows);
}

/**
 * Why these shifts would take one officer over their agreed weekly hours, or
 * null. `exclude` leaves out the shift being changed or published, so it is
 * not counted twice.
 */
export async function hoursProblemFor(
  personId: string,
  windows: { startsAt: Date; endsAt: Date }[],
  exclude: string[] = [],
): Promise<string | null> {
  if (windows.length === 0) return null;
  const earliest = Math.min(...windows.map((w) => w.startsAt.getTime()));
  const latest = Math.max(...windows.map((w) => w.endsAt.getTime()));
  const [employment, held] = await Promise.all([
    db.employment.findUnique({ where: { personId }, select: { weeklyHours: true } }),
    db.assignment.findMany({
      where: {
        personId,
        state: { not: "cancelled" },
        id: { notIn: exclude },
        startsAt: { lt: new Date(latest + 8 * 86_400_000) },
        endsAt: { gt: new Date(earliest - 8 * 86_400_000) },
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);
  return hoursProblem(held, windows, employment?.weeklyHours ?? DEFAULT_WEEKLY_HOURS);
}

export type RotaWeek = Awaited<ReturnType<typeof getRotaWeek>>;

/**
 * Why this officer cannot be given this shift, or null — every check the rota
 * makes: deployable for the post, not on leave, not already working then,
 * within their weekly hours, eleven hours' rest, and not kept off the site.
 * Used for an officer offering in their portal and for Control accepting.
 */
export async function whyCannotTake(
  personId: string,
  shift: { postId: string; startsAt: Date; endsAt: Date; post: { requiresSiaLicence: boolean; siteId: string } },
): Promise<string | null> {
  const inputs = await getDeployabilityInputs();
  if (!inputs.has(personId)) return "only officers on the books can take shifts.";
  const d = shiftDeployability(inputs, personId, shift.post.requiresSiaLicence, shift.endsAt);
  if (!d.deployable) return `${d.blockers[0].label}.`;
  const away = leaveProblem((await leaveFor([personId], shift.startsAt, shift.endsAt)).get(personId) ?? [], shift);
  if (away) return away;
  const theirs = await db.assignment.findMany({
    where: { personId, state: { not: "cancelled" }, startsAt: { lt: shift.endsAt }, endsAt: { gt: shift.startsAt } },
    select: { startsAt: true, endsAt: true },
  });
  if (clashWith(theirs, shift)) return "already working then.";
  return workingTimeProblemFor(personId, [shift], [], shift.post.siteId);
}
