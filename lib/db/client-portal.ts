/**
 * The client portal's view of the records (26 September 2026).
 *
 * It owns nothing: every page is a query over the sites, rota, duty checks,
 * incidents and the Performance hub — the same records Control works from, so
 * what a client sees can never drift from what happened.
 *
 * And it is fenced. Every query starts from `portalScope`, which is read from
 * the database on every request — never from the cookie or the address — and
 * holds the one client the contact belongs to and the sites they may see. A
 * client never sees another client's anything; the database refuses it too
 * (constraints §27). What is shown of officers is only what that client's
 * contract requires (E17): a name, a name and SIA number, or neither. Never a
 * phone number, a selfie, a location, a screening file, or who at Leon did
 * what.
 */

import type { OfficerIdentity, Prisma } from "@prisma/client";
import { OPS_RULES } from "@/lib/core/ops";
import { callsRequiredFor, checkCallSchedule } from "@/lib/core/duty";
import { CLOSED, clockMinutesBetween, taskRef } from "@/lib/core/hub";
import type { Role } from "@/lib/types";
import { db } from "./client";
import { officeHoursFor } from "./hub";

const MIN = 60_000;

export interface PortalScope {
  userId: string;
  name: string;
  clientId: string;
  clientName: string;
  identity: OfficerIdentity;
  sites: { id: string; name: string; address: string | null }[];
  siteIds: string[];
  /** Whether this contact sees every one of the client's sites, or a chosen few. */
  allSites: boolean;
  /** Paid extras (26 September 2026). */
  live: boolean;
  siteIssues: boolean;
}

/**
 * The sites where our officers work (26 September 2026): a site with a shift
 * on the rota in the last ninety days or the next sixty. A client may have
 * sites we do not cover; those are never offered, and never shown.
 */
export const COVERED_WINDOW = { pastDays: 90, aheadDays: 60 };
export async function coveredSiteIds(clientId: string, now = new Date()): Promise<string[]> {
  const from = new Date(now.getTime() - COVERED_WINDOW.pastDays * 86_400_000);
  const to = new Date(now.getTime() + COVERED_WINDOW.aheadDays * 86_400_000);
  const rows = await db.site.findMany({
    where: { clientId, active: true, posts: { some: { assignments: { some: { state: { not: "cancelled" }, startsAt: { lt: to }, endsAt: { gt: from } } } } } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** The contact's client and sites, from the database. Null for anyone who is not a linked, active client contact. */
export async function portalScope(session: { userId: string; activeRole: Role }): Promise<PortalScope | null> {
  if (session.activeRole !== "client") return null;
  const u = await db.user.findUnique({
    where: { id: session.userId },
    select: { displayName: true, active: true, status: true, clientId: true, client: { select: { id: true, name: true, active: true, officerIdentity: true, portalSince: true, liveSince: true, siteIssuesSince: true } }, portalSites: { select: { siteId: true } } },
  });
  // No portal unless the client pays for it: a login without it sees nothing.
  if (!u || !u.active || u.status !== "active" || !u.clientId || !u.client || !u.client.active || !u.client.portalSince) return null;
  const chosen = u.portalSites.map((s) => s.siteId);
  // Only sites we cover — and of those, the ones chosen for this contact, if any were.
  const covered = await coveredSiteIds(u.clientId);
  const visible = chosen.length ? covered.filter((id) => chosen.includes(id)) : covered;
  const sites = await db.site.findMany({
    where: { clientId: u.clientId, id: { in: visible } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, address: true },
  });
  return { userId: session.userId, name: u.displayName, clientId: u.client.id, clientName: u.client.name, identity: u.client.officerIdentity, sites, siteIds: sites.map((s) => s.id), allSites: chosen.length === 0, live: !!u.client.liveSince, siteIssues: !!u.client.siteIssuesSince };
}

// ---------------------------------------------------------------------------
// Officers: only what the contract requires
// ---------------------------------------------------------------------------

const officerSelect = {
  fullName: true,
  licences: { where: { kind: { not: "other" as const } }, orderBy: { expiresAt: "desc" as const }, take: 1, select: { number: true } },
} satisfies Prisma.PersonSelect;
type OfficerRow = Prisma.PersonGetPayload<{ select: typeof officerSelect }>;

/** "Hannah Brooks · SIA 1234…", "Hannah Brooks", or "Officer assigned" where the contract names nobody. */
export function officerLabel(identity: OfficerIdentity, p: OfficerRow): string {
  if (identity === "none") return "Officer assigned";
  const sia = p.licences[0]?.number;
  return identity === "name_and_sia" && sia ? `${p.fullName} · SIA ${sia}` : p.fullName;
}

/** A shift still on the rota for the client: published or changed, not a draft, not cancelled, not handed to cover. */
const onRota = (scope: PortalScope): Prisma.AssignmentWhereInput => ({
  post: { siteId: { in: scope.siteIds } },
  state: { in: ["published", "amended", "completed"] },
  leftCover: null,
});

const shiftInclude = {
  post: { select: { id: true, name: true, checkCalls: true, mobileSignal: true, site: { select: { id: true, name: true } } } },
  person: { select: officerSelect },
  bookOn: { select: { at: true, locationVerified: true } },
  bookOff: { select: { at: true } },
  checkCalls: { select: { at: true }, orderBy: { at: "asc" as const } },
} satisfies Prisma.AssignmentInclude;
type ShiftRow = Prisma.AssignmentGetPayload<{ include: typeof shiftInclude }>;

// ---------------------------------------------------------------------------
// Live: on duty now, and the next few hours
// ---------------------------------------------------------------------------

export type LiveTone = "good" | "info" | "warn" | "bad";
export interface LiveShift {
  id: string;
  site: string;
  siteId: string;
  post: string;
  officer: string;
  startsAt: string;
  endsAt: string;
  tone: LiveTone;
  state: string;
  detail: string | null;
  checkCalls: string | null;
}

function liveState(a: ShiftRow, now: Date): Pick<LiveShift, "tone" | "state" | "detail" | "checkCalls"> {
  const start = a.startsAt;
  const minutesLate = Math.round((now.getTime() - start.getTime()) / MIN);
  let checkCalls: string | null = null;
  if (a.bookOn) {
    const late = Math.round((a.bookOn.at.getTime() - start.getTime()) / MIN);
    const calls = callsRequiredFor(a.post.checkCalls, a.startsAt, a.endsAt);
    if (calls.required && !a.post.mobileSignal) checkCalls = "No mobile signal at this post — contact is held on your site phone.";
    else if (calls.required) {
      const s = checkCallSchedule(a.bookOn.at, a.endsAt, a.checkCalls.map((c) => c.at), now);
      const last = a.checkCalls.at(-1)?.at;
      const missed = s.slots.find((x) => x.kind === "missed");
      checkCalls = missed
        ? `Check call due at ${time(missed.dueAt)} not yet made — Control is contacting the officer.`
        : `${last ? `Last check call ${time(last)}` : "No check call due yet"}${s.nextDue ? ` · next by ${time(s.nextDue)}` : ""}`;
      if (missed) return { tone: "warn", state: `On duty since ${time(a.bookOn.at)}`, detail: late > OPS_RULES.bookOnGraceMinutes ? `Arrived ${late} min late` : a.bookOn.locationVerified ? "Confirmed at your site" : null, checkCalls };
    }
    return {
      tone: late > OPS_RULES.bookOnGraceMinutes ? "warn" : "good",
      state: `On duty since ${time(a.bookOn.at)}`,
      detail: [late > OPS_RULES.bookOnGraceMinutes ? `Arrived ${late} min late` : null, a.bookOn.locationVerified ? "Confirmed at your site" : null].filter(Boolean).join(" · ") || null,
      checkCalls,
    };
  }
  if (start > now) return { tone: "info", state: `Due at ${time(start)}`, detail: null, checkCalls: null };
  if (minutesLate <= OPS_RULES.bookOnGraceMinutes) return { tone: "info", state: `Arriving — due at ${time(start)}`, detail: null, checkCalls: null };
  if (minutesLate < OPS_RULES.bookOnNoShowMinutes) return { tone: "warn", state: `Late — not yet arrived (${minutesLate} min)`, detail: "Control is in touch with the officer.", checkCalls: null };
  return { tone: "bad", state: `Not arrived (${minutesLate} min)`, detail: "Control is arranging cover.", checkCalls: null };
}

/** Every shift on now at the client's sites, and those starting in the next three hours. */
export async function portalLive(scope: PortalScope, now = new Date()) {
  const soon = new Date(now.getTime() + 3 * 3_600_000);
  const [shifts, gaps] = await Promise.all([
    db.assignment.findMany({ where: { ...onRota(scope), startsAt: { lt: soon }, endsAt: { gt: now }, bookOff: null }, include: shiftInclude, orderBy: { startsAt: "asc" } }),
    uncovered(scope, now, soon),
  ]);
  const rows: LiveShift[] = shifts.map((a) => ({
    id: a.id,
    site: a.post.site.name,
    siteId: a.post.site.id,
    post: a.post.name,
    officer: officerLabel(scope.identity, a.person),
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    ...liveState(a, now),
  }));
  for (const g of gaps)
    rows.push({ id: g.id, site: g.site, siteId: g.siteId, post: g.post, officer: "—", startsAt: g.startsAt.toISOString(), endsAt: g.endsAt.toISOString(), tone: g.startsAt <= now ? "bad" : "warn", state: "Cover being arranged", detail: "Control is finding an officer for this shift.", checkCalls: null });
  return rows.sort((a, b) => a.site.localeCompare(b.site) || a.startsAt.localeCompare(b.startsAt));
}

/** Shifts at the client's sites with nobody on them yet: open shifts, and cover still being found. */
async function uncovered(scope: PortalScope, from: Date, to: Date) {
  const where = { post: { siteId: { in: scope.siteIds } }, startsAt: { lt: to }, endsAt: { gt: from } };
  const [open, cover] = await Promise.all([
    db.openShift.findMany({ where: { ...where, assignmentId: null, cancelledAt: null }, select: { id: true, startsAt: true, endsAt: true, post: { select: { name: true, site: { select: { id: true, name: true } } } } } }),
    db.coverNeed.findMany({ where: { ...where, coveredAt: null, closedAt: null }, select: { id: true, startsAt: true, endsAt: true, post: { select: { name: true, site: { select: { id: true, name: true } } } } } }),
  ]);
  return [...open, ...cover].map((g) => ({ id: g.id, startsAt: g.startsAt, endsAt: g.endsAt, post: g.post.name, site: g.post.site.name, siteId: g.post.site.id }));
}

// ---------------------------------------------------------------------------
// The rota ahead
// ---------------------------------------------------------------------------

export async function portalRota(scope: PortalScope, days = 14, now = new Date()) {
  const to = new Date(now.getTime() + days * 86_400_000);
  const [shifts, gaps] = await Promise.all([
    db.assignment.findMany({ where: { ...onRota(scope), endsAt: { gt: now }, startsAt: { lt: to } }, select: { id: true, startsAt: true, endsAt: true, post: { select: { name: true, site: { select: { id: true, name: true } } } }, person: { select: officerSelect } }, orderBy: { startsAt: "asc" } }),
    uncovered(scope, now, to),
  ]);
  return [
    ...shifts.map((a) => ({ id: a.id, startsAt: a.startsAt.toISOString(), endsAt: a.endsAt.toISOString(), site: a.post.site.name, siteId: a.post.site.id, post: a.post.name, officer: officerLabel(scope.identity, a.person), covered: true })),
    ...gaps.map((g) => ({ id: g.id, startsAt: g.startsAt.toISOString(), endsAt: g.endsAt.toISOString(), site: g.site, siteId: g.siteId, post: g.post, officer: "Cover being arranged", covered: false })),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.site.localeCompare(b.site));
}

// ---------------------------------------------------------------------------
// The record of each finished shift
// ---------------------------------------------------------------------------

export interface ShiftRecord {
  id: string;
  site: string;
  post: string;
  officer: string;
  startsAt: string;
  endsAt: string;
  bookedOnAt: string | null;
  minutesLate: number | null;
  atSite: boolean;
  bookedOffAt: string | null;
  calls: { required: boolean; noSignal: boolean; onTime: number; late: number; missed: number };
  incidents: number;
}

export async function portalShifts(scope: PortalScope, from: Date, to: Date, now = new Date()): Promise<ShiftRecord[]> {
  const end = to < now ? to : now;
  const shifts = await db.assignment.findMany({
    where: { ...onRota(scope), endsAt: { gt: from, lte: end } },
    include: { ...shiftInclude, incidents: { where: { severity: { in: ["notable", "serious"] } }, select: { id: true } } },
    orderBy: { startsAt: "desc" },
    take: 2000,
  });
  return shifts.map((a) => {
    const req = callsRequiredFor(a.post.checkCalls, a.startsAt, a.endsAt);
    const sched = a.bookOn && req.required && a.post.mobileSignal ? checkCallSchedule(a.bookOn.at, a.endsAt, a.checkCalls.map((c) => c.at), a.endsAt) : null;
    return {
      id: a.id,
      site: a.post.site.name,
      post: a.post.name,
      officer: officerLabel(scope.identity, a.person),
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      bookedOnAt: a.bookOn?.at.toISOString() ?? null,
      minutesLate: a.bookOn ? Math.max(0, Math.round((a.bookOn.at.getTime() - a.startsAt.getTime()) / MIN)) : null,
      atSite: !!a.bookOn?.locationVerified,
      bookedOffAt: a.bookOff?.at.toISOString() ?? null,
      calls: { required: req.required, noSignal: req.required && !a.post.mobileSignal, onTime: sched?.done ?? 0, late: sched?.late ?? 0, missed: sched ? sched.slots.filter((s) => s.kind === "missed").length : 0 },
      incidents: a.incidents.length,
    };
  });
}

// ---------------------------------------------------------------------------
// Incidents: notable and serious only
// ---------------------------------------------------------------------------

export async function portalIncidents(scope: PortalScope, from: Date) {
  const rows = await db.incident.findMany({
    where: { at: { gte: from }, severity: { in: ["notable", "serious"] }, assignment: { post: { siteId: { in: scope.siteIds } } } },
    select: { id: true, at: true, severity: true, summary: true, clientNotifiedAt: true, reviewedAt: true, assignment: { select: { post: { select: { name: true, site: { select: { name: true } } } }, person: { select: officerSelect } } } },
    orderBy: { at: "desc" },
    take: 500,
  });
  return rows.map((i) => ({
    id: i.id,
    at: i.at.toISOString(),
    severity: i.severity as "notable" | "serious",
    summary: i.summary,
    site: i.assignment!.post.site.name,
    post: i.assignment!.post.name,
    officer: officerLabel(scope.identity, i.assignment!.person),
    toldAt: i.clientNotifiedAt?.toISOString() ?? null,
    reviewed: !!i.reviewedAt,
  }));
}

// ---------------------------------------------------------------------------
// Requests: raised here, worked in the Performance hub
// ---------------------------------------------------------------------------

/** What a client is told of where their request is — no names of ours, no internal notes. */
export function requestStage(status: string, outcome: string | null): { label: string; tone: LiveTone } {
  if (status === "unassigned") return { label: "Received", tone: "info" };
  if (status === "awaiting_client") return { label: "Waiting for you", tone: "warn" };
  if (status === "awaiting_information" || status === "awaiting_officer") return { label: "In progress — waiting on information", tone: "info" };
  if (status === "completed") return { label: outcome === "unsuccessful" ? "Closed" : "Done", tone: "good" };
  if (status === "unsuccessful") return { label: "Closed — could not be done", tone: "bad" };
  if (status === "cancelled") return { label: "Cancelled", tone: "info" };
  return { label: "In progress", tone: "info" };
}

const requestWhere = (scope: PortalScope): Prisma.HubTaskWhereInput => ({
  source: "client_portal",
  clientId: scope.clientId,
  // A contact who sees a few sites sees requests about those, and ones about no site in particular.
  ...(scope.allSites ? {} : { OR: [{ siteId: null }, { siteId: { in: scope.siteIds } }] }),
});

export async function portalRequests(scope: PortalScope) {
  const rows = await db.hubTask.findMany({
    where: requestWhere(scope),
    select: { id: true, number: true, source: true, subject: true, category: true, status: true, outcome: true, receivedAt: true, completedAt: true, clientUpdate: true, clientUpdateAt: true, site: { select: { name: true } }, createdById: true },
    orderBy: { receivedAt: "desc" },
    take: 300,
  });
  const names = new Map((await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById!))] }, clientId: scope.clientId }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return rows.map((r) => ({
    id: r.id,
    ref: taskRef(r),
    subject: r.subject,
    category: r.category,
    site: r.site?.name ?? null,
    raisedBy: names.get(r.createdById!) ?? "—",
    mine: r.createdById === scope.userId,
    receivedAt: r.receivedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    open: !CLOSED.includes(r.status as never),
    stage: requestStage(r.status, r.outcome),
    update: r.clientUpdate,
    updateAt: r.clientUpdateAt?.toISOString() ?? null,
  }));
}

export async function portalRequest(scope: PortalScope, id: string) {
  const t = await db.hubTask.findFirst({
    where: { id: String(id), ...requestWhere(scope) },
    select: { id: true, number: true, source: true, subject: true, summary: true, category: true, status: true, outcome: true, receivedAt: true, acceptedAt: true, completedAt: true, clientUpdate: true, clientUpdateAt: true, site: { select: { name: true } }, createdById: true },
  });
  if (!t) return null;
  const by = await db.user.findFirst({ where: { id: t.createdById!, clientId: scope.clientId }, select: { displayName: true } });
  const timeline = [
    { at: t.receivedAt.toISOString(), text: `Received — reference ${taskRef(t)}` },
    ...(t.acceptedAt ? [{ at: t.acceptedAt.toISOString(), text: "Being dealt with" }] : []),
    ...(t.clientUpdateAt && t.clientUpdate ? [{ at: t.clientUpdateAt.toISOString(), text: t.clientUpdate }] : []),
    ...(t.completedAt ? [{ at: t.completedAt.toISOString(), text: requestStage(t.status, t.outcome).label }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return { id: t.id, ref: taskRef(t), subject: t.subject, details: t.summary, category: t.category, site: t.site?.name ?? null, raisedBy: by?.displayName ?? "—", stage: requestStage(t.status, t.outcome), open: !CLOSED.includes(t.status as never), timeline };
}

// ---------------------------------------------------------------------------
// The month in figures
// ---------------------------------------------------------------------------

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

export async function portalMonth(scope: PortalScope, from: Date, to: Date, now = new Date()) {
  const [shifts, gaps, incidents, requests] = await Promise.all([
    portalShifts(scope, from, to, now),
    db.coverNeed.count({ where: { post: { siteId: { in: scope.siteIds } }, startsAt: { gte: from, lt: to }, OR: [{ coveredAt: null, closedAt: { not: null } }, { coveredAt: null, endsAt: { lte: now } }] } }),
    db.incident.groupBy({ by: ["severity"], where: { at: { gte: from, lt: to }, severity: { in: ["notable", "serious"] }, assignment: { post: { siteId: { in: scope.siteIds } } } }, _count: true }),
    db.hubTask.findMany({ where: { ...requestWhere(scope), receivedAt: { gte: from, lt: to } }, select: { receivedAt: true, acceptedAt: true, completedAt: true, status: true, withinSla: true, mailboxId: true, department: true, mailbox: { select: { officeHoursOnly: true } } } }),
  ]);
  const hours = (a: { startsAt: string; endsAt: string }) => (new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 3_600_000;
  const delivered = shifts.filter((s) => s.bookedOnAt);
  const onTime = delivered.filter((s) => (s.minutesLate ?? 0) <= OPS_RULES.bookOnGraceMinutes);
  const withCalls = shifts.filter((s) => s.calls.required && !s.calls.noSignal && s.bookedOnAt);
  const callsDue = withCalls.reduce((n, s) => n + s.calls.onTime + s.calls.late + s.calls.missed, 0);
  const callsOnTime = withCalls.reduce((n, s) => n + s.calls.onTime, 0);
  const done = requests.filter((r) => r.completedAt);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    shifts: shifts.length,
    hoursScheduled: Math.round(shifts.reduce((n, s) => n + hours(s), 0)),
    hoursCovered: Math.round(delivered.reduce((n, s) => n + hours(s), 0)),
    shiftsUncovered: gaps + shifts.filter((s) => !s.bookedOnAt).length,
    onTimePct: pct(onTime.length, delivered.length),
    checkCallPct: pct(callsOnTime, callsDue),
    incidents: { notable: incidents.find((i) => i.severity === "notable")?._count ?? 0, serious: incidents.find((i) => i.severity === "serious")?._count ?? 0 },
    requests: {
      raised: requests.length,
      done: done.length,
      open: requests.filter((r) => !CLOSED.includes(r.status as never)).length,
      avgFirstResponseMin: avg(requests.filter((r) => r.acceptedAt).map((r) => Math.round(clockMinutesBetween(r.receivedAt, r.acceptedAt!, officeHoursFor(r))))),
      avgResolveMin: avg(done.map((r) => Math.round(clockMinutesBetween(r.receivedAt, r.completedAt!, officeHoursFor(r))))),
    },
    bySite: scope.sites.map((site) => {
      const here = shifts.filter((s) => s.site === site.name);
      const on = here.filter((s) => s.bookedOnAt);
      return { site: site.name, shifts: here.length, onTimePct: pct(on.filter((s) => (s.minutesLate ?? 0) <= OPS_RULES.bookOnGraceMinutes).length, on.length), incidents: here.reduce((n, s) => n + s.incidents, 0) };
    }),
  };
}

const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
