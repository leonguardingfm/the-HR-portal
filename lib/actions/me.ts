"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { ALERT_KIND_SPECS } from "@/lib/core/alerts";
import { DUTY_RULES, callsRequiredFor } from "@/lib/core/duty";
import { metres, proofNeedsAttention } from "@/lib/core/proof";
import { addDays, dayLabel, isDate, ukDate, ukTime } from "@/lib/core/rota";
import { sweepDutyChecks } from "@/lib/db/duty-sweep";
import { proofData, readProof, sitePlace, withStoredProof } from "@/lib/db/proofs";
import { whyCannotTake } from "@/lib/db/rota";
import { refused, ok, type ActionResult } from "./types";

/**
 * The officer's own duty checks, from their portal (Control, 24 September
 * 2026): confirm the shift, say they cannot make it, book on at the site, and
 * make their hourly check calls. Control monitors; the officer does.
 *
 * Book-ons and check calls carry a selfie taken through the live camera, with
 * the time, the place and a QR code stamped on it (Control, 25 September
 * 2026), so a book-on from home shows as one. And from here the officer says
 * they are running late, reports an incident, offers for an open shift and
 * says which days they are free.
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
  for (const p of ["/me", "/duty/chase-ups", "/duty/book-ons", "/duty/check-calls", "/live", "/", "/tasks"]) revalidatePath(p);
};

const where = (a: { post: { name: string; site: { name: string } }; startsAt: Date }) =>
  `${a.post.name}, ${a.post.site.name}, ${dayLabel(ukDate(a.startsAt))} ${ukTime(a.startsAt)}`;

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// ---------------------------------------------------------------------------
// Before the shift
// ---------------------------------------------------------------------------

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
  const note = text(formData, "note").slice(0, 300);
  if (note.length < 3) return refused("Tell Control why — it helps them find cover.");

  await db.$transaction([
    db.chaseUp.create({ data: { assignmentId: a.id, at: now, byUserId: session.userId, channel: null, outcome: "cannot_attend", note } }),
    db.workItem.create({
      data: { title: `${ALERT_KIND_SPECS.cannot_attend.prefix}: ${a.person.fullName}, ${where(a)} — “${note}”. Take them off and find cover`, assignmentId: a.id, ownerRole: "control", dueAt: now, slaDays: 0 },
    }),
    db.event.create({
      data: { type: "duty.officer_cannot_attend", actorUserId: session.userId, actorRole: session.activeRole, department: "control", assignmentId: a.id, personId: a.personId, detail: `${a.person.fullName} says they cannot attend ${where(a)}: ${note}` },
    }),
  ]);
  // Pushed to Control's desks now, not at the next sweep.
  await sweepDutyChecks();
  refresh();
  return ok("Control has been told. They will take you off the shift and find cover — you may get a call.");
}

/** "I'm running late." How late, so Control can judge whether to find cover. */
export async function runningLate(assignmentId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("duty.self");
  if (error || !session) return error!;
  const { a, problem } = await myShift(assignmentId, session.personId);
  if (!a) return refused(problem!);
  const now = new Date();
  if (a.bookOn) return refused("You are booked on already.");
  if (a.endsAt <= now) return refused("That shift has finished.");
  if (a.startsAt.getTime() - now.getTime() > 3 * 3_600_000) return refused("Say you are running late nearer the time — within three hours of the start.");
  // "I'll be there in 20 minutes": from now, which is how anyone says it.
  const minutes = Number(text(formData, "minutes"));
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) return refused("Choose how long until you get there.");
  const note = text(formData, "note").slice(0, 300) || null;
  const arrive = new Date(now.getTime() + minutes * 60_000);
  const late = Math.round((arrive.getTime() - a.startsAt.getTime()) / 60_000);
  if (late <= 0) return refused(`That gets you there by ${ukTime(arrive)}, before your ${ukTime(a.startsAt)} start — you are not late.`);

  await db.$transaction([
    db.runningLate.create({ data: { assignmentId: a.id, at: now, minutes: Math.max(1, Math.min(240, late)), note } }),
    db.workItem.create({
      data: {
        title: `${ALERT_KIND_SPECS.running_late.prefix}: ${a.person.fullName}, ${where(a)} — expects to arrive about ${ukTime(arrive)} (${late} min late)${note ? ` — “${note}”` : ""}`,
        assignmentId: a.id,
        ownerRole: "control",
        dueAt: now,
        slaDays: 0,
      },
    }),
    db.event.create({
      data: { type: "duty.running_late", actorUserId: session.userId, actorRole: session.activeRole, department: "control", assignmentId: a.id, personId: a.personId, detail: `${a.person.fullName} is running late for ${where(a)}: about ${ukTime(arrive)}${note ? ` — ${note}` : ""}.` },
    }),
  ]);
  await sweepDutyChecks();
  refresh();
  return ok(`Control knows you will be about ${late} minutes late (around ${ukTime(arrive)}). Book on as soon as you arrive.`);
}

// ---------------------------------------------------------------------------
// At the site: book-on and check calls, with the selfie
// ---------------------------------------------------------------------------

/**
 * A book-on or check call without a selfie: the camera would not work. It is
 * accepted, because a real officer on a real site with a broken phone camera
 * must still be able to book on — and Control is told at once to ring them.
 */
function noPhotoReason(formData: FormData): string | null {
  if (formData.get("noPhoto") !== "1") return null;
  return text(formData, "noPhotoReason").slice(0, 200) || "Camera would not work";
}

/** "I'm at the site." The book-on, by the officer themselves, with their selfie. */
export async function bookMeOn(assignmentId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
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

  const without = noPhotoReason(formData);
  const read = without ? null : await readProof(formData, sitePlace(a.post.site), now);
  if (read && "problem" in read) return refused(read.problem);
  const proof = read?.proof ?? null;
  const flag = proof ? proofNeedsAttention({ atSite: proof.atSite, distanceMetres: proof.distance, accuracyMetres: proof.fix?.accuracy ?? null, liveCamera: proof.liveCamera, hasLocation: !!proof.fix, siteHasLocation: !!sitePlace(a.post.site) }) : null;
  const evidence = proof ? proof.verdict.label : `No selfie — ${without}`;

  const write = async (storageKey: string | null) =>
    db.$transaction(async (tx) => {
      // No recordedByUserId: nobody booked them on — they did.
      const b = await tx.bookOn.create({
        data: { assignmentId: a.id, at: now, channel: "app", latitude: proof?.fix?.lat ?? null, longitude: proof?.fix?.lng ?? null, locationVerified: proof?.atSite === true },
      });
      if (proof && storageKey) await tx.dutyProof.create({ data: proofData(proof, storageKey, a.id, { bookOnId: b.id }) });
      await tx.event.create({
        data: {
          type: "book_on.recorded",
          actorUserId: session.userId,
          actorRole: session.activeRole,
          department: "control",
          assignmentId: a.id,
          personId: a.personId,
          detail: `${a.person.fullName} booked on in their portal: ${where(a)}. ${evidence}.${proof?.clockSkewMinutes ? ` Phone clock ${proof.clockSkewMinutes} min out.` : ""}`,
        },
      });
      if (flag === "away" || !proof) {
        await tx.workItem.create({
          data: {
            title: flag === "away"
              ? `${ALERT_KIND_SPECS.away_from_site.prefix}: ${a.person.fullName} booked on ${metres(proof!.distance!)} from ${a.post.site.name} — ${where(a)}. Ring them to check where they are`
              : `${ALERT_KIND_SPECS.no_photo.prefix}: ${a.person.fullName} booked on without a photo (${without}) — ${where(a)}. Ring them to confirm they are on site`,
            assignmentId: a.id,
            ownerRole: "control",
            dueAt: now,
            slaDays: 0,
          },
        });
      }
    });
  if (proof) await withStoredProof(proof, now, write);
  else await write(null);

  await sweepDutyChecks();
  refresh();
  const calls = callsRequiredFor(a.post.checkCalls, a.startsAt, a.endsAt);
  const next = !a.post.mobileSignal
    ? "There is no signal at this post — Control will tell the client you have arrived, and the client holds contact on the site phone."
    : calls.required
      ? `Your first check call is due by ${ukTime(new Date(now.getTime() + 60 * 60_000))}.`
      : "No check calls this shift.";
  return ok(`Booked on at ${ukTime(now)}. ${flag === "away" ? `Your photo was taken ${metres(proof!.distance!)} from the site — Control will ring you. ` : !proof ? "Control will ring you to confirm you are on site. " : ""}${next}`);
}

/** "All well" — or not, with what is wrong. The hourly check call, by the officer, with a selfie. */
export async function myCheckCall(assignmentId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("duty.self");
  if (error || !session) return error!;
  const { a, problem } = await myShift(assignmentId, session.personId);
  if (!a) return refused(problem!);
  if (!a.bookOn) return refused("Book on first — check calls start from your book-on.");
  const now = new Date();
  if (a.endsAt <= now) return refused("That shift has finished.");
  const allWell = text(formData, "allWell") !== "no";
  const note = text(formData, "note").slice(0, 300) || null;
  if (!allWell && !note) return refused("Say what is wrong, so Control can help.");

  // Something wrong is sent whether or not the camera works: help does not wait for a photo.
  const without = noPhotoReason(formData) ?? (!allWell && !(formData.get("photo") instanceof File) ? "Reporting a problem" : null);
  const read = without ? null : await readProof(formData, sitePlace(a.post.site), now);
  if (read && "problem" in read) return refused(read.problem);
  const proof = read?.proof ?? null;
  const flag = proof ? proofNeedsAttention({ atSite: proof.atSite, distanceMetres: proof.distance, accuracyMetres: proof.fix?.accuracy ?? null, liveCamera: proof.liveCamera, hasLocation: !!proof.fix, siteHasLocation: !!sitePlace(a.post.site) }) : null;
  const evidence = proof ? proof.verdict.label : `No selfie — ${without}`;

  const write = async (storageKey: string | null) =>
    db.$transaction(async (tx) => {
      const c = await tx.checkCall.create({ data: { assignmentId: a.id, at: now, channel: "app", allWell, note } });
      if (proof && storageKey) await tx.dutyProof.create({ data: proofData(proof, storageKey, a.id, { checkCallId: c.id }) });
      await tx.event.create({
        data: {
          type: "check_call.recorded",
          actorUserId: session.userId,
          actorRole: session.activeRole,
          department: "control",
          assignmentId: a.id,
          personId: a.personId,
          detail: `${allWell ? "All well" : `Not all well: ${note}`} — made by ${a.person.fullName} in their portal. ${a.post.site.name} — ${a.post.name}. ${evidence}.`,
        },
      });
      // Not all well is something Control acts on, not just reads.
      if (!allWell) {
        await tx.workItem.create({ data: { title: `${ALERT_KIND_SPECS.problem.prefix}: ${a.person.fullName}, ${a.post.name} at ${a.post.site.name} — “${note}”`, assignmentId: a.id, ownerRole: "control", dueAt: now, slaDays: 0 } });
      } else if (flag === "away") {
        await tx.workItem.create({
          data: { title: `${ALERT_KIND_SPECS.away_from_site.prefix}: ${a.person.fullName}'s check call was taken ${metres(proof!.distance!)} from ${a.post.site.name} — ${where(a)}. Ring them`, assignmentId: a.id, ownerRole: "control", dueAt: now, slaDays: 0 },
        });
      }
    });
  if (proof) await withStoredProof(proof, now, write);
  else await write(null);

  await sweepDutyChecks();
  refresh();
  if (!allWell) return ok("Control has your message and will call you.");
  return ok(`Check call made at ${ukTime(now)}. Next one due by ${ukTime(new Date(now.getTime() + 60 * 60_000))}.${flag === "away" ? " Your photo was taken away from the site — Control will ring you." : ""}`);
}

/** Something happened on site. Control is alerted at once and decides whether the client is told. */
export async function reportIncident(assignmentId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("duty.self");
  if (error || !session) return error!;
  const { a, problem } = await myShift(assignmentId, session.personId);
  if (!a) return refused(problem!);
  const now = new Date();
  if (a.startsAt.getTime() - now.getTime() > 60 * 60_000 || now.getTime() - a.endsAt.getTime() > 12 * 3_600_000) {
    return refused("Report an incident on the shift it happened on — during it, or up to twelve hours after.");
  }
  const severity = text(formData, "severity");
  if (!["log_only", "notable", "serious"].includes(severity)) return refused("Say how serious it is.");
  const summary = text(formData, "summary").slice(0, 1000);
  if (summary.length < 10) return refused("Say what happened — a sentence or two.");

  await db.$transaction(async (tx) => {
    const i = await tx.incident.create({
      data: { assignmentId: a.id, at: now, severity: severity as "log_only" | "notable" | "serious", summary, reportedByUserId: session.userId, reportedByPersonId: a.personId },
    });
    await tx.workItem.create({
      data: {
        title: `${ALERT_KIND_SPECS.incident.prefix}: ${a.person.fullName} at ${a.post.site.name} (${severity === "serious" ? "serious" : severity === "notable" ? "notable" : "for the log"}) — “${summary.slice(0, 140)}${summary.length > 140 ? "…" : ""}”`,
        incidentId: i.id,
        ownerRole: "control",
        dueAt: now,
        slaDays: severity === "log_only" ? 1 : 0,
      },
    });
    await tx.event.create({
      data: { type: "incident.reported", actorUserId: session.userId, actorRole: session.activeRole, department: "control", assignmentId: a.id, personId: a.personId, siteId: a.post.siteId, detail: `${a.person.fullName} reported an incident at ${a.post.site.name} (${severity}): ${summary}` },
    });
  });
  await sweepDutyChecks();
  refresh();
  return ok(severity === "serious" ? "Control has it and will call you. If anyone is in danger, ring 999 first." : "Reported. Control has it.");
}

// ---------------------------------------------------------------------------
// Ahead: availability and open shifts
// ---------------------------------------------------------------------------

/** How far ahead an officer can say which days they are free. */
const AVAILABILITY_DAYS = 56;

export async function setMyAvailability(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("duty.self");
  if (error || !session) return error!;
  const dates = formData.getAll("date").map(String).filter(isDate);
  const kind = text(formData, "kind");
  if (dates.length === 0) return refused("Choose the days.");
  if (!["available", "unavailable", "clear"].includes(kind)) return refused("Say whether you are free or not.");
  const today = ukDate(new Date());
  const last = addDays(today, AVAILABILITY_DAYS);
  if (dates.some((d) => d < today || d > last)) return refused(`You can say which days you are free from today to ${dayLabel(last)}.`);
  const note = text(formData, "note").slice(0, 200) || null;

  await db.$transaction(async (tx) => {
    const on = dates.map((d) => new Date(`${d}T00:00:00Z`));
    if (kind === "clear") await tx.availability.deleteMany({ where: { personId: session.personId, date: { in: on } } });
    else {
      for (const date of on) {
        await tx.availability.upsert({
          where: { personId_date: { personId: session.personId, date } },
          create: { personId: session.personId, date, kind: kind as "available" | "unavailable", note },
          update: { kind: kind as "available" | "unavailable", note, setAt: new Date() },
        });
      }
    }
    await tx.event.create({
      data: {
        type: "availability.set",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        personId: session.personId,
        detail: `${session.name} says they are ${kind === "clear" ? "not saying" : kind === "available" ? "free" : "not free"} on ${dates.length === 1 ? dayLabel(dates[0]) : `${dates.length} days from ${dayLabel([...dates].sort()[0])}`}${note ? ` — ${note}` : ""}.`,
      },
    });
  });
  revalidatePath("/me");
  revalidatePath("/scheduling");
  return ok(kind === "clear" ? "Cleared." : `Saved — Control will see you are ${kind === "available" ? "free" : "not free"} ${dates.length === 1 ? "that day" : "those days"}.`);
}

/**
 * "I can do this one." An offer for an open shift, which Control accepts or
 * declines. Checked now as Control would check it, so nobody offers for a
 * shift they could not be given.
 */
export async function offerForShift(openShiftId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("duty.self");
  if (error || !session) return error!;
  const o = await db.openShift.findUnique({ where: { id: String(openShiftId) }, include: { post: { include: { site: true } } } });
  const now = new Date();
  if (!o || o.cancelledAt || o.assignmentId || o.startsAt <= now || !o.post.active || !o.post.site.active) return refused("That shift has just been filled or is no longer needed.");
  const already = await db.shiftVolunteer.findUnique({ where: { openShiftId_personId: { openShiftId: o.id, personId: session.personId } } });
  if (already && already.state === "waiting") return refused("You have offered for this one already. Control will let you know.");
  if (already && already.state !== "withdrawn") return refused("Control has already decided on your offer for this shift.");

  const why = await whyCannotTake(session.personId, o);
  if (why) return refused(`You cannot work this one: ${why}`);
  const note = text(formData, "note").slice(0, 200) || null;
  const label = `${o.post.name} at ${o.post.site.name}, ${dayLabel(ukDate(o.startsAt))} ${ukTime(o.startsAt)}–${ukTime(o.endsAt)}`;

  await db.$transaction([
    already
      ? db.shiftVolunteer.update({ where: { id: already.id }, data: { state: "waiting", at: now, note, decidedAt: null, decidedById: null, decisionNote: null } })
      : db.shiftVolunteer.create({ data: { openShiftId: o.id, personId: session.personId, at: now, note } }),
    db.workItem.create({
      data: { title: `${ALERT_KIND_SPECS.volunteer.prefix}: ${session.name} — ${label}${note ? ` — “${note}”` : ""}. Accept or decline on the rota`, openShiftId: o.id, ownerRole: "control", dueAt: new Date(Math.min(o.startsAt.getTime(), now.getTime() + 86_400_000)), slaDays: 1 },
    }),
    db.event.create({
      data: { type: "rota.volunteered", actorUserId: session.userId, actorRole: session.activeRole, department: "control", personId: session.personId, detail: `${session.name} offered to work ${label} in their portal.` },
    }),
  ]);
  revalidatePath("/me");
  revalidatePath("/scheduling");
  revalidatePath("/tasks");
  return ok("Offered. Control will accept or decline — you will get an alert either way.");
}

export async function withdrawOffer(openShiftId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("duty.self");
  if (error || !session) return error!;
  const v = await db.shiftVolunteer.findUnique({ where: { openShiftId_personId: { openShiftId: String(openShiftId), personId: session.personId } } });
  if (!v || v.state !== "waiting") return refused("There is no offer of yours waiting on that shift.");
  const now = new Date();
  await db.$transaction([
    db.shiftVolunteer.update({ where: { id: v.id }, data: { state: "withdrawn", decidedAt: now } }),
    db.workItem.updateMany({ where: { openShiftId: v.openShiftId, state: "open", title: { startsWith: `${ALERT_KIND_SPECS.volunteer.prefix}: ${session.name} —` } }, data: { state: "cancelled", doneAt: now } }),
    db.event.create({ data: { type: "rota.volunteer_withdrawn", actorUserId: session.userId, actorRole: session.activeRole, department: "control", personId: session.personId, detail: `${session.name} withdrew their offer for an open shift.` } }),
  ]);
  revalidatePath("/me");
  revalidatePath("/scheduling");
  return ok("Withdrawn.");
}
