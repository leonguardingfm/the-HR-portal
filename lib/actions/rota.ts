"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import {
  ANSWER_LABELS,
  CHANNEL_LABELS,
  DAY_SHORT,
  addDays,
  askProblem,
  dayLabel,
  fromNow,
  isDate,
  isTime,
  newHoursProblem,
  ASK_CHANNELS,
  DEFAULT_WEEKLY_HOURS,
  MAX_BATCH,
  hoursOf,
  hoursProblem,
  restProblem,
  leaveProblem,
  createProblem,
  slotsFor,
  clashWith,
  planBatch,
  type ShiftTime,
  type Busy,
  type PlanItem,
  OFF_REASONS,
  shiftWindow,
  ukDate,
  ukInstant,
  ukTime,
  weekday,
  type AskAnswer,
  type AskChannel,
  type OffReason,
} from "@/lib/core/rota";
import { getDeployabilityInputs, shiftDeployability } from "@/lib/db/queries";
import { exclusionsFor, leaveFor, whyCannotTake, workingTimeProblemFor } from "@/lib/db/rota";
import { ALERT_KIND_SPECS } from "@/lib/core/alerts";
import { liveProblem, loadLive, officerOffWrites } from "@/lib/db/cover";
import { sweepDutyChecks } from "@/lib/db/duty-sweep";
import type { Role } from "@/lib/types";
import { refused, ok, type ActionResult } from "./types";

/**
 * Building the rota: asking officers, drafting what they said yes to, naming a
 * post's regular officer, and publishing the week.
 *
 * Same shape as every other write: guard, re-read, then write with the event
 * in the same transaction. The rules are lib/core/rota.ts; publishing goes
 * through the same deployability check as a single shift, and the database
 * refuses a double-booking whatever this file does (constraints.sql §2).
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { session: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) {
    const spec = ACTIONS[action];
    return {
      session,
      error: refused(
        `${spec.what} belongs to ${spec.owner}. You are working as ${session.activeRole.replace(/_/g, " ")}, so the platform refuses it.`,
      ),
    };
  }
  return { session, error: null };
}

const refresh = () => {
  revalidatePath("/scheduling");
  revalidatePath("/live");
  revalidatePath("/");
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** "Tue 29 Sep 19:00–07:00" — how a shift is named in a refusal or the log. */
function shiftLabel(w: { startsAt: Date; endsAt: Date }) {
  return `${dayLabel(ukDate(w.startsAt))} ${ukTime(w.startsAt)}–${ukTime(w.endsAt)}`;
}

/** "Tue 29, Wed 30 Sep 19:00–07:00" — several shifts with the same hours. */
function shiftsLabel(ws: { startsAt: Date; endsAt: Date }[]) {
  if (ws.length === 1) return shiftLabel(ws[0]);
  const days = ws.map((w) => {
    const date = ukDate(w.startsAt);
    return `${DAY_SHORT[weekday(date)]} ${Number(date.slice(8))}`;
  });
  const last = shiftLabel(ws[ws.length - 1]);
  return `${days.join(", ")} ${last.split(" ").slice(2).join(" ")}`;
}

const overlaps = (a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) =>
  a.startsAt < b.endsAt && b.startsAt < a.endsAt;

// ---------------------------------------------------------------------------
// Asking
// ---------------------------------------------------------------------------

/**
 * Record what an officer said when Control asked them about one or more
 * shifts on a post. A yes puts each shift on the rota as a draft, in the same
 * transaction as the record of the ask; a no or no answer is recorded too,
 * because the ring-round is the availability record.
 *
 * With a cover need, it is the ring-round after somebody came off: the shift
 * is the hours still to cover, and a yes goes on the rota published — the
 * rota changes the moment it changes, so nobody waits for a weekly publish.
 */
export async function recordAsk(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("rota.build");
  if (error || !session) return error!;

  let postId = text(formData, "postId");
  const personId = text(formData, "personId");
  const channel = text(formData, "channel");
  const answer = text(formData, "answer");
  const note = text(formData, "note").slice(0, 300) || null;
  const coverNeedId = text(formData, "coverNeedId") || null;
  const now = new Date();

  let windows: { startsAt: Date; endsAt: Date }[];
  let openShifts: string[] = [];
  let need: { id: string; fromPersonId: string } | null = null;
  if (coverNeedId) {
    const found = await db.coverNeed.findUnique({ where: { id: coverNeedId }, include: { from: { select: { personId: true } } } });
    if (!found) return refused("That cover need no longer exists.");
    if (found.coverAssignmentId || found.closedAt) return refused("That cover has already been settled. Look again.");
    if (found.from.personId === personId) return refused("That is the officer who came off.");
    need = { id: found.id, fromPersonId: found.from.personId };
    postId = found.postId;
    // Cover found late starts when it is offered; the gap before it stays visible.
    windows = [fromNow({ startsAt: found.startsAt, endsAt: found.endsAt }, now)];
  } else {
    // The rota is made first: what is asked about is open shifts on it.
    const ids = [...new Set(formData.getAll("openShiftId").map(String))];
    const open = await db.openShift.findMany({
      where: { id: { in: ids }, postId, cancelledAt: null, assignmentId: null },
      orderBy: { startsAt: "asc" },
    });
    if (ids.length && open.length < ids.length) return refused("Some of those shifts have just been filled or removed. Look again.");
    openShifts = open.map((o) => o.id);
    windows = open.map((o) => fromNow({ startsAt: o.startsAt, endsAt: o.endsAt }, now));
  }
  const problem = askProblem({ channel, answer, windows, now });
  if (problem) return refused(problem);

  const [post, inputs] = await Promise.all([
    db.post.findUnique({ where: { id: postId }, include: { site: true } }),
    getDeployabilityInputs(),
  ]);
  if (!post || !post.active) return refused("That post is no longer active.");
  const person = inputs.has(personId) ? await db.person.findUnique({ where: { id: personId } }) : null;
  if (!person) return refused("Only officers on the books can be asked onto the rota.");

  const earliest = windows[0].startsAt;
  const latest = windows[windows.length - 1].endsAt;
  let checkNote = "Passed with no warnings";

  if (answer === "yes") {
    // Deployable for every one of them, judged at the end of each shift.
    for (const w of windows) {
      const d = shiftDeployability(inputs, personId, post.requiresSiaLicence, w.endsAt);
      if (!d.deployable) {
        return refused(`${person.fullName} cannot work ${shiftLabel(w)}: ${d.blockers[0].label}. Record it as a no, or ask someone else.`);
      }
      if (d.warnings.length) checkNote = `Passed with warnings: ${d.warnings.map((x) => x.label).join("; ")}`;
    }
    const leave = (await leaveFor([personId], earliest, latest)).get(personId) ?? [];
    for (const w of windows) {
      const away = leaveProblem(leave, w);
      if (away) return refused(`${person.fullName} cannot work ${shiftLabel(w)}: ${away}`);
    }
    const [theirs, onPost, over] = await Promise.all([
      db.assignment.findMany({
        where: { personId, state: { not: "cancelled" }, startsAt: { lt: latest }, endsAt: { gt: earliest } },
        include: { post: { include: { site: true } } },
      }),
      db.assignment.findMany({
        where: { postId, state: { not: "cancelled" }, startsAt: { lt: latest }, endsAt: { gt: earliest } },
        include: { person: true },
      }),
      workingTimeProblemFor(personId, windows, [], post.siteId),
    ]);
    for (const w of windows) {
      const clash = theirs.find((s) => overlaps(s, w));
      if (clash) {
        return refused(
          `${person.fullName} is already on ${clash.post.name}, ${clash.post.site.name} ${shiftLabel(clash)}. That would be two places at once.`,
        );
      }
      const taken = onPost.find((s) => overlaps(s, w));
      if (taken) {
        return refused(
          `${post.name} is already covered ${shiftLabel(taken)} by ${taken.person.fullName}. Take that draft off first if it is changing.`,
        );
      }
    }
    if (over) return refused(`${person.fullName}: ${over} Ask someone else, or have their hours changed.`);
  }

  const summary = `Asked ${person.fullName} (${CHANNEL_LABELS[channel as AskChannel].toLowerCase()}) ${need ? "to cover" : "about"} ${post.name}, ${post.site.name}, ${shiftsLabel(windows)}: ${ANSWER_LABELS[answer as AskAnswer].toLowerCase()}.`;

  try {
    await db.$transaction(async (tx) => {
      for (const [i, w] of windows.entries()) {
        let assignmentId: string | null = null;
        if (answer === "yes") {
          // Cover, or a shift already under way, is on the rota at once: nobody
          // waits for a weekly publish while a post stands empty.
          const a = await tx.assignment.create({
            data:
              need || w.startsAt <= now
                ? { personId, postId, startsAt: w.startsAt, endsAt: w.endsAt, state: "published", publishedAt: now, publishedById: session.userId, publishCheckNote: checkNote }
                : { personId, postId, startsAt: w.startsAt, endsAt: w.endsAt, state: "draft" },
          });
          assignmentId = a.id;
          if (need) {
            await tx.coverNeed.update({ where: { id: need.id }, data: { coverAssignmentId: a.id, coveredAt: now } });
          } else if (openShifts[i]) {
            await tx.openShift.update({ where: { id: openShifts[i] }, data: { assignmentId: a.id } });
          }
        }
        await tx.shiftAsk.create({
          data: {
            personId,
            postId,
            startsAt: w.startsAt,
            endsAt: w.endsAt,
            askedAt: now,
            askedById: session.userId,
            channel: channel as AskChannel,
            answer: answer as AskAnswer,
            note,
            assignmentId,
            coverNeedId: need?.id ?? null,
          },
        });
      }
      await tx.event.create({
        data: {
          type: answer !== "yes" ? "rota.asked" : need ? "rota.cover_found" : windows.some((w) => w.startsAt <= now) ? "rota.shift_now" : "rota.shift_drafted",
          actorUserId: session.userId,
          actorRole: session.activeRole,
          department: "control",
          personId,
          detail:
            answer !== "yes"
              ? summary
              : need || windows.some((w) => w.startsAt <= now)
                ? `${summary} On the rota ${need ? "as cover" : "from now"}, published at once after the deployability check passed.`
                : `${summary} On the rota as ${windows.length === 1 ? "a draft" : `${windows.length} drafts`}.`,
        },
      });
    });
  } catch (e) {
    if (String(e).includes("assignment_no_overlap")) {
      return refused(`${person.fullName} has just been put on another shift at that time. Nothing was recorded — look again and re-ask.`);
    }
    throw e;
  }

  refresh();
  if (answer === "yes") {
    const live = windows.filter((w) => w.startsAt <= now).length;
    if (need) return ok(`${person.fullName} is covering ${shiftLabel(windows[0])}, published now. Tell them, and make sure they have the site details.`);
    if (live === windows.length) return ok(`${person.fullName} is on ${shiftsLabel(windows)}, published now — the shift is under way. Tell them, and make sure they have the site details.`);
    if (live > 0) return ok(`${person.fullName} is on ${shiftsLabel(windows)}: the one under way is published now, the rest are drafts.`);
    return ok(`${person.fullName} is on ${shiftsLabel(windows)} as ${windows.length === 1 ? "a draft" : `${windows.length} drafts`}. Publish the week when it is ready.`);
  }
  return ok(
    answer === "no"
      ? `Recorded: ${person.fullName} said no. Ask the next officer.`
      : `Recorded: no answer from ${person.fullName}. Try again later, or ask the next officer.`,
  );
}

/** Take a draft off the rota. Only a draft: a published shift is a change, with a reason. */
export async function takeOffDraft(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("rota.build");
  if (error || !session) return error!;

  const assignment = await db.assignment.findUnique({
    where: { id: text(formData, "assignmentId") },
    include: { person: true, post: { include: { site: true } } },
  });
  if (!assignment) return refused("That shift no longer exists.");
  if (assignment.state !== "draft") {
    return refused("That shift is published. Changing a published shift is not built yet — it needs the reason and the officer told.");
  }
  const reason = text(formData, "reason").slice(0, 300);

  await db.$transaction([
    // The shift it filled is open again, ready for someone else.
    db.openShift.updateMany({ where: { assignmentId: assignment.id }, data: { assignmentId: null } }),
    db.assignment.update({ where: { id: assignment.id }, data: { state: "cancelled" } }),
    db.event.create({
      data: {
        type: "rota.draft_removed",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        assignmentId: assignment.id,
        detail: `Draft taken off: ${assignment.person.fullName} on ${assignment.post.name}, ${assignment.post.site.name}, ${shiftLabel(assignment)}.${reason ? ` ${reason}` : ""}`,
      },
    }),
  ]);

  refresh();
  return ok(`Taken off. If ${assignment.person.fullName} was told they were on, tell them they are not.`);
}

/** Name, change or clear the officer who normally works a post. */
export async function setRegularOfficer(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("rota.build");
  if (error || !session) return error!;

  const post = await db.post.findUnique({
    where: { id: text(formData, "postId") },
    include: { site: true, regularPerson: true },
  });
  if (!post || !post.active) return refused("That post is no longer active.");

  const personId = text(formData, "personId") || null;
  if (personId === post.regularPersonId) return refused("That is already how it stands.");
  let name: string | null = null;
  if (personId) {
    const inputs = await getDeployabilityInputs();
    const person = inputs.has(personId) ? await db.person.findUnique({ where: { id: personId } }) : null;
    if (!person) return refused("Only an officer on the books can be a post's regular officer.");
    name = person.fullName;
  }

  await db.$transaction([
    db.post.update({ where: { id: post.id }, data: { regularPersonId: personId } }),
    db.event.create({
      data: {
        type: "post.regular_officer_set",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        siteId: post.siteId,
        personId,
        detail: name
          ? `${name} is now the regular officer on ${post.name}, ${post.site.name}${post.regularPerson ? ` (was ${post.regularPerson.fullName})` : ""}.`
          : `${post.name}, ${post.site.name} no longer has a regular officer${post.regularPerson ? ` (was ${post.regularPerson.fullName})` : ""}.`,
      },
    }),
  ]);

  refresh();
  return ok(name ? `${name} is the regular officer. They will be suggested first — and still asked.` : "Cleared. The post is covered from the pool.");
}

// ---------------------------------------------------------------------------
// Changing the rota once it is published
// ---------------------------------------------------------------------------
//
// Control changes the rota the moment it changes (24 September 2026). Each
// change keeps the shift as it was, who changed it and why, as an amendment —
// nothing is overwritten.

/**
 * An officer cannot work a shift after all: sick, changed their mind, or did
 * not turn up. They come off at once, and what is left becomes a cover need
 * for the ring-round — the whole shift if it has not started, the rest of it
 * if it has.
 */
export async function officerOff(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("rota.change");
  if (error || !session) return error!;

  const a = await loadLive(text(formData, "assignmentId"));
  const problem = liveProblem(a);
  if (problem || !a) return refused(problem!);

  const reason = text(formData, "reason") as OffReason;
  if (!OFF_REASONS.includes(reason)) return refused("Choose why they are coming off.");
  const note = text(formData, "note").slice(0, 300) || null;
  if (reason === "other" && !note) return refused("Say what happened — “other” needs a note.");

  const off = officerOffWrites(a, reason, note, { userId: session.userId, role: session.activeRole });
  if (!off.ok) return refused(off.reason);
  await db.$transaction(off.writes);

  refresh();
  return ok(`${a.person.fullName} is off. ${off.coverLabel} now needs cover — ring round below.`);
}

/** New hours for a published shift: the client wants an earlier start, or the officer stays on. */
export async function changeHours(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("rota.change");
  if (error || !session) return error!;

  const a = await loadLive(text(formData, "assignmentId"));
  const problem = liveProblem(a);
  if (problem || !a) return refused(problem!);

  const start = text(formData, "start");
  const end = text(formData, "end");
  if (!isTime(start) || !isTime(end)) return refused("Give the new start and end times.");
  const reason = text(formData, "reason").slice(0, 300);
  if (reason.length < 3) return refused("Say why the hours are changing.");
  const next = shiftWindow(ukDate(a.startsAt), start, end);
  const hoursProblem = newHoursProblem(a, next);
  if (hoursProblem) return refused(hoursProblem);

  const d = shiftDeployability(await getDeployabilityInputs(), a.personId, a.post.requiresSiaLicence, next.endsAt);
  if (!d.deployable) return refused(`${a.person.fullName} cannot work to ${shiftLabel(next)}: ${d.blockers[0].label}.`);
  const [clash, taken, over] = await Promise.all([
    db.assignment.findFirst({
      where: { personId: a.personId, id: { not: a.id }, state: { not: "cancelled" }, startsAt: { lt: next.endsAt }, endsAt: { gt: next.startsAt } },
      include: { post: { include: { site: true } } },
    }),
    db.assignment.findFirst({
      where: { postId: a.postId, id: { not: a.id }, state: { not: "cancelled" }, startsAt: { lt: next.endsAt }, endsAt: { gt: next.startsAt } },
      include: { person: true },
    }),
    workingTimeProblemFor(a.personId, [next], [a.id]),
  ]);
  if (clash) return refused(`${a.person.fullName} is on ${clash.post.name}, ${clash.post.site.name} ${shiftLabel(clash)}, which the new hours would overlap.`);
  if (taken) return refused(`${taken.person.fullName} is on ${a.post.name} ${shiftLabel(taken)}, which the new hours would overlap.`);
  if (over) return refused(`${a.person.fullName}: ${over}`);

  const change = `Hours changed: ${ukTime(a.startsAt)}–${ukTime(a.endsAt)} → ${start}–${end}`;
  try {
    await db.$transaction([
      db.assignment.update({ where: { id: a.id }, data: { startsAt: next.startsAt, endsAt: next.endsAt, state: "amended" } }),
      // The shift on the rota moves with it, so the two never disagree.
      db.openShift.updateMany({ where: { assignmentId: a.id }, data: { startsAt: next.startsAt, endsAt: next.endsAt } }),
      db.assignmentAmendment.create({
        data: { assignmentId: a.id, byUserId: session.userId, change, reason, previousStartsAt: a.startsAt, previousEndsAt: a.endsAt },
      }),
      db.event.create({
        data: {
          type: "assignment.amended",
          actorUserId: session.userId,
          actorRole: session.activeRole,
          department: "control",
          assignmentId: a.id,
          detail: `${a.person.fullName}, ${a.post.name}: ${change}. ${reason}`,
        },
      }),
    ]);
  } catch (e) {
    if (String(e).includes("assignment_no_overlap")) return refused(`${a.person.fullName} has just been put on another shift that the new hours overlap.`);
    throw e;
  }

  refresh();
  return ok(`Changed to ${start}–${end}. Tell ${a.person.fullName}.`);
}

/** The shift is not needed after all — the client cancelled. Nobody needs to cover it. */
export async function cancelShift(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("rota.change");
  if (error || !session) return error!;

  const a = await loadLive(text(formData, "assignmentId"));
  const problem = liveProblem(a);
  if (problem || !a) return refused(problem!);
  if (a.startsAt <= new Date()) return refused("The shift has started. If the officer is leaving, take them off instead.");
  const reason = text(formData, "reason").slice(0, 300);
  if (reason.length < 3) return refused("Say why the shift is not needed.");

  await db.$transaction([
    db.openShift.updateMany({ where: { assignmentId: a.id }, data: { assignmentId: null, cancelledAt: new Date(), cancelledReason: reason } }),
    db.assignment.update({ where: { id: a.id }, data: { state: "cancelled" } }),
    db.assignmentAmendment.create({
      data: { assignmentId: a.id, byUserId: session.userId, change: "Shift cancelled — not needed", reason, previousPersonId: a.personId },
    }),
    db.event.create({
      data: {
        type: "assignment.cancelled",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        assignmentId: a.id,
        detail: `${a.post.name}, ${a.post.site.name}, ${shiftLabel(a)} cancelled: ${reason}`,
      },
    }),
  ]);

  refresh();
  return ok(`Cancelled. Tell ${a.person.fullName} they are not needed.`);
}

/** Nobody can be found, and somebody decides: the post goes uncovered, and the client is told. */
export async function leaveUncovered(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("rota.change");
  if (error || !session) return error!;

  const need = await db.coverNeed.findUnique({ where: { id: text(formData, "coverNeedId") }, include: { post: { include: { site: true } } } });
  if (!need) return refused("That cover need no longer exists.");
  if (need.coverAssignmentId || need.closedAt) return refused("That cover has already been settled.");
  const reason = text(formData, "reason").slice(0, 300);
  if (reason.length < 3) return refused("Say why it is being left, and whether the client has been told.");

  await db.$transaction([
    db.coverNeed.update({ where: { id: need.id }, data: { closedAt: new Date(), closedReason: reason, closedById: session.userId } }),
    db.event.create({
      data: {
        type: "rota.cover_left_uncovered",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        detail: `${need.post.name}, ${need.post.site.name}, ${shiftLabel(need)} left uncovered: ${reason}`,
      },
    }),
  ]);

  refresh();
  return ok("Recorded as left uncovered, with the reason.");
}

/** An officer's agreed weekly hours: the most the rota may give them. */
export async function setWeeklyHours(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("officer.hours");
  if (error || !session) return error!;

  const personId = text(formData, "personId");
  const hours = Number(text(formData, "weeklyHours"));
  if (!Number.isInteger(hours) || hours < 1 || hours > 96) return refused("Weekly hours are a whole number from 1 to 96.");
  const employment = await db.employment.findUnique({ where: { personId }, include: { person: true } });
  if (!employment || employment.state === "ended") return refused("Only a current officer has working hours.");
  if (employment.weeklyHours === hours) return refused(`${employment.person.fullName} is already on ${hours}h.`);

  await db.$transaction([
    db.employment.update({ where: { personId }, data: { weeklyHours: hours } }),
    db.event.create({
      data: {
        type: "officer.weekly_hours_set",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        personId,
        detail: `${employment.person.fullName}'s weekly hours set to ${hours}h (was ${employment.weeklyHours}h).`,
      },
    }),
  ]);

  refresh();
  revalidatePath("/officers");
  return ok(`${employment.person.fullName} is on ${hours}h a week. Shifts over that are refused.`);
}

// ---------------------------------------------------------------------------
// Publishing the week
// ---------------------------------------------------------------------------

/** "A, B, C and 12 more" — a long list of refusals, kept readable. */
function listOf(items: string[], shown = 5): string {
  return items.length <= shown ? items.join("; ") : `${items.slice(0, shown).join("; ")}; and ${items.length - shown} more`;
}

/**
 * Publish drafts: each through the same deployability check as publishing one
 * on its own, and the weekly hours limit. A blocked officer stays as a draft
 * and does not hold up the rest. The checks read everything once, so four
 * weeks of a large operation publish in one go.
 */
async function publishDrafts(
  session: { userId: string; activeRole: Role },
  where: Prisma.AssignmentWhereInput,
  context: string,
): Promise<ActionResult> {
  const now = new Date();
  const [drafts, inputs] = await Promise.all([
    db.assignment.findMany({
      where: { ...where, state: "draft", endsAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      include: { person: true, post: { include: { site: true } } },
    }),
    getDeployabilityInputs(),
  ]);
  if (drafts.length === 0) return refused("There are no drafts there to publish.");

  const personIds = [...new Set(drafts.map((d) => d.personId))];
  const earliest = drafts[0].startsAt.getTime();
  const latest = Math.max(...drafts.map((d) => d.endsAt.getTime()));
  const [held, employments, excluded] = await Promise.all([
    db.assignment.findMany({
      where: {
        personId: { in: personIds },
        state: { not: "cancelled" },
        startsAt: { lt: new Date(latest + 8 * 86_400_000) },
        endsAt: { gt: new Date(earliest - 8 * 86_400_000) },
      },
      select: { id: true, personId: true, startsAt: true, endsAt: true, post: { select: { name: true, site: { select: { name: true } } } } },
    }),
    db.employment.findMany({ where: { personId: { in: personIds } }, select: { personId: true, weeklyHours: true } }),
    exclusionsFor(personIds),
  ]);
  const limitOf = new Map(employments.map((e) => [e.personId, e.weeklyHours]));

  const passed: { a: (typeof drafts)[number]; note: string }[] = [];
  const blocked: string[] = [];
  for (const a of drafts) {
    const d = shiftDeployability(inputs, a.personId, a.post.requiresSiaLicence, a.endsAt);
    const theirs = held.filter((h) => h.personId === a.personId && h.id !== a.id).map((h) => ({ ...h, label: `${h.post.name}, ${h.post.site.name}` }));
    const over = d.deployable
      ? hoursProblem(theirs, [a], limitOf.get(a.personId) ?? DEFAULT_WEEKLY_HOURS) ??
        restProblem(theirs, [a]) ??
        (excluded.get(a.personId)?.has(a.post.siteId) ? `kept off ${a.post.site.name}` : null)
      : null;
    if (!d.deployable) blocked.push(`${a.person.fullName}, ${shiftLabel(a)} (${d.blockers[0].label})`);
    else if (over) blocked.push(`${a.person.fullName}, ${shiftLabel(a)} (${over})`);
    else passed.push({ a, note: d.warnings.length ? `Passed with warnings: ${d.warnings.map((w) => w.label).join("; ")}` : "Passed with no warnings" });
  }
  if (passed.length === 0) return refused(`None could be published — every draft is blocked: ${listOf(blocked)}.`);

  // One update per distinct check result, and the events in one insert: a
  // month of shifts publishes in a handful of statements, not a thousand.
  const byNote = new Map<string, string[]>();
  for (const { a, note } of passed) byNote.set(note, [...(byNote.get(note) ?? []), a.id]);
  await db.$transaction([
    ...[...byNote].map(([note, ids]) =>
      db.assignment.updateMany({
        where: { id: { in: ids }, state: "draft" },
        data: { state: "published", publishedAt: now, publishedById: session.userId, publishCheckNote: note },
      }),
    ),
    db.event.createMany({
      data: passed.map(({ a }) => ({
        type: "assignment.published",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control" as const,
        assignmentId: a.id,
        detail: `${a.post.name}, ${shiftLabel(a)} published ${context} after the deployability check passed.`,
      })),
    }),
  ]);

  refresh();
  const published = `Published ${passed.length} shift${passed.length === 1 ? "" : "s"}.`;
  return ok(
    blocked.length
      ? `${published} ${blocked.length} stayed as draft${blocked.length === 1 ? "" : "s"}, blocked: ${listOf(blocked)}.`
      : `${published} Every draft passed the check.`,
  );
}

/** Publish every draft in the weeks on screen. */
export async function publishWeek(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("assignment.publish");
  if (error || !session) return error!;

  const monday = text(formData, "monday");
  const weeks = Number(text(formData, "weeks") || "1");
  if (!isDate(monday) || weekday(monday) !== 0) return refused("That is not a rota week.");
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 5) return refused("Publish up to five weeks at a time.");

  return publishDrafts(
    session,
    { startsAt: { gte: ukInstant(monday, "00:00"), lt: ukInstant(addDays(monday, 7 * weeks), "00:00") } },
    weeks === 1 ? "with the week" : `with ${weeks} weeks`,
  );
}

// ---------------------------------------------------------------------------
// Planning in bulk
// ---------------------------------------------------------------------------

export interface BulkEntry {
  /** The page's own name for the entry, handed back with any refusal. */
  key: string;
  openShiftId: string;
  personId: string;
}

export interface BulkResult extends ActionResult {
  saved: number;
  refused: { key: string; reason: string }[];
}

const bulkRefused = (message: string): BulkResult => ({ ok: false, message, saved: 0, refused: [] });

/**
 * Put officers on open shifts in one go — typed in, suggested, or one officer
 * given a run of ticked shifts. Each entry is checked as a single ask would
 * be, and against the rest of the batch; those that pass go on the rota
 * together, those that do not come back with the reason, and nothing
 * half-happens. Each is recorded as an ask answered yes, because the officer
 * was asked — in bulk, but asked.
 */
export async function bulkAssign(payload: { entries: BulkEntry[]; channel: string; note?: string }): Promise<BulkResult> {
  const { session, error } = await guard("rota.build");
  if (error || !session) return { ...error!, saved: 0, refused: [] };

  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  if (entries.length === 0) return bulkRefused("Nothing to save.");
  if (entries.length > MAX_BATCH) return bulkRefused(`That is more than ${MAX_BATCH} shifts in one go. Save a few weeks at a time.`);
  const channel = String(payload.channel ?? "") as AskChannel;
  if (!ASK_CHANNELS.includes(channel)) return bulkRefused("Choose how the officers were asked.");
  const note = String(payload.note ?? "").trim().slice(0, 300) || "Planned in bulk";
  const now = new Date();

  const open = await db.openShift.findMany({
    where: { id: { in: entries.map((e) => String(e.openShiftId)) }, cancelledAt: null, assignmentId: null },
    include: { post: { include: { site: true } } },
  });
  const openOf = new Map(open.map((o) => [o.id, o]));

  const refusedList: { key: string; reason: string }[] = [];
  const items: (PlanItem & { openShiftId: string })[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const o = openOf.get(String(e?.openShiftId));
    if (!o) {
      refusedList.push({ key: String(e?.key ?? ""), reason: "That shift has just been filled or removed." });
      continue;
    }
    if (seen.has(o.id)) {
      refusedList.push({ key: e.key, reason: "That shift is in this plan twice." });
      continue;
    }
    seen.add(o.id);
    const w = fromNow({ startsAt: o.startsAt, endsAt: o.endsAt }, now);
    const problem = askProblem({ channel, answer: "yes", windows: [w], now });
    if (problem) refusedList.push({ key: e.key, reason: problem });
    else items.push({ key: e.key, openShiftId: o.id, postId: o.postId, personId: String(e.personId), ...w, label: `${o.post.name}, ${o.post.site.name}` });
  }
  if (items.length === 0) return { ok: false, message: "Nothing was saved — every entry was refused.", saved: 0, refused: refusedList };

  const postIds = [...new Set(items.map((i) => i.postId))];
  const personIds = [...new Set(items.map((i) => i.personId))];
  const earliest = Math.min(...items.map((i) => i.startsAt.getTime()));
  const latest = Math.max(...items.map((i) => i.endsAt.getTime()));
  const [inputs, people, theirs, onPosts, leave, excluded] = await Promise.all([
    getDeployabilityInputs(),
    db.person.findMany({ where: { id: { in: personIds } }, select: { id: true, fullName: true, employment: { select: { weeklyHours: true } } } }),
    db.assignment.findMany({
      where: {
        personId: { in: personIds },
        state: { not: "cancelled" },
        startsAt: { lt: new Date(latest + 8 * 86_400_000) },
        endsAt: { gt: new Date(earliest - 8 * 86_400_000) },
      },
      select: { personId: true, startsAt: true, endsAt: true, post: { select: { name: true, site: { select: { name: true } } } } },
    }),
    db.assignment.findMany({
      where: { postId: { in: postIds }, state: { not: "cancelled" }, startsAt: { lt: new Date(latest) }, endsAt: { gt: new Date(earliest) } },
      select: { postId: true, startsAt: true, endsAt: true },
    }),
    leaveFor(personIds, new Date(earliest), new Date(latest)),
    exclusionsFor(personIds),
  ]);
  const personOf = new Map(people.map((p) => [p.id, p]));
  const postOf = new Map(open.map((o) => [o.postId, o.post]));

  const group = <T extends { startsAt: Date; endsAt: Date }>(rows: T[], by: (r: T) => string, label: (r: T) => string) => {
    const m = new Map<string, Busy[]>();
    for (const r of rows) m.set(by(r), [...(m.get(by(r)) ?? []), { startsAt: r.startsAt, endsAt: r.endsAt, label: label(r) }]);
    return m;
  };
  const plan = planBatch(items, {
    busyByPerson: group(theirs, (r) => r.personId, (r) => `${r.post.name}, ${r.post.site.name}`),
    busyByPost: group(onPosts, (r) => r.postId, () => "another shift"),
    weeklyHoursOf: (id) => personOf.get(id)?.employment?.weeklyHours ?? DEFAULT_WEEKLY_HOURS,
    blockerFor: (item) => {
      const post = postOf.get(item.postId);
      if (!post || !post.active) return "That post is no longer active.";
      if (!inputs.has(item.personId) || !personOf.has(item.personId)) return "Only officers on the books can be put on the rota.";
      const away = leaveProblem(leave.get(item.personId) ?? [], item);
      if (away) return away;
      if (excluded.get(item.personId)?.has(post.siteId)) return `Kept off ${post.site.name}.`;
      const d = shiftDeployability(inputs, item.personId, post.requiresSiaLicence, item.endsAt);
      return d.deployable ? null : d.blockers[0].label;
    },
    now,
  });
  refusedList.push(...plan.refused.map((r) => ({ key: r.item.key, reason: r.reason })));
  if (plan.accepted.length === 0) return { ok: false, message: "Nothing was saved — every entry was refused.", saved: 0, refused: refusedList };
  const accepted = plan.accepted as (PlanItem & { openShiftId: string })[];

  try {
    await db.$transaction(
      async (tx) => {
        const made = await tx.assignment.createManyAndReturn({
          data: accepted.map((i) => ({
            personId: i.personId,
            postId: i.postId,
            startsAt: i.startsAt,
            endsAt: i.endsAt,
            // A shift already under way is on the rota at once; the rest are drafts to publish.
            ...(i.startsAt <= now
              ? { state: "published" as const, publishedAt: now, publishedById: session.userId, publishCheckNote: "Passed with no warnings" }
              : { state: "draft" as const }),
          })),
          select: { id: true, personId: true, postId: true, startsAt: true },
        });
        const idOf = new Map(made.map((m) => [`${m.personId}|${m.postId}|${m.startsAt.getTime()}`, m.id]));
        const idFor = (i: PlanItem) => idOf.get(`${i.personId}|${i.postId}|${i.startsAt.getTime()}`)!;
        for (const i of accepted) {
          await tx.openShift.update({ where: { id: i.openShiftId }, data: { assignmentId: idFor(i) } });
        }
        await tx.shiftAsk.createMany({
          data: accepted.map((i) => ({
            personId: i.personId,
            postId: i.postId,
            startsAt: i.startsAt,
            endsAt: i.endsAt,
            askedAt: now,
            askedById: session.userId,
            channel,
            answer: "yes" as const,
            note,
            assignmentId: idFor(i),
          })),
        });
        await tx.event.create({
          data: {
            type: "rota.bulk_planned",
            actorUserId: session.userId,
            actorRole: session.activeRole,
            department: "control",
            detail: `${accepted.length} open shift${accepted.length === 1 ? "" : "s"} filled by ${new Set(accepted.map((i) => i.personId)).size} officer(s) in one go (${CHANNEL_LABELS[channel].toLowerCase()})${refusedList.length ? `; ${refusedList.length} refused` : ""}. ${note}`,
          },
        });
      },
      { timeout: 60_000 },
    );
  } catch (e) {
    if (String(e).includes("assignment_no_overlap")) {
      return { ok: false, message: "Somebody changed the rota while this was being saved, and one of these shifts now clashes. Nothing was saved — look again and save.", saved: 0, refused: refusedList };
    }
    throw e;
  }

  refresh();
  const saved = accepted.length;
  return {
    ok: true,
    message: `Saved ${saved} shift${saved === 1 ? "" : "s"}${refusedList.length ? `. ${refusedList.length} refused — they are marked in red with the reason` : ""}. Publish when the plan is ready.`,
    saved,
    refused: refusedList,
  };
}

// ---------------------------------------------------------------------------
// Creating the rota
// ---------------------------------------------------------------------------

export interface CreateShiftsInput {
  postIds: string[];
  /** UK dates, both included. */
  from: string;
  to: string;
  /** 0 for Monday … 6 for Sunday. */
  weekdays: number[];
  times: ShiftTime[];
}

/**
 * Create open shifts in bulk: these posts, from this day to that, on these
 * days of the week, at these hours. Nobody is on them yet; officers are put
 * on them afterwards. A shift that already exists on a post — the same week
 * created twice — is skipped rather than doubled, and so is one that has
 * already finished.
 */
export async function createShifts(input: CreateShiftsInput): Promise<ActionResult & { created: number; skipped: number }> {
  const { session, error } = await guard("rota.build");
  if (error || !session) return { ...error!, created: 0, skipped: 0 };

  const now = new Date();
  const args = {
    postIds: [...new Set((input?.postIds ?? []).map(String))],
    from: String(input?.from ?? ""),
    to: String(input?.to ?? ""),
    weekdays: [...new Set((input?.weekdays ?? []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    times: (input?.times ?? []).map((t) => ({ start: String(t?.start ?? ""), end: String(t?.end ?? "") })),
  };
  const problem = createProblem({ ...args, now });
  if (problem) return { ...refused(problem), created: 0, skipped: 0 };

  const posts = await db.post.findMany({ where: { id: { in: args.postIds }, active: true }, include: { site: true } });
  if (posts.length < args.postIds.length) return { ...refused("Some of those posts are no longer active."), created: 0, skipped: 0 };

  const slots = slotsFor(args).filter((s) => s.endsAt > now);
  if (slots.length === 0) return { ...refused("Every one of those shifts has already finished."), created: 0, skipped: 0 };
  const first = new Date(Math.min(...slots.map((s) => s.startsAt.getTime())));
  const last = new Date(Math.max(...slots.map((s) => s.endsAt.getTime())));

  // What is already on each post: open shifts, and shifts somebody is on.
  const [openRows, onRows] = await Promise.all([
    db.openShift.findMany({ where: { postId: { in: args.postIds }, cancelledAt: null, startsAt: { lt: last }, endsAt: { gt: first } }, select: { postId: true, startsAt: true, endsAt: true } }),
    db.assignment.findMany({ where: { postId: { in: args.postIds }, state: { not: "cancelled" }, startsAt: { lt: last }, endsAt: { gt: first } }, select: { postId: true, startsAt: true, endsAt: true } }),
  ]);
  const taken = new Map<string, Busy[]>();
  for (const r of [...openRows, ...onRows]) taken.set(r.postId, [...(taken.get(r.postId) ?? []), r]);

  const rows: { postId: string; startsAt: Date; endsAt: Date; createdById: string }[] = [];
  let skipped = 0;
  for (const post of posts) {
    for (const s of slots) {
      if (clashWith(taken.get(post.id) ?? [], s)) {
        skipped++;
        continue;
      }
      rows.push({ postId: post.id, startsAt: s.startsAt, endsAt: s.endsAt, createdById: session.userId });
    }
  }
  if (rows.length === 0) {
    return { ...refused(`All ${skipped} of those shifts are already on the rota. Nothing new to create.`), created: 0, skipped };
  }

  const times = args.times.map((t) => `${t.start}–${t.end}`).join(" and ");
  try {
    await db.$transaction([
      db.openShift.createMany({ data: rows }),
      db.event.create({
        data: {
          type: "rota.shifts_created",
          actorUserId: session.userId,
          actorRole: session.activeRole,
          department: "control",
          detail: `${rows.length} open shift${rows.length === 1 ? "" : "s"} created on ${posts.length} post${posts.length === 1 ? "" : "s"}, ${dayLabel(args.from)} to ${dayLabel(args.to)}, ${times}${skipped ? `; ${skipped} already on the rota and skipped` : ""}.`,
        },
      }),
    ]);
  } catch (e) {
    if (String(e).includes("open_shift_no_overlap")) {
      return { ...refused("Somebody created some of these shifts at the same moment. Nothing was saved — look again and create."), created: 0, skipped };
    }
    throw e;
  }

  refresh();
  return {
    ...ok(`Created ${rows.length} open shift${rows.length === 1 ? "" : "s"}${skipped ? `. ${skipped} were already on the rota and were left as they were` : ""}. Now put officers on them.`),
    created: rows.length,
    skipped,
  };
}

/** Take open shifts off the rota before anyone is on them — created by mistake, or not needed. */
export async function removeOpenShifts(ids: string[]): Promise<ActionResult> {
  const { session, error } = await guard("rota.build");
  if (error || !session) return error!;
  if (!Array.isArray(ids) || ids.length === 0) return refused("Choose the open shifts to remove.");

  const open = await db.openShift.findMany({ where: { id: { in: ids.map(String) }, cancelledAt: null, assignmentId: null }, select: { id: true } });
  if (open.length === 0) return refused("None of those are open any more — somebody is on them. Take the officer off first.");
  await db.$transaction([
    db.openShift.updateMany({ where: { id: { in: open.map((o) => o.id) } }, data: { cancelledAt: new Date(), cancelledReason: "Removed from the rota before anyone was put on it" } }),
    db.event.create({
      data: {
        type: "rota.shifts_removed",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        detail: `${open.length} open shift${open.length === 1 ? "" : "s"} removed from the rota before anyone was put on them.`,
      },
    }),
  ]);

  refresh();
  const kept = ids.length - open.length;
  return ok(`Removed ${open.length} open shift${open.length === 1 ? "" : "s"}${kept ? `; ${kept} had somebody on them and were left` : ""}.`);
}

/** Publish chosen drafts together. */
export async function bulkPublish(ids: string[]): Promise<ActionResult> {
  const { session, error } = await guard("assignment.publish");
  if (error || !session) return error!;
  if (!Array.isArray(ids) || ids.length === 0) return refused("Choose the drafts to publish.");
  if (ids.length > MAX_BATCH) return refused(`That is more than ${MAX_BATCH} at once.`);
  return publishDrafts(session, { id: { in: ids.map(String) } }, "in bulk");
}

/** Take chosen drafts off together. Only drafts: nobody has been told they are on. */
export async function bulkTakeOff(ids: string[]): Promise<ActionResult> {
  const { session, error } = await guard("rota.build");
  if (error || !session) return error!;
  if (!Array.isArray(ids) || ids.length === 0) return refused("Choose the drafts to take off.");

  const drafts = await db.assignment.findMany({ where: { id: { in: ids.map(String) }, state: "draft" }, select: { id: true } });
  if (drafts.length === 0) return refused("None of those are drafts any more.");
  await db.$transaction([
    db.openShift.updateMany({ where: { assignmentId: { in: drafts.map((d) => d.id) } }, data: { assignmentId: null } }),
    db.assignment.updateMany({ where: { id: { in: drafts.map((d) => d.id) } }, data: { state: "cancelled" } }),
    db.event.create({
      data: {
        type: "rota.drafts_removed",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        detail: `${drafts.length} draft${drafts.length === 1 ? "" : "s"} taken off in one go.`,
      },
    }),
  ]);

  refresh();
  const skipped = ids.length - drafts.length;
  return ok(`Took off ${drafts.length} draft${drafts.length === 1 ? "" : "s"}${skipped ? `; ${skipped} were already published or gone, and were left alone` : ""}.`);
}

// ---------------------------------------------------------------------------
// Officers offering for open shifts
// ---------------------------------------------------------------------------
//
// An officer offers for an open shift in their portal; Control decides
// (25 September 2026). Accepting is a yes, exactly as on the phone — the same
// checks, a draft (or published at once when the shift is within two days),
// and the ask recorded as made through the portal. The officer is told either
// way, in their portal and on their phone.

/** Within this, an accepted offer goes on the rota published: there is no week to wait for. */
const PUBLISH_OFFERS_WITHIN_MS = 48 * 3_600_000;

async function loadOffer(volunteerId: string) {
  return db.shiftVolunteer.findUnique({
    where: { id: String(volunteerId) },
    include: {
      person: { select: { fullName: true, user: { select: { id: true } } } },
      openShift: { include: { post: { include: { site: true } } } },
    },
  });
}

export async function acceptOffer(volunteerId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("rota.build");
  if (error || !session) return error!;
  const v = await loadOffer(volunteerId);
  if (!v || v.state !== "waiting") return refused("That offer has already been decided or withdrawn.");
  const o = v.openShift;
  const now = new Date();
  if (o.cancelledAt || o.assignmentId || o.endsAt <= now) return refused("That shift has already been filled or is no longer needed.");
  const why = await whyCannotTake(v.personId, o);
  if (why) return refused(`${v.person.fullName} cannot work it: ${why} Decline the offer, with the reason.`);

  const window = fromNow({ startsAt: o.startsAt, endsAt: o.endsAt }, now);
  const publishNow = window.startsAt.getTime() - now.getTime() <= PUBLISH_OFFERS_WITHIN_MS;
  const inputs = await getDeployabilityInputs();
  const d = shiftDeployability(inputs, v.personId, o.post.requiresSiaLicence, window.endsAt);
  const checkNote = d.warnings.length ? `Passed with warnings: ${d.warnings.map((x) => x.label).join("; ")}` : "Passed with no warnings";
  const label = `${o.post.name} at ${o.post.site.name}, ${shiftLabel(window)}`;
  const others = await db.shiftVolunteer.findMany({
    where: { openShiftId: o.id, state: "waiting", id: { not: v.id } },
    include: { person: { select: { user: { select: { id: true } } } } },
  });

  try {
    await db.$transaction(async (tx) => {
      const a = await tx.assignment.create({
        data: publishNow
          ? { personId: v.personId, postId: o.postId, ...window, state: "published", publishedAt: now, publishedById: session.userId, publishCheckNote: checkNote }
          : { personId: v.personId, postId: o.postId, ...window, state: "draft" },
      });
      await tx.openShift.update({ where: { id: o.id }, data: { assignmentId: a.id } });
      await tx.shiftAsk.create({
        data: { personId: v.personId, postId: o.postId, ...window, askedAt: now, askedById: session.userId, channel: "portal", answer: "yes", note: v.note ? `Offered in their portal: ${v.note}` : "Offered in their portal", assignmentId: a.id },
      });
      await tx.shiftVolunteer.update({ where: { id: v.id }, data: { state: "accepted", decidedAt: now, decidedById: session.userId } });
      if (others.length) {
        await tx.shiftVolunteer.updateMany({ where: { id: { in: others.map((x) => x.id) } }, data: { state: "declined", decidedAt: now, decidedById: session.userId, decisionNote: "Somebody else was put on it" } });
      }
      // Each told in their portal, about the shift itself.
      const tell = [
        v.person.user && { ownerUserId: v.person.user.id, assignmentId: a.id, title: `${ALERT_KIND_SPECS.officer_decision.prefix} put you on ${label}.${publishNow ? " It is on your duties now." : " It goes on your duties when the week is published."}` },
        ...others.map((x) => x.person.user && { ownerUserId: x.person.user.id, openShiftId: o.id, title: `${ALERT_KIND_SPECS.officer_decision.prefix} put someone else on ${label}. Thank you for offering.` }),
      ].filter(Boolean) as { ownerUserId: string; title: string; assignmentId?: string; openShiftId?: string }[];
      if (tell.length) await tx.workItem.createMany({ data: tell.map((t) => ({ ...t, dueAt: now, slaDays: 0 })) });
      await tx.event.create({
        data: {
          type: "rota.offer_accepted",
          actorUserId: session.userId,
          actorRole: session.activeRole,
          department: "control",
          personId: v.personId,
          assignmentId: a.id,
          detail: `${v.person.fullName}'s offer for ${label} accepted — ${publishNow ? "published at once after the deployability check passed" : "on the rota as a draft"}${others.length ? `; ${others.length} other offer${others.length === 1 ? "" : "s"} declined` : ""}.`,
        },
      });
    });
  } catch (e) {
    if (String(e).includes("assignment_no_overlap")) return refused(`${v.person.fullName} has just been put on another shift at that time. Nothing was changed.`);
    throw e;
  }
  await sweepDutyChecks();
  refresh();
  revalidatePath("/me");
  return ok(`${v.person.fullName} is on ${label}${publishNow ? ", published now" : " as a draft"}. They have been told in their portal.`);
}

export async function declineOffer(volunteerId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("rota.build");
  if (error || !session) return error!;
  const v = await loadOffer(volunteerId);
  if (!v || v.state !== "waiting") return refused("That offer has already been decided or withdrawn.");
  const note = text(formData, "note").slice(0, 200) || null;
  const now = new Date();
  const label = `${v.openShift.post.name} at ${v.openShift.post.site.name}, ${shiftLabel(v.openShift)}`;
  await db.$transaction([
    db.shiftVolunteer.update({ where: { id: v.id }, data: { state: "declined", decidedAt: now, decidedById: session.userId, decisionNote: note } }),
    db.workItem.updateMany({ where: { openShiftId: v.openShiftId, state: "open", title: { startsWith: `${ALERT_KIND_SPECS.volunteer.prefix}: ${v.person.fullName} —` } }, data: { state: "done", doneAt: now } }),
    ...(v.person.user
      ? [db.workItem.create({ data: { ownerUserId: v.person.user.id, openShiftId: v.openShiftId, title: `${ALERT_KIND_SPECS.officer_decision.prefix} not put you on ${label}${note ? ` — ${note}` : ""}. Thank you for offering.`, dueAt: now, slaDays: 0 } })]
      : []),
    db.event.create({
      data: { type: "rota.offer_declined", actorUserId: session.userId, actorRole: session.activeRole, department: "control", personId: v.personId, detail: `${v.person.fullName}'s offer for ${label} declined${note ? `: ${note}` : "."}` },
    }),
  ]);
  await sweepDutyChecks();
  refresh();
  revalidatePath("/me");
  return ok(`Declined. ${v.person.fullName} has been told.`);
}

// ---------------------------------------------------------------------------
// Removing shifts that are not needed (26 September 2026)
// ---------------------------------------------------------------------------
//
// The client needed a post for a month, and after ten days says the last
// fifteen are not wanted: every shift on those posts, in those dates, comes
// off together. Or shifts ticked on the roster. Open shifts and drafts simply
// go; a shift with an officer on it is cancelled and the officer is told in
// their portal and on their phone. Anything already started is left alone.
// Nothing is deleted: each is cancelled, with the reason, and recorded.

export interface RemoveRange {
  postIds: string[];
  from: string;
  to: string;
  /** Days of the week, 0 = Monday … 6 = Sunday. All when empty. */
  weekdays?: number[];
  include: { open: boolean; drafts: boolean; published: boolean };
}
export interface RemovePicked {
  openShiftIds: string[];
  assignmentIds: string[];
}
export interface RemovePreview {
  open: number;
  cover: number;
  drafts: number;
  published: number;
  started: number;
  officers: { name: string; shifts: number }[];
  lines: string[];
}

const MAX_REMOVE = 1000;
const MAX_REMOVE_DAYS = 400;

/** Monday = 0 … Sunday = 6, on the UK calendar. */
const ukWeekday = (at: Date) => (new Date(`${ukDate(at)}T12:00:00Z`).getUTCDay() + 6) % 7;

async function removalTargets(sel: { range?: RemoveRange; picked?: RemovePicked }, now: Date): Promise<{ problem: string } | { open: { id: string; label: string }[]; cover: { id: string; label: string }[]; drafts: { id: string; label: string }[]; published: { id: string; label: string; personId: string; personName: string; userId: string | null }[]; started: number }> {
  const slot = { startsAt: true, endsAt: true, post: { select: { name: true, site: { select: { name: true } } } } } as const;
  const label = (x: { startsAt: Date; endsAt: Date; post: { name: string; site: { name: string } } }) => `${x.post.name}, ${x.post.site.name} — ${shiftLabel(x)}`;
  let openWhere: Prisma.OpenShiftWhereInput | null = null;
  let coverWhere: Prisma.CoverNeedWhereInput | null = null;
  let draftWhere: Prisma.AssignmentWhereInput | null = null;
  let publishedWhere: Prisma.AssignmentWhereInput | null = null;
  let days: number[] = [];

  if (sel.range) {
    const r = sel.range;
    const postIds = [...new Set((r.postIds ?? []).map(String))];
    if (!postIds.length) return { problem: "Choose the posts." };
    if (!isDate(r.from) || !isDate(r.to)) return { problem: "Choose the first and last day." };
    if (r.from > r.to) return { problem: "The last day is before the first." };
    const span = (new Date(`${r.to}T12:00:00Z`).getTime() - new Date(`${r.from}T12:00:00Z`).getTime()) / 86_400_000 + 1;
    if (span > MAX_REMOVE_DAYS) return { problem: `That is more than ${MAX_REMOVE_DAYS} days — do it in parts.` };
    if (!r.include?.open && !r.include?.drafts && !r.include?.published) return { problem: "Choose which shifts to remove." };
    days = (r.weekdays ?? []).map(Number).filter((d) => d >= 0 && d <= 6);
    const when = { postId: { in: postIds }, startsAt: { gte: ukInstant(r.from, "00:00"), lt: ukInstant(addDays(r.to, 1), "00:00") } };
    if (r.include.open) {
      openWhere = { ...when, cancelledAt: null, assignmentId: null };
      coverWhere = { ...when, coveredAt: null, closedAt: null };
    }
    if (r.include.drafts) draftWhere = { ...when, state: "draft", leftCover: null };
    if (r.include.published) publishedWhere = { ...when, state: { in: ["published", "amended"] }, leftCover: null };
  } else if (sel.picked) {
    const open = [...new Set((sel.picked.openShiftIds ?? []).map(String))];
    const assignments = [...new Set((sel.picked.assignmentIds ?? []).map(String))];
    if (!open.length && !assignments.length) return { problem: "Tick the shifts first." };
    if (open.length) openWhere = { id: { in: open }, cancelledAt: null, assignmentId: null };
    if (assignments.length) {
      draftWhere = { id: { in: assignments }, state: "draft", leftCover: null };
      publishedWhere = { id: { in: assignments }, state: { in: ["published", "amended"] }, leftCover: null };
    }
  } else return { problem: "Choose the shifts to remove." };

  const [open, cover, drafts, published] = await Promise.all([
    openWhere ? db.openShift.findMany({ where: openWhere, select: { id: true, ...slot }, orderBy: { startsAt: "asc" }, take: MAX_REMOVE + 1 }) : [],
    coverWhere ? db.coverNeed.findMany({ where: coverWhere, select: { id: true, ...slot }, orderBy: { startsAt: "asc" }, take: MAX_REMOVE + 1 }) : [],
    draftWhere ? db.assignment.findMany({ where: draftWhere, select: { id: true, ...slot }, orderBy: { startsAt: "asc" }, take: MAX_REMOVE + 1 }) : [],
    publishedWhere
      ? db.assignment.findMany({ where: publishedWhere, select: { id: true, personId: true, person: { select: { fullName: true, user: { select: { id: true } } } }, ...slot }, orderBy: { startsAt: "asc" }, take: MAX_REMOVE + 1 })
      : [],
  ]);
  const onDay = (x: { startsAt: Date }) => !days.length || days.includes(ukWeekday(x.startsAt));
  const future = (x: { startsAt: Date }) => x.startsAt > now;
  const all = [...open, ...cover, ...drafts, ...published].filter(onDay);
  const started = all.filter((x) => !future(x)).length;
  const keep = <T extends { startsAt: Date }>(xs: T[]) => xs.filter(onDay).filter(future);
  const result = {
    open: keep(open).map((x) => ({ id: x.id, label: label(x) })),
    cover: keep(cover).map((x) => ({ id: x.id, label: label(x) })),
    drafts: keep(drafts).map((x) => ({ id: x.id, label: label(x) })),
    published: keep(published).map((x) => ({ id: x.id, label: label(x), personId: x.personId, personName: x.person.fullName, userId: x.person.user?.id ?? null })),
    started,
  };
  if (result.open.length + result.cover.length + result.drafts.length + result.published.length > MAX_REMOVE) return { problem: `That is more than ${MAX_REMOVE} shifts at once — choose fewer posts or a shorter period.` };
  return result;
}

/** What "Remove shifts" would take off, before anything is: counts, the officers who would be told, and the first few shifts. */
export async function previewRemoveShifts(sel: { range?: RemoveRange; picked?: RemovePicked }): Promise<ActionResult & { preview?: RemovePreview }> {
  const { session, error } = await guard("rota.change");
  if (error || !session) return error!;
  const t = await removalTargets(sel ?? {}, new Date());
  if ("problem" in t) return refused(t.problem);
  const officers = new Map<string, number>();
  for (const p of t.published) officers.set(p.personName, (officers.get(p.personName) ?? 0) + 1);
  const total = t.open.length + t.cover.length + t.drafts.length + t.published.length;
  return {
    ...ok(total ? `${total} shift${total === 1 ? "" : "s"} would come off.` : "There is nothing to remove in that choice."),
    preview: {
      open: t.open.length,
      cover: t.cover.length,
      drafts: t.drafts.length,
      published: t.published.length,
      started: t.started,
      officers: [...officers].map(([name, shifts]) => ({ name, shifts })).sort((a, b) => b.shifts - a.shifts),
      lines: [...t.published.map((p) => `${p.label} · ${p.personName}`), ...t.drafts.map((d) => `${d.label} · draft`), ...t.open.map((o) => `${o.label} · open`), ...t.cover.map((c) => `${c.label} · cover being found`)].slice(0, 12),
    },
  };
}

/** Take the shifts off: open ones and drafts go, shifts with officers are cancelled and the officers told. */
export async function removeShifts(sel: { range?: RemoveRange; picked?: RemovePicked; reason: string }): Promise<ActionResult> {
  const { session, error } = await guard("rota.change");
  if (error || !session) return error!;
  const reason = String(sel?.reason ?? "").trim().slice(0, 300);
  if (reason.length < 3) return refused("Say why — for example “Client does not need cover from 16 October”.");
  const now = new Date();
  const t = await removalTargets(sel ?? {}, now);
  if ("problem" in t) return refused(t.problem);
  const total = t.open.length + t.cover.length + t.drafts.length + t.published.length;
  if (!total) return refused(t.started ? "Those shifts have already started — they cannot be removed." : "There is nothing to remove in that choice.");

  const assignmentIds = [...t.drafts, ...t.published].map((a) => a.id);
  await db.$transaction([
    db.openShift.updateMany({ where: { id: { in: t.open.map((o) => o.id) } }, data: { cancelledAt: now, cancelledReason: reason } }),
    // The open shift a draft or a published shift was filling is not needed either.
    db.openShift.updateMany({ where: { assignmentId: { in: assignmentIds } }, data: { assignmentId: null, cancelledAt: now, cancelledReason: reason } }),
    db.coverNeed.updateMany({ where: { id: { in: t.cover.map((c) => c.id) } }, data: { closedAt: now, closedReason: `Not needed: ${reason}`, closedById: session.userId } }),
    db.assignment.updateMany({ where: { id: { in: assignmentIds } }, data: { state: "cancelled" } }),
    db.assignmentAmendment.createMany({ data: t.published.map((p) => ({ assignmentId: p.id, byUserId: session.userId, change: "Shift cancelled — not needed", reason, previousPersonId: p.personId })) }),
    // Each officer is told, in their portal and on their phone.
    db.workItem.createMany({
      data: t.published.filter((p) => p.userId).map((p) => ({ ownerUserId: p.userId!, assignmentId: p.id, title: `${ALERT_KIND_SPECS.officer_decision.prefix} cancelled your shift: ${p.label}. It is not needed — ${reason}`, dueAt: now, slaDays: 0 })),
    }),
    db.event.createMany({
      data: t.published.map((p) => ({ type: "assignment.cancelled", actorUserId: session.userId, actorRole: session.activeRole, department: "control" as const, assignmentId: p.id, personId: p.personId, detail: `${p.label} (${p.personName}) cancelled: ${reason}` })),
    }),
    db.event.create({
      data: {
        type: "rota.shifts_removed",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        detail: `${session.name} took ${total} shift${total === 1 ? "" : "s"} off the rota — ${t.open.length} open, ${t.cover.length} still needing cover, ${t.drafts.length} draft${t.drafts.length === 1 ? "" : "s"}, ${t.published.length} with officers (who were told): ${reason}`,
      },
    }),
  ]);
  if (t.published.length) await sweepDutyChecks();
  refresh();
  const told = t.published.filter((p) => p.userId).length;
  const notTold = t.published.length - told;
  return ok(
    `Removed ${total} shift${total === 1 ? "" : "s"}.${t.published.length ? ` ${told} officer shift${told === 1 ? " was" : "s were"} cancelled and the officer${told === 1 ? " has" : "s have"} been told in their portal.` : ""}${notTold ? ` ${notTold} ${notTold === 1 ? "officer has" : "officers have"} no portal login — ring them.` : ""}${t.started ? ` ${t.started} had already started and were left.` : ""}`,
  );
}
