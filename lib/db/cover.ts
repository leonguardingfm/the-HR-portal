/**
 * Taking an officer off a shift that is on the rota — shared by the rota's
 * "Officer can't do it" and a chase-up answered "cannot attend", so both do
 * exactly the same thing: the shift comes off (or is cut short, if it has
 * started), the amendment keeps what it was, and a cover need is raised for
 * what is left (constraints §18).
 */

import { OFF_REASON_LABELS, dayLabel, offWindow, ukDate, ukTime, type OffReason } from "@/lib/core/rota";
import type { Role } from "@/lib/types";
import { db } from "./client";

export const loadLive = (id: string) =>
  db.assignment.findUnique({
    where: { id },
    include: { person: true, post: { include: { site: true } }, leftCover: { select: { id: true } } },
  });

export type LiveAssignment = NonNullable<Awaited<ReturnType<typeof loadLive>>>;

/** Why a shift cannot be changed as a published shift, or null. */
export function liveProblem(a: LiveAssignment | null): string | null {
  if (!a) return "That shift no longer exists.";
  if (a.leftCover) return `${a.person.fullName} has already come off that shift.`;
  if (a.state === "cancelled") return "That shift is already off the rota.";
  if (a.state === "draft") return "That is still a draft — nobody has been told they are on. Take it off instead.";
  return null;
}

const label = (w: { startsAt: Date; endsAt: Date }) => `${dayLabel(ukDate(w.startsAt))} ${ukTime(w.startsAt)}–${ukTime(w.endsAt)}`;

/**
 * The writes that take an officer off, to be run in the caller's transaction
 * alongside whatever else records why (a chase-up, say). Refused for a shift
 * that has already finished.
 */
export function officerOffWrites(
  a: LiveAssignment,
  reason: OffReason,
  note: string | null,
  actor: { userId: string; role: Role },
  now: Date = new Date(),
) {
  const w = offWindow(a, now);
  if (!w.ok) return { ok: false as const, reason: w.reason };
  const why = OFF_REASON_LABELS[reason];
  const change = w.started
    ? `${a.person.fullName} off at ${ukTime(w.cover.startsAt)} (${why.toLowerCase()}); the rest of the shift needs cover`
    : `${a.person.fullName} off (${why.toLowerCase()}); the shift needs cover`;
  return {
    ok: true as const,
    cover: w.cover,
    coverLabel: label(w.cover),
    writes: [
      db.assignment.update({
        where: { id: a.id },
        data: w.started ? { endsAt: w.cover.startsAt, state: "amended" } : { state: "cancelled" },
      }),
      db.assignmentAmendment.create({
        data: {
          assignmentId: a.id,
          byUserId: actor.userId,
          change,
          reason: note ?? why,
          previousPersonId: a.personId,
          previousStartsAt: a.startsAt,
          previousEndsAt: a.endsAt,
        },
      }),
      // Whatever was chasing this officer about this shift — a missed book-on, an
      // "I cannot attend" — is settled by taking them off it.
      db.workItem.updateMany({ where: { assignmentId: a.id, state: "open" }, data: { state: "done", doneAt: now } }),
      db.coverNeed.create({
        data: { postId: a.postId, startsAt: w.cover.startsAt, endsAt: w.cover.endsAt, reason, note, fromAssignmentId: a.id, raisedById: actor.userId },
      }),
      db.event.create({
        data: {
          type: "rota.officer_off",
          actorUserId: actor.userId,
          actorRole: actor.role,
          department: "control",
          assignmentId: a.id,
          detail: `${change}: ${a.post.name}, ${a.post.site.name}, ${label(w.cover)}.${note ? ` ${note}` : ""}`,
        },
      }),
    ],
  };
}
