"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import {
  KIND_LABELS,
  METHOD_LABELS,
  requestProblem,
  verifyProblem,
  type HistoryKind,
  type HistoryMethod,
  type Period,
} from "@/lib/core/history";
import { syncHistoryFigures } from "@/lib/db/history-sync";
import type { Role } from "@/lib/types";
import { refused, ok, type ActionResult } from "./types";

/**
 * Career and history: adding a period, the permission to contact a current
 * employer, reference requests and chasers, and verification.
 *
 * Same shape as every other write: guard, re-read, then write with the event
 * in the same transaction — and after every write the file's figures are
 * recalculated from the timeline (lib/db/history-sync.ts). The rules are
 * lib/core/history.ts; prisma/constraints.sql §14 refuses what slips past.
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

const KINDS: HistoryKind[] = ["employment", "self_employment", "education", "unemployment", "career_break", "residence_abroad", "gap"];
const METHODS: HistoryMethod[] = ["reference", "documentary", "government_record"];

const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const findFile = (id: string) =>
  db.screeningFile.findUnique({
    where: { id },
    include: { person: { include: { candidacies: { orderBy: { stageSince: "desc" }, take: 1, select: { id: true } } } } },
  });
type File = NonNullable<Awaited<ReturnType<typeof findFile>>>;
type Row = NonNullable<Awaited<ReturnType<typeof db.historyPeriod.findUnique>>>;

/** The history is worked by the file's administrator, on a file still open. */
async function loadForAdmin(fileId: string, userId: string): Promise<{ error: ActionResult } | { f: File }> {
  const f = await findFile(fileId);
  if (!f) return { error: refused("That file no longer exists.") };
  if (f.administratorUserId !== userId) return { error: refused("The history on a file is recorded by its administrator.") };
  if (f.controllerReview2At || ["complete", "withdrawn", "unsuccessful"].includes(f.status)) {
    return { error: refused("This file has ended. It is kept as a record.") };
  }
  if (f.status === "controller_review_1" || f.status === "controller_review_2") {
    return { error: refused("The file is with its controller for review. It comes back to you if anything needs changing.") };
  }
  return { f };
}

async function loadPeriod(periodId: string, userId: string): Promise<{ error: ActionResult } | { p: Row; f: File }> {
  const p = await db.historyPeriod.findUnique({ where: { id: periodId } });
  if (!p) return { error: refused("That period no longer exists.") };
  const loaded = await loadForAdmin(p.fileId, userId);
  if ("error" in loaded) return loaded;
  return { p, f: loaded.f };
}

function event(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  session: { userId: string; activeRole: Role },
  f: { id: string; personId: string },
  detail: string,
) {
  return tx.event.create({
    data: {
      type: "screening.history_updated",
      actorUserId: session.userId,
      actorRole: session.activeRole,
      department: "vetting",
      personId: f.personId,
      screeningFileId: f.id,
      detail,
    },
  });
}

const refresh = (f: { id: string; person: { candidacies: { id: string }[] } }) => {
  revalidatePath(`/vetting/${f.id}`);
  revalidatePath("/vetting");
  const c = f.person.candidacies[0];
  if (c) revalidatePath(`/candidates/${c.id}`);
};

const describe = (p: { kind: string; organisation: string | null }) =>
  `${KIND_LABELS[p.kind as HistoryKind]}${p.organisation ? ` at ${p.organisation}` : ""}`;

// ---------------------------------------------------------------------------

export async function addHistoryPeriod(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("screening.check");
  if (error || !session) return error!;

  const loaded = await loadForAdmin(String(formData.get("fileId") ?? ""), session.userId);
  if ("error" in loaded) return loaded.error;
  const { f } = loaded;

  const kind = String(formData.get("kind") ?? "") as HistoryKind;
  const organisation = String(formData.get("organisation") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "").trim() || null;
  const statedFrom = date(formData.get("statedFrom"));
  const isCurrent = formData.get("isCurrent") === "on";
  const statedTo = isCurrent ? null : date(formData.get("statedTo"));
  const permissionRaw = String(formData.get("permissionToContact") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!KINDS.includes(kind)) return refused("Choose what the period was.");
  if (!statedFrom) return refused("Give the date the period started.");
  if (!isCurrent && !statedTo) return refused("Give the date it ended, or tick that it is continuing.");
  if (statedTo === undefined) return refused("That end date is not valid.");
  if (statedTo && statedFrom > statedTo) return refused("The period ends before it starts.");
  if (statedFrom > new Date()) return refused("A period in the history cannot start in the future.");
  if ((kind === "employment" || kind === "self_employment" || kind === "education") && !organisation) {
    return refused("Name the employer, business or school.");
  }

  await db.$transaction(async (tx) => {
    await tx.historyPeriod.create({
      data: {
        fileId: f.id,
        kind,
        organisation,
        role,
        statedFrom,
        statedTo,
        isCurrent,
        permissionToContact: isCurrent && kind === "employment" ? (permissionRaw === "yes" ? true : permissionRaw === "no" ? false : null) : null,
        notes,
      },
    });
    await event(tx, session, f, `History: ${describe({ kind, organisation })} added, ${statedFrom.toISOString().slice(0, 10)} to ${statedTo ? statedTo.toISOString().slice(0, 10) : "now"}.`);
    await syncHistoryFigures(tx, f.id);
  });
  refresh(f);
  return ok("Period added. The file's figures are recalculated from the timeline.");
}

export async function recordPermission(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("screening.check");
  if (error || !session) return error!;

  const loaded = await loadPeriod(String(formData.get("periodId") ?? ""), session.userId);
  if ("error" in loaded) return loaded.error;
  const { p, f } = loaded;
  if (!p.isCurrent) return refused("Permission is only needed to approach a current employer (7.7b).");
  const answer = String(formData.get("permission") ?? "");
  if (answer !== "yes" && answer !== "no") return refused("Say whether permission was given.");
  if (p.firstRequestAt) return refused("A request has already gone to this employer.");

  await db.$transaction(async (tx) => {
    await tx.historyPeriod.update({ where: { id: p.id }, data: { permissionToContact: answer === "yes" } });
    await event(tx, session, f, `Permission to contact ${p.organisation ?? "the current employer"}: ${answer === "yes" ? "given" : "withheld"} (7.7b).`);
  });
  refresh(f);
  return ok(answer === "yes" ? "Permission recorded." : "Recorded as withheld. Verify this period from documents for now (7.3.3a).");
}

export async function requestReference(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("screening.check");
  if (error || !session) return error!;

  const loaded = await loadPeriod(String(formData.get("periodId") ?? ""), session.userId);
  if ("error" in loaded) return loaded.error;
  const { p, f } = loaded;
  const verifierName = String(formData.get("verifierName") ?? "").trim();
  const verifierContact = String(formData.get("verifierContact") ?? "").trim();
  const contactVerifiedHow = String(formData.get("contactVerifiedHow") ?? "").trim();

  const problem = requestProblem(p as Period, contactVerifiedHow);
  if (problem) return refused(problem);
  if (p.firstRequestAt) return refused("The first request has already gone. Send the second request instead.");
  if (!verifierName || !verifierContact) return refused("Say who the request went to and how to reach them.");

  await db.$transaction(async (tx) => {
    await tx.historyPeriod.update({
      where: { id: p.id },
      data: { verifierName, verifierContact, contactVerifiedHow, firstRequestAt: new Date() },
    });
    await event(tx, session, f, `History: 1st reference request sent for ${describe(p)} to ${verifierName}. Contact established: ${contactVerifiedHow}.`);
    await syncHistoryFigures(tx, f.id);
  });
  refresh(f);
  return ok("First request recorded. The second is due in 10 working days if nothing comes back.");
}

export async function chaseReference(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("screening.check");
  if (error || !session) return error!;

  const loaded = await loadPeriod(String(formData.get("periodId") ?? ""), session.userId);
  if ("error" in loaded) return loaded.error;
  const { p, f } = loaded;
  if (p.verifiedAt) return refused("This period is already verified.");
  if (!p.firstRequestAt) return refused("Send the first request before a chaser.");
  if (p.secondRequestAt) return refused("The second request has already gone. Next is the documentary route.");

  await db.$transaction(async (tx) => {
    await tx.historyPeriod.update({ where: { id: p.id }, data: { secondRequestAt: new Date() } });
    await event(tx, session, f, `History: 2nd request sent for ${describe(p)}.`);
    await syncHistoryFigures(tx, f.id);
  });
  refresh(f);
  return ok("Second request recorded.");
}

export async function verifyPeriod(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("screening.check");
  if (error || !session) return error!;

  const loaded = await loadPeriod(String(formData.get("periodId") ?? ""), session.userId);
  if ("error" in loaded) return loaded.error;
  const { p, f } = loaded;
  const method = String(formData.get("method") ?? "") as HistoryMethod;
  const documentStart = String(formData.get("documentStart") ?? "").trim();
  const documentEnd = String(formData.get("documentEnd") ?? "").trim();
  const contactVerifiedHow = String(formData.get("contactVerifiedHow") ?? "").trim() || p.contactVerifiedHow;
  const confirmedFrom = date(formData.get("confirmedFrom"));
  const confirmedTo = date(formData.get("confirmedTo"));
  const notes = String(formData.get("notes") ?? "").trim();
  if (confirmedFrom === undefined || confirmedTo === undefined) return refused("A confirmed date is not valid.");

  const problem = verifyProblem({
    period: p as Period,
    method,
    contactVerifiedHow,
    documentStart,
    documentEnd,
    confirmedFrom,
    confirmedTo,
  });
  if (problem) return refused(problem);
  if (!METHODS.includes(method)) return refused("Choose how it was verified.");

  await db.$transaction(async (tx) => {
    await tx.historyPeriod.update({
      where: { id: p.id },
      data: {
        method,
        verifiedAt: new Date(),
        verifiedById: session.userId,
        contactVerifiedHow,
        documentStart: method === "documentary" ? documentStart : null,
        documentEnd: method === "documentary" ? documentEnd : null,
        confirmedFrom,
        confirmedTo,
        notes: notes ? `${p.notes ? `${p.notes}\n` : ""}${notes}` : p.notes,
      },
    });
    await event(
      tx,
      session,
      f,
      `History: ${describe(p)} verified — ${METHOD_LABELS[method].toLowerCase()}${method === "documentary" ? ` (${documentStart}; ${documentEnd})` : ""}.`,
    );
    await syncHistoryFigures(tx, f.id);
  });
  refresh(f);
  return ok("Verified. The file's figures are recalculated.");
}

/** Only a period nothing has been done with yet: once a request has gone, it is part of the record. */
export async function removeHistoryPeriod(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("screening.check");
  if (error || !session) return error!;

  const loaded = await loadPeriod(String(formData.get("periodId") ?? ""), session.userId);
  if ("error" in loaded) return loaded.error;
  const { p, f } = loaded;
  if (p.verifiedAt || p.firstRequestAt) {
    return refused("A period that has been requested or verified stays on the record. Correct it with a note instead.");
  }

  await db.$transaction(async (tx) => {
    await tx.historyPeriod.delete({ where: { id: p.id } });
    await event(tx, session, f, `History: ${describe(p)} removed before any request was made.`);
    await syncHistoryFigures(tx, f.id);
  });
  refresh(f);
  return ok("Removed.");
}
