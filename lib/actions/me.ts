"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { DUTY_RULES, callsRequiredFor } from "@/lib/core/duty";
import { dayLabel, ukDate, ukTime } from "@/lib/core/rota";
import { sweepDutyChecks } from "@/lib/db/duty-sweep";
import { refused, ok, type ActionResult } from "./types";

/**
 * The officer's own duty checks, from their portal (Control, 24 September
 * 2026): confirm the shift, say they cannot make it, book on at the site, and
 * make their hourly check calls. Control monitors; the officer does.
 *
 * Every action is about the officer's OWN shift. The shift id comes from the
 * page, so it is never trusted: each action loads the shift and refuses it
 * unless it belongs to the person signed in — with the same words whether the
 * shift is someone else's or does not exist, so nothing about other officers'
 * duties can be learned by trying.
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { session: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) {
    const spec = ACTIONS[action];
    return { session, error: refused(`${spec.what} belongs to ${spec.owner}.`) };
  }
  return { session, error: null };
}

const NOT_YOURS = "That shift is not one of yours.";

/** The shift, only if it is the signed-in officer's own and still on the rota. */
async function myShift(assignmentId: string, personId: string) {
  const a = await db.assignment.findUnique({
    where: { id: String(assignmentId) },
    include: { post: { include: { site: true } }, bookOn: true, leftCover: { select: { id: true } }, person: { select: { fullName: true } } },
  });
  if (!a || a.personId !== personId) return { a: null, problem: NOT_YOURS };
  if (a.state === "draft" || a.state === "cancelled" || a.leftCover) return { a: null, problem: "That shift is no longer on the rota for you. Control will be in touch." };
  return { a, problem: null };
}

const refresh = () => {
  for (const p of ["/me", "/duty/chase-ups", "/duty/book-ons", "/duty/check-calls", "/live", "/"]) revalidatePath(p);
};

const where = (a: { post: { name: string; site: { name: string } }; startsAt: Date }) =>
  `${a.post.name}, ${a.post.site.name}, ${dayLabel(ukDate(a.startsAt))} ${ukTime(a.startsAt)}`;

/** "I'll be there." The chase-up, answered by the officer. */
export async function confirmMyShift(assignmentId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("duty.self");
  if (error || !session) return error!;
  const { a, problem } = await myShift(assignmentId, session.personId);
  if (!a) return refused(problem!);
  const now = new Date();
  if (a.startsAt <= now) return refused("The shift has started — book on instead.");

  await db.$transaction([
    db.chaseUp.create({ data: { assignmentId: a.id, at: now, byUserId: session.userId, channel: null, outcome: "confirmed", note: "Confirmed by the officer in their portal" } }),
    db.event.create({
      data: { type: "duty.chase_up_confirmed", actorUserId: session.userId, actorRole: session.activeRole, department: "control", assignmentId: a.id, personId: a.personId, detail: `${a.person.fullName} confirmed ${where(a)} in their portal.` },
    }),
  ]);
  await sweepDutyChecks();
  refresh();
  return ok(`Confirmed. Book on when you arrive — from ${ukTime(new Date(a.startsAt.getTime() - DUTY_RULES.bookOnEarliestMinutes * 60_000))}.`);
}

/** "I can't make it." Control is alerted at once; Control takes them off and finds cover. */
export async function cannotMakeIt(assignmentId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("duty.self");
  if (error || !session) return error!;
  const { a, problem } = await myShift(assignmentId, session.personId);
  if (!a) return refused(problem!);
  const now = new Date();
  if (a.endsAt <= now) return refused("That shift has finished.");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  if (note.length < 3) return refused("Tell Control why — it helps them find cover.");

  await db.$transaction([
    db.chaseUp.create({ data: { assignmentId: a.id, at: now, byUserId: session.userId, channel: null, outcome: "cannot_attend", note } }),
    db.workItem.create({
      data: { title: `Officer cannot attend: ${a.person.fullName}, ${where(a)} — “${note}”. Take them off and find cover`, assignmentId: a.id, ownerRole: "control", dueAt: now, slaDays: 0 },
    }),
    db.event.create({
      data: { type: "duty.officer_cannot_attend", actorUserId: session.userId, actorRole: session.activeRole, department: "control", assignmentId: a.id, personId: a.personId, detail: `${a.person.fullName} says they cannot attend ${where(a)}: ${note}` },
    }),
  ]);
  refresh();
  return ok("Control has been told. They will take you off the shift and find cover — you may get a call.");
}

/** "I'm at the site." The book-on, by the officer themselves. */
export async function bookMeOn(assignmentId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("duty.self");
  if (error || !session) return error!;
  const { a, problem } = await myShift(assignmentId, session.personId);
  if (!a) return refused(problem!);
  if (a.bookOn) return refused(`You booked on at ${ukTime(a.bookOn.at)}.`);
  const now = new Date();
  if (a.endsAt <= now) return refused("That shift has finished.");
  if (a.startsAt.getTime() - now.getTime() > DUTY_RULES.bookOnEarliestMinutes * 60_000) {
    return refused(`Too early — you can book on from ${ukTime(new Date(a.startsAt.getTime() - DUTY_RULES.bookOnEarliestMinutes * 60_000))}, when you are at the site.`);
  }

  await db.$transaction([
    // No recordedByUserId: nobody booked them on — they did.
    db.bookOn.create({ data: { assignmentId: a.id, at: now, channel: "app" } }),
    db.event.create({
      data: { type: "book_on.recorded", actorUserId: session.userId, actorRole: session.activeRole, department: "control", assignmentId: a.id, personId: a.personId, detail: `${a.person.fullName} booked on in their portal: ${where(a)}.` },
    }),
  ]);
  await sweepDutyChecks();
  refresh();
  const calls = callsRequiredFor(a.post.checkCalls, a.startsAt, a.endsAt);
  return ok(
    !a.post.mobileSignal
      ? "Booked on. There is no signal at this post — Control will tell the client you have arrived, and the client holds contact on the site phone."
      : calls.required
        ? `Booked on at ${ukTime(now)}. Your first check call is due by ${ukTime(new Date(now.getTime() + 60 * 60_000))}.`
        : `Booked on at ${ukTime(now)}. No check calls this shift.`,
  );
}

/** "All well" — or not, with what is wrong. The hourly check call, by the officer. */
export async function myCheckCall(assignmentId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("duty.self");
  if (error || !session) return error!;
  const { a, problem } = await myShift(assignmentId, session.personId);
  if (!a) return refused(problem!);
  if (!a.bookOn) return refused("Book on first — check calls start from your book-on.");
  const now = new Date();
  if (a.endsAt <= now) return refused("That shift has finished.");
  const allWell = String(formData.get("allWell") ?? "yes") !== "no";
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  if (!allWell && !note) return refused("Say what is wrong, so Control can help.");

  await db.$transaction([
    db.checkCall.create({ data: { assignmentId: a.id, at: now, channel: "app", allWell, note } }),
    db.event.create({
      data: {
        type: "check_call.recorded",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        assignmentId: a.id,
        personId: a.personId,
        detail: `${allWell ? "All well" : `Not all well: ${note}`} — made by ${a.person.fullName} in their portal. ${a.post.site.name} — ${a.post.name}.`,
      },
    }),
    // Not all well is something Control acts on, not just reads.
    ...(allWell
      ? []
      : [db.workItem.create({ data: { title: `Officer reports a problem: ${a.person.fullName}, ${a.post.name} at ${a.post.site.name} — “${note}”`, assignmentId: a.id, ownerRole: "control", dueAt: now, slaDays: 0 } })]),
  ]);
  await sweepDutyChecks();
  refresh();
  return ok(allWell ? `Check call made at ${ukTime(now)}. Next one due by ${ukTime(new Date(now.getTime() + 60 * 60_000))}.` : "Control has your message and will call you.");
}
