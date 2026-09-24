"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { IDENTITY_KEY_LABELS, identityKeys } from "@/lib/core/identity";
import { CONTROL_TEAMS, doneSteps, type OnboardingStepKey } from "@/lib/core/onboarding";
import { offerBlockers, onlineChecksOnFile } from "@/lib/core/screening";
import { toCoreScreeningFile } from "@/lib/db/queries";
import {
  END_STAGES,
  STAGE_INTERVIEW,
  canAdvance,
  canRecordInterview,
  requiredInterviews,
} from "@/lib/core/recruitment";
import { INTERVIEW_STAGE_LABELS, RECRUITMENT_STAGE_LABELS, SOURCE_LABELS } from "@/lib/labels";
import type { InterviewStage, RecruitmentStage } from "@/lib/types";
import { refused, ok, type ActionResult } from "./types";

/**
 * Recruitment writes: a new candidate, moving them on, recording an interview,
 * and withdrawing them.
 *
 * Same shape as every other write: guard, re-read, then write with the event
 * in the same transaction. The rules about what may move where are in
 * lib/core/recruitment.ts, so this file only applies them.
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

const refresh = (candidacyId?: string) => {
  revalidatePath("/candidates");
  if (candidacyId) revalidatePath(`/candidates/${candidacyId}`);
  revalidatePath("/");
};

const SOURCES = Object.keys(SOURCE_LABELS) as (keyof typeof SOURCE_LABELS)[];
const OUTCOMES = ["progress", "hold", "reject"] as const;
type Outcome = (typeof OUTCOMES)[number];

// ---------------------------------------------------------------------------
// New candidate
// ---------------------------------------------------------------------------

const EMPTY_VALUES = { fullName: "", email: "", phone: "", dateOfBirth: "", source: "", requirementId: "" };

export interface NewCandidateState {
  error: string | null;
  fields: Partial<Record<"fullName" | "contact" | "email" | "phone" | "dateOfBirth", string>>;
  /** An existing person this looks like. The form offers to use them instead. */
  match: { personId: string; name: string; via: string; openCandidacyId: string | null } | null;
  /** Set once created, so the form can link straight to the new record. */
  createdId: string | null;
  /** Echoed back, so a refused or matched form keeps what was typed. */
  values: Record<"fullName" | "email" | "phone" | "dateOfBirth" | "source" | "requirementId", string>;
}

export async function createCandidate(
  _prev: NewCandidateState,
  formData: FormData,
): Promise<NewCandidateState> {
  const { session, error } = await guard("candidacy.create");
  if (error || !session) {
    return { error: error!.message, fields: {}, match: null, createdId: null, values: EMPTY_VALUES };
  }

  const fullName = String(formData.get("fullName") ?? "").trim().replace(/\s+/g, " ");
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const dobRaw = String(formData.get("dateOfBirth") ?? "").trim();
  const sourceRaw = String(formData.get("source") ?? "");
  const requirementId = String(formData.get("requirementId") ?? "") || null;
  const existingPersonId = String(formData.get("existingPersonId") ?? "") || null;
  const values = { fullName, email, phone, dateOfBirth: dobRaw, source: sourceRaw, requirementId: requirementId ?? "" };

  const fields: NewCandidateState["fields"] = {};
  if (fullName.length < 2 || fullName.length > 120) fields.fullName = "Enter the candidate's full name.";
  if (!email && !phone) fields.contact = "Give an email address or a phone number, so they can be contacted.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = "That is not a valid email address.";
  if (phone && phone.replace(/\D/g, "").length < 10) fields.phone = "That phone number looks too short.";
  let dateOfBirth: Date | null = null;
  if (dobRaw) {
    dateOfBirth = new Date(`${dobRaw}T00:00:00Z`);
    const age = (Date.now() - dateOfBirth.getTime()) / (365.25 * 86_400_000);
    if (Number.isNaN(age) || age < 18 || age > 90) {
      fields.dateOfBirth = "Security officers must be 18 or over. Check the date.";
    }
  }
  if (Object.keys(fields).length > 0) {
    return { error: "Check the highlighted fields.", fields, match: null, createdId: null, values };
  }
  const source = SOURCES.includes(sourceRaw as never) ? (sourceRaw as (typeof SOURCES)[number]) : null;

  if (requirementId) {
    const req = await db.requirement.findUnique({ where: { id: requirementId }, select: { id: true } });
    if (!req) return { error: "That requirement no longer exists.", fields: {}, match: null, createdId: null, values };
  }

  // The duplicate check runs against the normalised keys in the database, so a
  // person who first got in touch over WhatsApp a year ago is found, not
  // entered again as a stranger.
  const keys = identityKeys({ fullName, dateOfBirth, email: email || null, phone: phone || null });
  const hit = keys.length
    ? await db.personIdentityKey.findFirst({
        where: { OR: keys.map((k) => ({ kind: k.kind, value: k.value })) },
        include: {
          person: {
            include: {
              candidacies: { where: { stage: { notIn: END_STAGES } }, select: { id: true, requirementId: true } },
            },
          },
        },
      })
    : null;

  if (hit && hit.personId !== existingPersonId) {
    const open = hit.person.candidacies[0]?.id ?? null;
    return {
      error: null,
      fields: {},
      match: {
        personId: hit.personId,
        name: hit.person.fullName,
        via: IDENTITY_KEY_LABELS[hit.kind],
        openCandidacyId: open,
      },
      createdId: null,
      values,
    };
  }
  if (existingPersonId && !hit) {
    // Only ever attach to the person the check actually found.
    return { error: "That record no longer matches these details. Check them and try again.", fields: {}, match: null, createdId: null, values };
  }

  if (hit) {
    const clash = hit.person.candidacies.find((c) => c.requirementId === requirementId);
    if (clash) {
      return {
        error: `${hit.person.fullName} is already in the pipeline${requirementId ? " for this requirement" : ""}.`,
        fields: {},
        match: { personId: hit.personId, name: hit.person.fullName, via: IDENTITY_KEY_LABELS[hit.kind], openCandidacyId: clash.id },
        createdId: null,
        values,
      };
    }
  }

  try {
    const created = await db.$transaction(async (tx) => {
      let personId: string;
      if (hit) {
        personId = hit.personId;
        // A returning leaver comes back as a rehire candidate, keeping their history.
        if (hit.person.lifecycle === "leaver") {
          await tx.person.update({ where: { id: personId }, data: { lifecycle: "rehire_candidate" } });
        }
        // Add any keys we did not have before, so they are found next time too.
        await tx.personIdentityKey.createMany({
          data: keys.map((k) => ({ personId, ...k })),
          skipDuplicates: true,
        });
      } else {
        const person = await tx.person.create({
          data: {
            fullName,
            email: email || null,
            phone: phone || null,
            dateOfBirth,
            lifecycle: "candidate",
          },
        });
        personId = person.id;
        await tx.personIdentityKey.createMany({ data: keys.map((k) => ({ personId, ...k })) });
      }

      const candidacy = await tx.candidacy.create({
        data: { personId, requirementId, source, ownerUserId: session.userId, stage: "sourcing" },
      });
      await tx.event.create({
        data: {
          type: "candidacy.created",
          actorUserId: session.userId,
          actorRole: session.activeRole,
          department: "recruitment",
          personId,
          requirementId,
          detail: hit
            ? `Returning candidate ${hit.person.fullName} added to the pipeline.`
            : `New candidate ${fullName} added to the pipeline.`,
        },
      });
      return candidacy;
    });

    refresh(created.id);
    return { error: null, fields: {}, match: null, createdId: created.id, values: EMPTY_VALUES };
  } catch (err) {
    // Two people entering the same candidate at once: the unique key decides.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        error: "Someone has just entered a person with these details. Search the pipeline for them.",
        fields: {},
        match: null,
        createdId: null,
        values,
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Moving on, interviews, withdrawal
// ---------------------------------------------------------------------------

async function loadCandidacy(id: string) {
  return db.candidacy.findUnique({
    where: { id },
    include: {
      person: {
        include: {
          screeningFile: {
            where: { disposedAt: null },
            orderBy: { openedAt: "desc" },
            take: 1,
            include: { checks: true },
          },
          employment: true,
        },
      },
      interviews: true,
      onboardingSteps: true,
      requirement: { include: { client: true } },
    },
  });
}

export async function advanceCandidacy(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("candidacy.advance");
  if (error || !session) return error!;

  const id = String(formData.get("candidacyId") ?? "");
  const c = await loadCandidacy(id);
  if (!c) return refused("That candidate no longer exists.");

  const from = c.stage as RecruitmentStage;
  const file = c.person.screeningFile[0];
  const screening = file ? toCoreScreeningFile(file, c.personId) : null;
  const check = canAdvance({
    stage: from,
    interviews: c.interviews.map((i) => ({ stage: i.stage as InterviewStage, outcome: i.outcome })),
    requiresAdditional: c.requirement?.client.requiresAdditionalInterview ?? false,
    onboardingDone: doneSteps(
      c.onboardingSteps.map((s) => s.step as OnboardingStepKey),
      onlineChecksOnFile(screening),
    ),
    screeningBlockers: offerBlockers(screening),
  });
  if (!check.permitted || !check.to) return refused(check.reason ?? "This candidate cannot move on.");
  const to = check.to;

  // Only if nobody else moved them in the meantime.
  const moved = await db.$transaction(async (tx) => {
    const { count } = await tx.candidacy.updateMany({
      where: { id: c.id, stage: from },
      data: { stage: to, stageSince: new Date() },
    });
    if (count === 0) return false;
    if (to === "onboarding_complete") {
      // Replaces the WhatsApp message to the New Recruit Onboarding Group: a
      // task in the right Control team's queue, due tomorrow.
      const team = CONTROL_TEAMS.find((t) => t.id === c.person.employment?.controlTeam);
      const pin = c.person.employment?.pin;
      await tx.workItem.create({
        data: {
          title: `New recruit ready for deployment: ${c.person.fullName}${pin ? ` — PIN ${pin}` : ""}${team ? ` (${team.label})` : ""}`,
          personId: c.personId,
          ownerRole: "control",
          dueAt: new Date(Date.now() + 86_400_000),
          slaDays: 1,
        },
      });
      await tx.onboardingStep.create({
        data: { candidacyId: c.id, step: "control_notified", doneById: null, note: team?.label ?? null },
      });
    }
    await tx.event.create({
      data: {
        type: "candidacy.advanced",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "recruitment",
        personId: c.personId,
        requirementId: c.requirementId,
        detail: `${RECRUITMENT_STAGE_LABELS[from]} → ${RECRUITMENT_STAGE_LABELS[to]}.`,
        payload: { from, to },
      },
    });
    return true;
  });
  if (!moved) return refused("Someone else has just moved this candidate. Refresh to see where they are.");

  refresh(c.id);
  return ok(`${c.person.fullName} moved to ${RECRUITMENT_STAGE_LABELS[to]}.`);
}

export async function recordInterview(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("candidacy.advance");
  if (error || !session) return error!;

  const id = String(formData.get("candidacyId") ?? "");
  const outcome = String(formData.get("outcome") ?? "") as Outcome;
  const notes = String(formData.get("notes") ?? "").trim();
  const heldRaw = String(formData.get("heldAt") ?? "");

  const c = await loadCandidacy(id);
  if (!c) return refused("That candidate no longer exists.");
  const stage = STAGE_INTERVIEW[c.stage as RecruitmentStage];
  if (!stage) {
    return refused(
      `${c.person.fullName} is at ${RECRUITMENT_STAGE_LABELS[c.stage as RecruitmentStage]}, which is not an interview stage.`,
    );
  }
  const required = requiredInterviews(c.requirement?.client.requiresAdditionalInterview ?? false);
  if (!required.includes(stage)) return refused("This client does not ask for an additional interview.");
  if (!canRecordInterview(session.activeRole, stage)) {
    return refused(
      `The ${INTERVIEW_STAGE_LABELS[stage].toLowerCase()} interview is held by the HR Manager. You are working as ${session.activeRole.replace(/_/g, " ")}.`,
    );
  }
  if (c.interviews.some((i) => i.stage === stage && i.outcome === "progress")) {
    return refused(`The ${INTERVIEW_STAGE_LABELS[stage].toLowerCase()} interview has already been passed.`);
  }
  if (!OUTCOMES.includes(outcome)) return refused("Choose an outcome.");
  if (outcome !== "progress" && !notes) return refused("Say why, in the notes — a hold or a reject with no reason cannot be reviewed.");

  const heldAt = heldRaw ? new Date(heldRaw) : new Date();
  if (Number.isNaN(heldAt.getTime())) return refused("That date and time is not valid.");
  if (heldAt.getTime() > Date.now() + 5 * 60_000) return refused("An interview is recorded after it is held, not before.");

  await db.$transaction([
    db.interview.create({
      data: {
        candidacyId: c.id,
        stage,
        interviewerUserId: session.userId,
        heldAt,
        outcome,
        notes: notes || null,
      },
    }),
    // The booked slot for this interview has now been held.
    db.interviewBooking.updateMany({ where: { candidacyId: c.id, stage, status: "booked" }, data: { status: "held" } }),
    db.event.create({
      data: {
        type: "interview.recorded",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "recruitment",
        personId: c.personId,
        requirementId: c.requirementId,
        detail: `${INTERVIEW_STAGE_LABELS[stage]} interview: ${outcome}.`,
        payload: { stage, outcome },
      },
    }),
  ]);

  refresh(c.id);
  return ok(
    outcome === "progress"
      ? `${INTERVIEW_STAGE_LABELS[stage]} interview passed. ${c.person.fullName} can now move on.`
      : outcome === "reject"
        ? "Recorded as a reject. Withdraw the candidate if that is the end of it."
        : "Recorded as on hold.",
  );
}

export async function withdrawCandidacy(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("candidacy.withdraw");
  if (error || !session) return error!;

  const id = String(formData.get("candidacyId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return refused("Say why they are being withdrawn.");

  const c = await loadCandidacy(id);
  if (!c) return refused("That candidate no longer exists.");
  const from = c.stage as RecruitmentStage;
  if (END_STAGES.includes(from)) {
    return refused(`${c.person.fullName} is at ${RECRUITMENT_STAGE_LABELS[from]}, so there is nothing to withdraw from here.`);
  }

  // The screening file goes with the application — unless the person is
  // employed or still has another application live, in which case the file is
  // still somebody's work. It is marked withdrawn, never deleted: retention
  // decides when it goes [11].
  const otherLive = await db.candidacy.count({
    where: { personId: c.personId, id: { not: c.id }, stage: { notIn: END_STAGES } },
  });
  const liveFile =
    otherLive === 0 && !c.person.employment
      ? await db.screeningFile.findFirst({
          where: { personId: c.personId, disposedAt: null, controllerReview2At: null, status: { not: "withdrawn" } },
          select: { id: true },
        })
      : null;

  await db.$transaction([
    db.candidacy.update({
      where: { id: c.id },
      data: { stage: "withdrawn", stageSince: new Date(), withdrawnReason: reason },
    }),
    db.event.create({
      data: {
        type: "candidacy.withdrawn",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "recruitment",
        personId: c.personId,
        requirementId: c.requirementId,
        detail: `Withdrawn at ${RECRUITMENT_STAGE_LABELS[from]}: ${reason}`,
        payload: { from },
      },
    }),
    ...(liveFile
      ? [
          db.screeningFile.update({ where: { id: liveFile.id }, data: { status: "withdrawn" } }),
          db.event.create({
            data: {
              type: "screening.withdrawn",
              actorUserId: session.userId,
              actorRole: session.activeRole,
              department: "vetting",
              personId: c.personId,
              screeningFileId: liveFile.id,
              detail: "Screening file withdrawn with the application.",
            },
          }),
          // Nothing left to review on a withdrawn file.
          db.workItem.updateMany({
            where: { screeningFileId: liveFile.id, state: { in: ["open", "blocked"] } },
            data: { state: "cancelled" },
          }),
        ]
      : []),
  ]);
  if (liveFile) revalidatePath("/vetting");

  refresh(c.id);
  return ok(`${c.person.fullName} has been withdrawn.`);
}
