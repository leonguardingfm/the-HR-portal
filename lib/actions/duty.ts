"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { ASK_CHANNELS, CHANNEL_LABELS, OFF_REASONS, OFF_REASON_LABELS, dayLabel, ukDate, ukTime, type AskChannel, type OffReason } from "@/lib/core/rota";
import { liveProblem, loadLive, officerOffWrites } from "@/lib/db/cover";
import { sweepDutyChecks } from "@/lib/db/duty-sweep";
import { refused, ok, type ActionResult } from "./types";

/**
 * Duty checks: the chase-up. Book-ons and check calls are recorded by the
 * live-operations actions (lib/actions/operations.ts), which already carry the
 * confirmed process; this adds the step in front of them.
 *
 * Same shape as every other write: guard, re-read, then write with the event
 * in the same transaction.
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
  for (const p of ["/duty/chase-ups", "/duty/book-ons", "/duty/check-calls", "/live", "/", "/scheduling"]) revalidatePath(p);
};

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/**
 * Record a chase-up: two hours before the shift, Control makes sure the
 * officer knows about it and will be there. Confirmed; no answer (and try
 * again); or cannot attend — which takes them off the shift and raises the
 * cover need, exactly as "Officer can't do it" does on the rota.
 */
export async function recordChaseUp(assignmentId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("chase_up.record");
  if (error || !session) return error!;

  const a = await loadLive(assignmentId);
  const problem = liveProblem(a);
  if (problem || !a) return refused(problem!);
  const now = new Date();
  if (a.startsAt <= now) return refused("The shift has started — it is a book-on now, not a chase-up.");

  const outcome = text(formData, "outcome");
  if (!["confirmed", "no_answer", "cannot_attend"].includes(outcome)) return refused("Choose what happened.");
  const channel = (text(formData, "channel") || "phone") as AskChannel;
  if (!ASK_CHANNELS.includes(channel)) return refused("Choose how you reached them.");
  const note = text(formData, "note").slice(0, 300) || null;
  const shift = `${a.post.name}, ${a.post.site.name}, ${dayLabel(ukDate(a.startsAt))} ${ukTime(a.startsAt)}`;
  const chase = db.chaseUp.create({
    data: { assignmentId: a.id, at: now, byUserId: session.userId, channel, outcome: outcome as "confirmed" | "no_answer" | "cannot_attend", note: outcome === "cannot_attend" ? note ?? "" : note },
  });
  const event = (detail: string) =>
    db.event.create({
      data: {
        type: `duty.chase_up_${outcome}`,
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        assignmentId: a.id,
        personId: a.personId,
        detail,
      },
    });

  if (outcome === "cannot_attend") {
    const reason = text(formData, "reason") as OffReason;
    if (!OFF_REASONS.includes(reason)) return refused("Say why they cannot attend.");
    if (!note && reason === "other") return refused("Say what happened — “other” needs a note.");
    const why = note ?? OFF_REASON_LABELS[reason];
    const off = officerOffWrites(a, reason, why, { userId: session.userId, role: session.activeRole }, now);
    if (!off.ok) return refused(off.reason);
    await db.$transaction([
      db.chaseUp.create({ data: { assignmentId: a.id, at: now, byUserId: session.userId, channel, outcome: "cannot_attend", note: why } }),
      ...off.writes,
      event(`Chase-up (${CHANNEL_LABELS[channel].toLowerCase()}): ${a.person.fullName} cannot attend ${shift} — ${why}. Off the shift; cover needed.`),
    ]);
    refresh();
    return ok(`${a.person.fullName} is off ${shift}. It is on the cover list — find cover from Scheduling.`);
  }

  await db.$transaction([
    chase,
    event(
      outcome === "confirmed"
        ? `Chase-up (${CHANNEL_LABELS[channel].toLowerCase()}): ${a.person.fullName} confirmed ${shift}.`
        : `Chase-up (${CHANNEL_LABELS[channel].toLowerCase()}): no answer from ${a.person.fullName} about ${shift}.`,
    ),
  ]);
  await sweepDutyChecks();
  refresh();
  return ok(
    outcome === "confirmed"
      ? `${a.person.fullName} confirmed. Next: the book-on at ${ukTime(a.startsAt)}.`
      : `Recorded: no answer from ${a.person.fullName}. Try again — it turns red an hour before the start.`,
  );
}
