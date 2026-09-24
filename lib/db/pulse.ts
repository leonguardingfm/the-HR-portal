/**
 * The pulse: what an open screen asks every few seconds to stay current.
 *
 * Two answers. A version — which moves whenever anything is written, because
 * every write in the platform writes to the event log in the same transaction
 * — so a screen reloads its data the moment something changes, not on a timer.
 * And the alarms that belong to the person looking: every open alert on
 * Control's list for Control, and the officer's own for an officer.
 *
 * An officer's version moves only with their own shifts, so four hundred
 * phones are not woken by each other's check calls.
 */

import { alertKind, alertSeverity, isAlarm, openHref, ALERT_KIND_SPECS } from "@/lib/core/alerts";
import { mondayOf, ukDate } from "@/lib/core/rota";
import type { Role, Severity } from "@/lib/types";
import { db } from "./client";

export interface PulseAlert {
  id: string;
  title: string;
  severity: Severity;
  href: string;
  at: string;
  /** For a shift nobody is on: when it starts, so the bar can count down. */
  startsAt: string | null;
  /** Who in Control has taken it, if anyone. */
  takenBy: string | null;
}

export interface Pulse {
  v: string;
  alerts: PulseAlert[];
}

/** The roles that watch the operation live, and hear its alarms. */
export const WATCHES_LIVE: Role[] = ["control", "operations_manager"];

export async function getPulse(session: { userId: string; personId: string; activeRole: Role }): Promise<Pulse> {
  const officer = session.activeRole === "officer";
  const watches = WATCHES_LIVE.includes(session.activeRole);

  const [latest, items] = await Promise.all([
    officer ? latestForOfficer(session.personId) : db.event.findFirst({ orderBy: { at: "desc" }, select: { id: true, at: true } }),
    officer || watches
      ? db.workItem.findMany({
          where: officer ? { ownerUserId: session.userId, ownerRole: null, state: "open" } : { ownerRole: "control", state: "open", slaDays: 0 },
          orderBy: { createdAt: "desc" },
          take: 60,
          select: {
            id: true, title: true, slaDays: true, createdAt: true, ownerRole: true, ownerUserId: true,
            personId: true, assignmentId: true, coverNeedId: true, openShiftId: true, incidentId: true,
            owner: { select: { displayName: true } },
            coverNeed: { select: { startsAt: true, postId: true } },
            openShift: { select: { startsAt: true, postId: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const alerts = items
    .filter((w) => officer || isAlarm(w))
    .map((w): PulseAlert => {
      const shift = w.coverNeed ?? w.openShift;
      return {
        id: w.id,
        title: w.title,
        severity: alertSeverity(w),
        href: officer
          ? "/me"
          : openHref(w, { rotaHref: shift ? `/scheduling?week=${mondayOf(ukDate(shift.startsAt))}&post=${shift.postId}&day=${ukDate(shift.startsAt)}` : null }),
        at: w.createdAt.toISOString(),
        startsAt: shift ? shift.startsAt.toISOString() : null,
        takenBy: w.ownerUserId && w.ownerRole ? w.owner?.displayName ?? null : null,
      };
    });

  // The version: the latest write that concerns this person, and the alerts
  // themselves — so taking or closing one moves it too.
  const v = `${latest ? `${latest.id}.${latest.at.getTime()}` : "0"}|${alerts.map((a) => `${a.id}${a.takenBy ? "*" : ""}`).join(",")}`;
  return { v, alerts };
}

async function latestForOfficer(personId: string) {
  const since = new Date(Date.now() - 8 * 86_400_000);
  const theirs = await db.assignment.findMany({
    where: { personId, startsAt: { gte: since } },
    select: { id: true },
  });
  return db.event.findFirst({
    where: { OR: [{ personId }, { assignmentId: { in: theirs.map((a) => a.id) } }] },
    orderBy: { at: "desc" },
    select: { id: true, at: true },
  });
}

/** How many alerts there are of the kinds a bar counts separately. */
export function alertCounts(alerts: PulseAlert[]) {
  const uncovered = alerts.filter((a) => alertKind(a.title) === "uncovered");
  return {
    total: alerts.length,
    uncovered: uncovered.length,
    critical: alerts.filter((a) => a.severity === "critical").length,
    nextUncovered: uncovered.filter((a) => a.startsAt).sort((a, b) => a.startsAt!.localeCompare(b.startsAt!))[0] ?? null,
    prefix: (a: PulseAlert) => ALERT_KIND_SPECS[alertKind(a.title)].prefix,
  };
}
