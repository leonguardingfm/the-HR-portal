/**
 * Retention and disposal [11.1, 11.3, C14].
 *
 * What is due, and destroying it. An unsuccessful applicant's screening file
 * and document copies go 12 months after the application ended; a leaver's
 * seven years after employment ceased. Disposal writes the disposal log (which
 * is append-only), marks the file and every document disposed — the rows
 * survive, so the record shows what existed — and deletes the stored copies.
 *
 * Nobody with a live application or current employment is ever in scope: their
 * records are still in use, whatever an old withdrawn application says.
 *
 * Run by a person, never on a schedule — confirmed 23 September 2026. Unlike
 * the clock sweep, disposal cannot be undone, so a Screening Controller or
 * higher management presses Dispose on each item the queue shows as due.
 */

import { RETENTION } from "@/lib/bs7858";
import { END_STAGES } from "@/lib/core/recruitment";
import { isDue, retentionDue, type DisposalKind } from "@/lib/core/retention";
import type { Role } from "@/lib/types";
import { deleteObject } from "@/lib/storage";
import { db } from "./client";

export { retentionDue, type DisposalKind } from "@/lib/core/retention";

/** What a person still holds that disposal would destroy. */
async function heldBy(personId: string) {
  const [files, copies] = await Promise.all([
    db.screeningFile.findMany({ where: { personId, disposedAt: null }, select: { id: true } }),
    db.documentRecord.findMany({
      where: {
        disposedAt: null,
        storageKey: { not: null },
        OR: [{ personId }, { screeningFile: { personId } }],
      },
      select: { id: true, storageKey: true },
    }),
  ]);
  return { files, copies };
}

/** Still in use: a live application, or employment that has not ended. */
async function stillInUse(personId: string) {
  const [live, employed] = await Promise.all([
    db.candidacy.count({ where: { personId, stage: { notIn: END_STAGES } } }),
    db.employment.count({ where: { personId, state: { not: "ended" } } }),
  ]);
  return live > 0 || employed > 0;
}

export interface RetentionItem {
  id: string;
  kind: DisposalKind;
  subjectId: string;
  description: string;
  rule: "unsuccessful_applicant_12_months" | "after_cessation_7_years";
  dueAt: Date;
  itemsHeld: number;
}

/**
 * Everyone who still holds something disposal would destroy, one entry each,
 * soonest first. No names: a queue that reproduces the data it is about to
 * destroy has not destroyed it.
 */
export async function retentionQueue(): Promise<RetentionItem[]> {
  const [withdrawn, leavers] = await Promise.all([
    db.candidacy.findMany({ where: { stage: "withdrawn" }, orderBy: { stageSince: "desc" } }),
    db.employment.findMany({ where: { endedAt: { not: null }, state: "ended" } }),
  ]);
  const items: RetentionItem[] = [];
  const seen = new Set<string>();

  for (const c of withdrawn) {
    if (seen.has(c.personId)) continue; // the latest withdrawal is the one that counts
    seen.add(c.personId);
    if (await stillInUse(c.personId)) continue;
    const held = await heldBy(c.personId);
    const n = held.files.length + held.copies.length;
    if (n === 0) continue;
    items.push({
      id: `ret-c-${c.id}`,
      kind: "candidacy",
      subjectId: c.id,
      description: `Application withdrawn ${c.stageSince.toISOString().slice(0, 7)} — screening file and documents`,
      rule: "unsuccessful_applicant_12_months",
      dueAt: retentionDue("candidacy", c.stageSince),
      itemsHeld: n,
    });
  }
  for (const e of leavers) {
    if (seen.has(e.personId)) continue;
    seen.add(e.personId);
    if (await stillInUse(e.personId)) continue;
    const held = await heldBy(e.personId);
    const n = held.files.length + held.copies.length;
    if (n === 0) continue;
    items.push({
      id: `ret-e-${e.id}`,
      kind: "employment",
      subjectId: e.id,
      description: `Employment ceased ${e.endedAt!.toISOString().slice(0, 7)} — employment and screening records`,
      rule: "after_cessation_7_years",
      dueAt: retentionDue("employment", e.endedAt!),
      itemsHeld: n,
    });
  }
  return items.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

export type DisposalOutcome =
  | { ok: true; destroyed: number; copiesNotDeleted: number }
  | { ok: false; reason: string };

/**
 * Dispose of one subject's records. Refused before the retention date, and for
 * anyone whose records are still in use.
 */
export async function disposeRecords(args: {
  kind: DisposalKind;
  subjectId: string;
  actor: { userId: string; role: Role };
  now?: Date;
}): Promise<DisposalOutcome> {
  const now = args.now ?? new Date();

  let personId: string;
  let since: Date;
  if (args.kind === "candidacy") {
    const c = await db.candidacy.findUnique({ where: { id: args.subjectId } });
    if (!c || c.stage !== "withdrawn") return { ok: false, reason: "Only a withdrawn application is disposed of under the 12-month rule." };
    personId = c.personId;
    since = c.stageSince;
  } else {
    const e = await db.employment.findUnique({ where: { id: args.subjectId } });
    if (!e || e.state !== "ended" || !e.endedAt) return { ok: false, reason: "Only ended employment is disposed of under the 7-year rule." };
    personId = e.personId;
    since = e.endedAt;
  }

  const due = retentionDue(args.kind, since);
  if (!isDue(due, now)) {
    return { ok: false, reason: `Not due until ${due.toISOString().slice(0, 10)}. Records are kept for the full period (11.1, 11.3).` };
  }
  if (await stillInUse(personId)) {
    return { ok: false, reason: "This person has a live application or current employment, so their records are still in use." };
  }

  const held = await heldBy(personId);
  const destroyed = held.files.length + held.copies.length;
  if (destroyed === 0) return { ok: false, reason: "Nothing is held for this person any more." };

  await db.$transaction([
    db.disposalRecord.create({
      data: {
        rule: args.kind === "candidacy" ? "unsuccessful_applicant_12_months" : "after_cessation_7_years",
        subjectDescription:
          args.kind === "candidacy"
            ? `Screening file and documents, application withdrawn ${since.toISOString().slice(0, 7)}`
            : `Employment and screening records, employment ceased ${since.toISOString().slice(0, 7)}`,
        personRef: personId,
        screeningFileRef: held.files[0]?.id ?? null,
        itemsDestroyed: destroyed,
        retainedInstead: "Outcome and date only, per the criminality document rule; document rows kept as a record of what existed",
        performedByUserId: args.actor.userId,
      },
    }),
    db.documentRecord.updateMany({
      where: { id: { in: held.copies.map((c) => c.id) } },
      data: { disposedAt: now },
    }),
    db.screeningFile.updateMany({
      where: { id: { in: held.files.map((f) => f.id) } },
      data: { disposedAt: now },
    }),
    db.event.create({
      data: {
        type: "disposal.recorded",
        actorUserId: args.actor.userId,
        actorRole: args.actor.role,
        department: "administration",
        detail: `${destroyed} item(s) destroyed under the ${
          args.kind === "candidacy" ? `${RETENTION.unsuccessfulApplicantMonths}-month` : `${RETENTION.afterCessationYears}-year`
        } rule, and written to the disposal log.`,
      },
    }),
  ]);

  // The copies go last: the record says they were destroyed, so they are.
  let copiesNotDeleted = 0;
  for (const c of held.copies) {
    try {
      await deleteObject(c.storageKey!);
    } catch {
      copiesNotDeleted++;
    }
  }
  if (copiesNotDeleted > 0) {
    await db.event.create({
      data: {
        type: "disposal.copy_delete_failed",
        actorSystem: "disposal",
        department: "administration",
        detail: `${copiesNotDeleted} stored cop${copiesNotDeleted === 1 ? "y" : "ies"} could not be deleted from storage and must be removed by hand.`,
      },
    });
  }
  return { ok: true, destroyed, copiesNotDeleted };
}
