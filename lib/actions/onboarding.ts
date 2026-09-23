"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { normalisePhone } from "@/lib/core/identity";
import {
  CONTROL_TEAMS,
  normaliseSiaNumber,
  stepSpec,
  waitingOn,
  type OnboardingStepKey,
  type StepSpec,
} from "@/lib/core/onboarding";
import type { Role } from "@/lib/types";
import { refused, ok, type ActionResult } from "./types";

/**
 * The onboarding checklist: ticking a step, undoing a tick, and the four steps
 * that capture something real — next of kin, the online checks, the SIA
 * licence and the PIN.
 *
 * Same shape as every other write: guard, re-read, then write with the event
 * in the same transaction. Which steps exist, and in which stage, is
 * lib/core/onboarding.ts.
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

const refresh = (candidacyId: string) => {
  revalidatePath(`/candidates/${candidacyId}`);
  revalidatePath("/candidates");
  revalidatePath("/onboarding");
};

/**
 * The checks every step shares: the candidate exists, is in the stage this
 * step belongs to, the step is not already done, and this role owns it.
 */
type Loaded = NonNullable<Awaited<ReturnType<typeof findCandidacy>>>;

function findCandidacy(id: string) {
  return db.candidacy.findUnique({ where: { id }, include: { person: true, onboardingSteps: true } });
}

async function loadFor(
  candidacyId: string,
  spec: StepSpec | undefined,
  role: Role,
): Promise<{ error: ActionResult } | { c: Loaded }> {
  if (!spec) return { error: refused("That is not a step on the checklist.") };
  const c = await findCandidacy(candidacyId);
  if (!c) return { error: refused("That candidate no longer exists.") };
  if (c.stage !== spec.stage) {
    return { error: refused(`"${spec.label}" is done at a different stage from the one this candidate is at.`) };
  }
  if (c.onboardingSteps.some((s) => s.step === spec.key)) {
    return { error: refused(`"${spec.label}" is already done.`) };
  }
  if (!spec.roles.includes(role)) {
    return { error: refused(`"${spec.label}" belongs to the ${spec.owner}.`) };
  }
  const first = waitingOn(spec, new Set(c.onboardingSteps.map((s) => s.step as OnboardingStepKey)));
  if (first.length) {
    return { error: refused(`"${first[0]!.label}" has to be done before "${spec.label}".`) };
  }
  return { c };
}

function stepEvent(
  session: { userId: string; activeRole: Role },
  c: { personId: string; requirementId: string | null },
  type: string,
  detail: string,
) {
  return db.event.create({
    data: {
      type,
      actorUserId: session.userId,
      actorRole: session.activeRole,
      department: "recruitment",
      personId: c.personId,
      requirementId: c.requirementId,
      detail,
    },
  });
}

// ---------------------------------------------------------------------------
// Plain steps
// ---------------------------------------------------------------------------

export async function completeStep(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("onboarding.step");
  if (error || !session) return error!;

  const spec = stepSpec(String(formData.get("step") ?? ""));
  const note = String(formData.get("note") ?? "").trim();
  if (spec && spec.kind !== "tick" && spec.kind !== "note") {
    return refused(`"${spec.label}" is completed through its own form.`);
  }
  const loaded = await loadFor(String(formData.get("candidacyId") ?? ""), spec, session.activeRole);
  if ("error" in loaded) return loaded.error;
  const { c } = loaded;
  if (spec!.kind === "note" && note.length < 10) {
    return refused("Write the evaluation down — a sentence or two on the role and why the risk is acceptable.");
  }

  await db.$transaction([
    db.onboardingStep.create({
      data: { candidacyId: c.id, step: spec!.key, doneById: session.userId, note: note || null },
    }),
    stepEvent(session, c, "onboarding.step_done", `${spec!.label}.`),
  ]);
  refresh(c.id);
  return ok(`${spec!.label} — done.`);
}

/**
 * Take back a tick made by mistake. Only for the plain steps, and only while
 * the candidate is still in that stage: once they have moved on, the tick is
 * part of why they were allowed to. The event log keeps both.
 */
export async function undoStep(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("onboarding.step");
  if (error || !session) return error!;

  const candidacyId = String(formData.get("candidacyId") ?? "");
  const spec = stepSpec(String(formData.get("step") ?? ""));
  if (!spec || (spec.kind !== "tick" && spec.kind !== "note")) {
    return refused("Only a plain tick can be undone. Records like a PIN or a licence are corrected where they are held.");
  }
  const c = await db.candidacy.findUnique({ where: { id: candidacyId } });
  if (!c) return refused("That candidate no longer exists.");
  if (c.stage !== spec.stage) return refused("They have moved on since, so this tick stands.");

  const { count } = await db.onboardingStep.deleteMany({ where: { candidacyId, step: spec.key } });
  if (count === 0) return refused("That step was not done.");
  await stepEvent(session, c, "onboarding.step_undone", `${spec.label} — marked not done.`);
  refresh(c.id);
  return ok(`${spec.label} — marked not done.`);
}

// ---------------------------------------------------------------------------
// Steps that capture something
// ---------------------------------------------------------------------------

export async function recordNextOfKin(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("onboarding.step");
  if (error || !session) return error!;

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const loaded = await loadFor(String(formData.get("candidacyId") ?? ""), stepSpec("next_of_kin_recorded"), session.activeRole);
  if ("error" in loaded) return loaded.error;
  const { c } = loaded;
  if (name.length < 2) return refused("Give the next of kin's name.");
  if (normalisePhone(phone).length < 10) return refused("Give a phone number Control can call.");

  await db.$transaction([
    db.person.update({ where: { id: c.personId }, data: { nextOfKinName: name, nextOfKinPhone: phone } }),
    db.onboardingStep.create({
      data: { candidacyId: c.id, step: "next_of_kin_recorded", doneById: session.userId },
    }),
    stepEvent(session, c, "onboarding.step_done", "Next of kin recorded."),
  ]);
  refresh(c.id);
  return ok("Next of kin saved to their record.");
}

/**
 * The online checks belong to the screening file, so they are confirmed by
 * Vetting — never ticked off by the team waiting on them.
 */
export async function confirmOnlineChecks(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("document.verify");
  if (error || !session) return error!;

  const note = String(formData.get("note") ?? "").trim();
  const loaded = await loadFor(String(formData.get("candidacyId") ?? ""), stepSpec("online_checks_confirmed"), session.activeRole);
  if ("error" in loaded) return loaded.error;
  const { c } = loaded;

  await db.$transaction([
    db.onboardingStep.create({
      data: { candidacyId: c.id, step: "online_checks_confirmed", doneById: session.userId, note: note || null },
    }),
    stepEvent(session, c, "onboarding.step_done", "Online checks confirmed on the screening file."),
  ]);
  refresh(c.id);
  return ok("Online checks confirmed.");
}

const LICENCE_KINDS = ["sia_security_guarding", "sia_door_supervisor", "sia_cctv", "sia_close_protection"] as const;

export async function recordSiaLicence(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("onboarding.step");
  if (error || !session) return error!;

  const number = normaliseSiaNumber(String(formData.get("number") ?? ""));
  const nameOnBadge = String(formData.get("nameOnBadge") ?? "").trim().replace(/\s+/g, " ");
  const expiresRaw = String(formData.get("expiresAt") ?? "");
  const kind = String(formData.get("kind") ?? "") as (typeof LICENCE_KINDS)[number];

  const loaded = await loadFor(String(formData.get("candidacyId") ?? ""), stepSpec("sia_licence_recorded"), session.activeRole);
  if ("error" in loaded) return loaded.error;
  const { c } = loaded;

  if (!number) return refused("An SIA licence number is 16 digits.");
  if (nameOnBadge.length < 2) return refused("Copy the name exactly as it is printed on the badge.");
  if (!LICENCE_KINDS.includes(kind)) return refused("Choose the licence type.");
  const expiresAt = new Date(`${expiresRaw}T00:00:00Z`);
  if (Number.isNaN(expiresAt.getTime())) return refused("Give the expiry date from the badge.");
  if (expiresAt.getTime() <= Date.now()) return refused("That licence has expired. An expired licence cannot be recorded for a new starter.");

  const existing = await db.licence.findUnique({ where: { number }, include: { person: true } });
  if (existing && existing.personId !== c.personId) {
    return refused(`Licence ${number} is already recorded against ${existing.person.fullName}. Check the number with the candidate.`);
  }

  try {
    await db.$transaction([
      existing
        ? db.licence.update({ where: { id: existing.id }, data: { nameOnBadge, expiresAt, kind } })
        : db.licence.create({ data: { personId: c.personId, number, nameOnBadge, expiresAt, kind } }),
      // The licence number is the strongest duplicate key there is, so it
      // joins the others the moment it is known.
      db.personIdentityKey.createMany({
        data: [{ personId: c.personId, kind: "sia_licence", value: number.replace(/\s/g, "") }],
        skipDuplicates: true,
      }),
      db.onboardingStep.create({
        data: {
          candidacyId: c.id,
          step: "sia_licence_recorded",
          doneById: session.userId,
          note: `${number} · ${nameOnBadge}`,
        },
      }),
      stepEvent(session, c, "onboarding.step_done", `SIA licence ${number} recorded as "${nameOnBadge}".`),
    ]);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return refused("That licence number was recorded against someone else a moment ago.");
    }
    throw err;
  }
  refresh(c.id);
  return ok(`Licence recorded. "${nameOnBadge}" is now the spelling used everywhere.`);
}

/**
 * Allocate the next free PIN and open the officer record.
 *
 * The PIN is never typed and never reused: it is the highest issued plus one,
 * and the unique index settles two people allocating at the same moment.
 */
export async function allocatePin(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("pin.allocate");
  if (error || !session) return error!;

  const controlTeam = String(formData.get("controlTeam") ?? "");
  const startRaw = String(formData.get("startedAt") ?? "");

  const loaded = await loadFor(String(formData.get("candidacyId") ?? ""), stepSpec("pin_assigned"), session.activeRole);
  if ("error" in loaded) return loaded.error;
  const { c } = loaded;

  if (!CONTROL_TEAMS.some((t) => t.id === controlTeam)) return refused("Choose which Control team follows them up.");
  const startedAt = startRaw ? new Date(`${startRaw}T00:00:00Z`) : new Date(new Date().toISOString().slice(0, 10));
  if (Number.isNaN(startedAt.getTime())) return refused("That start date is not valid.");

  const previous = await db.employment.findUnique({ where: { personId: c.personId } });
  if (previous) {
    return refused(
      `${c.person.fullName} already has an employment record (PIN ${previous.pin}). Re-employing a returning officer is not built yet, so their PIN has not been changed.`,
    );
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const [{ next }] = await db.$queryRaw<{ next: number }[]>`
      SELECT COALESCE(MAX(pin::int), 1000) + 1 AS next FROM "Employment" WHERE pin ~ '^[0-9]+$'`;
    const pin = String(next);
    try {
      await db.$transaction([
        db.employment.create({
          data: { personId: c.personId, pin, controlTeam, startedAt, state: "conditional" },
        }),
        db.person.update({ where: { id: c.personId }, data: { lifecycle: "conditional_officer" } }),
        // Conditional employment starts here, so the screening clock does too
        // [7.6] — on the live file, and only if nothing has started it yet.
        db.screeningFile.updateMany({
          where: { personId: c.personId, disposedAt: null, conditionalEmploymentStart: null },
          data: { conditionalEmploymentStart: startedAt },
        }),
        db.onboardingStep.create({
          data: { candidacyId: c.id, step: "pin_assigned", doneById: session.userId, note: `PIN ${pin}` },
        }),
        stepEvent(
          session,
          c,
          "onboarding.pin_allocated",
          `PIN ${pin} allocated; followed up by ${CONTROL_TEAMS.find((t) => t.id === controlTeam)!.label}.`,
        ),
      ]);
      refresh(c.id);
      return ok(`PIN ${pin} allocated. ${c.person.fullName} now has an officer record.`);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Someone took this PIN between the read and the write: try the next.
        if (String(err.meta?.target ?? "").includes("pin")) continue;
        return refused("The PIN step was completed by someone else a moment ago. Refresh to see it.");
      }
      throw err;
    }
  }
  return refused("Could not allocate a PIN just now — several were being issued at once. Try again.");
}
