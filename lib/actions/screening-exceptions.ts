"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { MAX_EXTENSION_WEEKS, RETENTION } from "@/lib/bs7858";
import { END_STAGES } from "@/lib/core/recruitment";
import {
  DECISION_KIND,
  EXCEPTION_LABELS,
  OUTCOME_LABELS,
  RISK_TRIGGERS,
  declarationProblem,
  decisionProblem,
  extensionApprovalProblem,
  extensionProblem,
  outcomesFor,
  riskFindingProblem,
  type DecisionOutcome,
  type ExceptionKind,
} from "@/lib/core/screening-exceptions";
import { toCoreScreeningFile } from "@/lib/db/queries";
import { settleFileStatus } from "@/lib/db/screening-status";
import { sweepScreeningClocks } from "@/lib/db/sweeps";
import type { Role } from "@/lib/types";
import { refused, ok, type ActionResult } from "./types";

/**
 * Screening exceptions: raising a finding or a request, recording the
 * individual's representation, and Higher Management's decision — plus the
 * clock sweep, run by hand.
 *
 * Same shape as every other write: guard, re-read, then write with the event
 * in the same transaction. The limits are lib/core/screening-exceptions.ts,
 * and prisma/constraints.sql §13 refuses what slips past them.
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

const loadFile = (id: string) =>
  db.screeningFile.findUnique({
    where: { id },
    include: {
      checks: true,
      exceptions: true,
      decisions: true,
      person: {
        include: {
          employment: true,
          candidacies: { orderBy: { stageSince: "desc" }, take: 1, select: { id: true, stage: true } },
        },
      },
    },
  });
type LoadedFile = NonNullable<Awaited<ReturnType<typeof loadFile>>>;

const refresh = (f: LoadedFile) => {
  revalidatePath("/vetting");
  revalidatePath(`/vetting/${f.id}`);
  revalidatePath("/tasks");
  const c = f.person.candidacies[0];
  if (c) revalidatePath(`/candidates/${c.id}`);
};

const openKinds = (f: LoadedFile) =>
  f.exceptions.filter((e) => e.state !== "decided").map((e) => e.kind as ExceptionKind);

function fileEvent(
  tx: Prisma.TransactionClient | typeof db,
  session: { userId: string; activeRole: Role },
  f: { id: string; personId: string },
  type: string,
  detail: string,
) {
  return tx.event.create({
    data: {
      type,
      actorUserId: session.userId,
      actorRole: session.activeRole,
      department: "vetting",
      personId: f.personId,
      screeningFileId: f.id,
      detail,
    },
  });
}

/** The decision lands in Higher Management's queue, so it is somebody's work. */
const decisionTaskTitle = (kind: ExceptionKind, name: string) =>
  `Decide ${EXCEPTION_LABELS[kind].toLowerCase()}: ${name}`;

function decisionTask(tx: Prisma.TransactionClient, f: LoadedFile, kind: ExceptionKind) {
  return tx.workItem.create({
    data: {
      title: decisionTaskTitle(kind, f.person.fullName),
      screeningFileId: f.id,
      ownerRole: "top_management",
      dueAt: new Date(Date.now() + 2 * 86_400_000),
      slaDays: 2,
    },
  });
}

/** Cases are raised by the file's administrator, on a file still being worked. */
function raiserRefusal(f: LoadedFile, userId: string): ActionResult | null {
  if (f.administratorUserId !== userId) return refused("Findings and requests on a file are raised by its administrator.");
  if (f.controllerReview2At || f.status === "complete") return refused("This file is complete.");
  if (f.status === "withdrawn" || f.status === "unsuccessful") return refused("This file has ended.");
  if (f.status === "controller_review_1" || f.status === "controller_review_2") {
    return refused("The file is with its controller for review. Raise this once it comes back.");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Raising
// ---------------------------------------------------------------------------

export async function raiseRiskFinding(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("screening.exception.raise");
  if (error || !session) return error!;

  const f = await loadFile(String(formData.get("fileId") ?? ""));
  if (!f) return refused("That file no longer exists.");
  const blocked = raiserRefusal(f, session.userId);
  if (blocked) return blocked;

  const trigger = String(formData.get("trigger") ?? "");
  const amountRaw = String(formData.get("amountGbp") ?? "").replace(/[£,\s]/g, "");
  const amountGbp = trigger === "ccj" ? (amountRaw ? Number(amountRaw) : null) : null;
  const detail = String(formData.get("detail") ?? "").trim();
  const problem = riskFindingProblem({ trigger, amountGbp });
  if (problem) return refused(problem);
  if (detail.length < 10) return refused("Describe what was found, and where.");

  const label = RISK_TRIGGERS.find((t) => t.id === trigger)!.label;
  await db.$transaction(async (tx) => {
    await tx.screeningException.create({
      data: {
        fileId: f.id,
        kind: "risk_finding",
        state: "awaiting_representation",
        trigger,
        amountGbp,
        detail,
        raisedById: session.userId,
        representationInvitedAt: new Date(),
      },
    });
    await fileEvent(
      tx,
      session,
      f,
      "screening.exception_raised",
      `Risk finding: ${label}${amountGbp ? ` (£${amountGbp.toLocaleString("en-GB")})` : ""}. File paused; representation invited (7.4f).`,
    );
    await settleFileStatus(tx, f.id);
  });
  refresh(f);
  return ok("Finding recorded. The file is paused and the individual is invited to make representation.");
}

export async function requestExtension(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("screening.exception.raise");
  if (error || !session) return error!;

  const f = await loadFile(String(formData.get("fileId") ?? ""));
  if (!f) return refused("That file no longer exists.");
  const blocked = raiserRefusal(f, session.userId);
  if (blocked) return blocked;
  const detail = String(formData.get("detail") ?? "").trim();

  const problem = extensionProblem({ file: toCoreScreeningFile(f, f.personId), openKinds: openKinds(f) });
  if (problem) return refused(problem);
  if (detail.length < 10) return refused("Say what is still outstanding and who has not replied.");

  try {
    await db.$transaction(async (tx) => {
      await tx.screeningException.create({
        data: {
          fileId: f.id,
          kind: "extension",
          state: "awaiting_decision",
          weeks: MAX_EXTENSION_WEEKS,
          detail,
          raisedById: session.userId,
        },
      });
      await decisionTask(tx, f, "extension");
      await fileEvent(tx, session, f, "screening.exception_raised", `Four-week extension requested (7.6): ${detail}`);
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return refused("An extension request is already waiting for a decision.");
    }
    throw err;
  }
  refresh(f);
  return ok("Extension requested. It is with Higher Management to decide.");
}

export async function requestDeclaration(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("screening.exception.raise");
  if (error || !session) return error!;

  const f = await loadFile(String(formData.get("fileId") ?? ""));
  if (!f) return refused("That file no longer exists.");
  const blocked = raiserRefusal(f, session.userId);
  if (blocked) return blocked;

  const periodFrom = new Date(`${String(formData.get("periodFrom") ?? "")}T00:00:00Z`);
  const periodTo = new Date(`${String(formData.get("periodTo") ?? "")}T00:00:00Z`);
  const detail = String(formData.get("detail") ?? "").trim();
  const alreadyApproved = f.decisions.some((d) => d.kind === "statutory_declaration" && d.outcome === "approved");
  const problem = declarationProblem({ from: periodFrom, to: periodTo, openKinds: openKinds(f), alreadyApproved });
  if (problem) return refused(problem);
  if (detail.length < 10) return refused("Say why this period cannot be verified — what was tried.");

  try {
    await db.$transaction(async (tx) => {
      await tx.screeningException.create({
        data: {
          fileId: f.id,
          kind: "statutory_declaration",
          state: "awaiting_decision",
          periodFrom,
          periodTo,
          detail,
          raisedById: session.userId,
        },
      });
      await decisionTask(tx, f, "statutory_declaration");
      await fileEvent(
        tx,
        session,
        f,
        "screening.exception_raised",
        `Statutory declaration requested for ${periodFrom.toISOString().slice(0, 10)} to ${periodTo.toISOString().slice(0, 10)} (7.7i).`,
      );
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return refused("A statutory declaration request is already waiting for a decision.");
    }
    throw err;
  }
  refresh(f);
  return ok("Statutory declaration requested. It needs Higher Management's approval before it is obtained.");
}

// ---------------------------------------------------------------------------
// The individual's representation [7.4f]
// ---------------------------------------------------------------------------

export async function recordRepresentation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("screening.exception.raise");
  if (error || !session) return error!;

  const ex = await db.screeningException.findUnique({ where: { id: String(formData.get("exceptionId") ?? "") } });
  if (!ex) return refused("That case no longer exists.");
  const f = await loadFile(ex.fileId);
  if (!f) return refused("That file no longer exists.");
  if (f.administratorUserId !== session.userId) return refused("The representation is recorded by the file's administrator.");
  if (ex.state !== "awaiting_representation") return refused("The representation has already been recorded.");

  const none = formData.get("none") === "on";
  const text = String(formData.get("representation") ?? "").trim();
  if (text.length < 5) {
    return refused(none ? "Say how the invitation was made and when, so the record shows the chance was given." : "Record what the individual said.");
  }
  const representation = none ? `No representation made. ${text}` : text;

  await db.$transaction(async (tx) => {
    await tx.screeningException.update({
      where: { id: ex.id },
      data: {
        state: "awaiting_decision",
        representation,
        representationRecordedAt: new Date(),
        representationRecordedById: session.userId,
      },
    });
    await decisionTask(tx, f, ex.kind as ExceptionKind);
    await fileEvent(
      tx,
      session,
      f,
      "screening.representation_recorded",
      `${none ? "No representation made" : "Representation recorded"} on the ${EXCEPTION_LABELS[ex.kind as ExceptionKind].toLowerCase()}. With Higher Management to decide.`,
    );
  });
  refresh(f);
  return ok("Recorded. The case is with Higher Management to decide.");
}

// ---------------------------------------------------------------------------
// Higher Management's decision
// ---------------------------------------------------------------------------

export async function decideException(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("screening.exception.decide");
  if (error || !session) return error!;

  const ex = await db.screeningException.findUnique({ where: { id: String(formData.get("exceptionId") ?? "") } });
  if (!ex) return refused("That case no longer exists.");
  const f = await loadFile(ex.fileId);
  if (!f) return refused("That file no longer exists.");
  if (f.status === "withdrawn" || f.status === "unsuccessful") return refused("This file has ended; there is nothing left to decide.");

  const kind = ex.kind as ExceptionKind;
  const outcome = String(formData.get("outcome") ?? "") as DecisionOutcome;
  const rationale = String(formData.get("rationale") ?? "").trim();
  const me = await db.user.findUniqueOrThrow({ where: { id: session.userId }, select: { personId: true } });
  const problem = decisionProblem({
    state: ex.state,
    deciderUserId: session.userId,
    deciderPersonId: me.personId,
    subjectPersonId: f.personId,
    raisedById: ex.raisedById,
  });
  if (problem) return refused(problem);
  if (!outcomesFor(kind).includes(outcome)) return refused("Choose an outcome.");
  if (rationale.length < 10) return refused("Write down the grounds for the decision (7.4f). They are what an auditor reads.");

  const favourable = outcome === "accepted" || outcome === "approved";
  if (kind === "extension" && favourable) {
    const p = extensionApprovalProblem(toCoreScreeningFile(f, f.personId));
    if (p) return refused(p);
  }

  const now = new Date();
  const ends = !favourable && (kind === "risk_finding" || kind === "adverse_finding");
  const candidacy = f.person.candidacies[0];
  const withdrawCandidacy = ends && candidacy && !END_STAGES.includes(candidacy.stage as never);
  const employed = ends && f.person.employment && f.person.employment.state !== "ended";

  await db.$transaction(async (tx) => {
    const decision = await tx.screeningDecision.create({
      data: {
        fileId: f.id,
        kind: DECISION_KIND[kind],
        outcome,
        decidedById: session.userId,
        decidedAt: now,
        rationale,
        amountGbp: ex.amountGbp,
      },
    });
    await tx.screeningException.update({ where: { id: ex.id }, data: { state: "decided", decisionId: decision.id } });
    await tx.workItem.updateMany({
      where: {
        screeningFileId: f.id,
        title: decisionTaskTitle(kind, f.person.fullName),
        state: { in: ["open", "blocked"] },
      },
      data: { state: "done", doneAt: now },
    });

    if (kind === "extension" && favourable) {
      await tx.screeningFile.update({
        where: { id: f.id },
        data: { extensionWeeks: MAX_EXTENSION_WEEKS, extensionApprovedById: session.userId, extensionApprovedAt: now },
      });
      // If the sweep had already expired the file, its stand-down tasks no
      // longer hold: the extension puts the officer back inside the period.
      await tx.workItem.updateMany({
        where: {
          state: { in: ["open", "blocked"] },
          OR: [
            { screeningFileId: f.id, title: { contains: "screening not completed in time" } },
            { personId: f.personId, title: { contains: "screening period expired" } },
          ],
        },
        data: { state: "cancelled" },
      });
    }
    if (kind === "adverse_finding" && favourable && ex.checkId) {
      // Accepted: the check goes back to the administrator to settle properly.
      const check = f.checks.find((c) => c.id === ex.checkId);
      await tx.screeningCheck.update({
        where: { id: ex.checkId },
        data: {
          status: "received",
          notes: `${check?.notes ? `${check.notes}\n` : ""}${now.toISOString().slice(0, 10)}: Finding accepted by Higher Management — re-verify.`,
        },
      });
    }

    if (ends) {
      // Screening has ended unsuccessfully. The file is kept as an unsuccessful
      // applicant's record for 12 months, then disposed of (11.1, C14).
      const retainUntil = new Date(now);
      retainUntil.setMonth(retainUntil.getMonth() + RETENTION.unsuccessfulApplicantMonths);
      await tx.screeningFile.update({ where: { id: f.id }, data: { status: "unsuccessful", retainUntil } });
      await tx.workItem.updateMany({
        where: { screeningFileId: f.id, state: { in: ["open", "blocked"] } },
        data: { state: "cancelled" },
      });
      if (withdrawCandidacy) {
        await tx.candidacy.update({
          where: { id: candidacy!.id },
          data: { stage: "withdrawn", stageSince: now, withdrawnReason: "Screening unsuccessful" },
        });
        await tx.event.create({
          data: {
            type: "candidacy.withdrawn",
            actorUserId: session.userId,
            actorRole: session.activeRole,
            department: "recruitment",
            personId: f.personId,
            detail: "Withdrawn: screening unsuccessful.",
          },
        });
      }
      if (employed) {
        const pin = f.person.employment!.pin;
        const tomorrow = new Date(now.getTime() + 86_400_000);
        await tx.workItem.createMany({
          data: [
            {
              title: `Do not roster: ${f.person.fullName} (PIN ${pin}) — screening unsuccessful`,
              personId: f.personId,
              ownerRole: "control",
              dueAt: tomorrow,
              slaDays: 1,
            },
            {
              title: `Conditional employment to end: ${f.person.fullName} (PIN ${pin}) — screening unsuccessful`,
              personId: f.personId,
              ownerRole: "recruitment_manager",
              dueAt: tomorrow,
              slaDays: 1,
            },
          ],
        });
      }
    }

    await fileEvent(
      tx,
      session,
      f,
      "screening.decided",
      `${EXCEPTION_LABELS[kind]}: ${OUTCOME_LABELS[outcome].toLowerCase()}. ${rationale}${ends ? " Screening unsuccessful." : ""}`,
    );
    await settleFileStatus(tx, f.id, now);
  });

  refresh(f);
  return ok(
    ends
      ? `Declined. Screening is unsuccessful${withdrawCandidacy ? " and the application has been withdrawn" : ""}${employed ? "; Control and the HR Manager have been told" : ""}.`
      : kind === "extension" && favourable
        ? "Extension approved. Four weeks added to the clock."
        : kind === "statutory_declaration" && favourable
          ? "Approved. The administrator can now obtain the signed declaration for that period."
          : kind === "adverse_finding" && favourable
            ? "Accepted. The check has gone back to the administrator to re-verify."
            : `${OUTCOME_LABELS[outcome]}.`,
  );
}

// ---------------------------------------------------------------------------
// The clock sweep, by hand
// ---------------------------------------------------------------------------

export async function runClockSweep(
  _prev: ActionResult | null,
  _formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("screening.sweep");
  if (error || !session) return error!;

  const r = await sweepScreeningClocks({ actorUserId: session.userId, actorRole: session.activeRole });
  revalidatePath("/vetting");
  revalidatePath("/tasks");
  revalidatePath("/");
  return ok(
    r.expired.length
      ? `Checked ${r.checked} file(s). Expired: ${r.expired.join(", ")}. Control and the HR Manager have tasks.`
      : `Checked ${r.checked} file(s) on the clock. None has run out.`,
  );
}

