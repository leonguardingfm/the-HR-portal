/**
 * The screening clock sweep [7.6].
 *
 * Finds every file whose period has run out without full screening complete,
 * marks it Time expired, and puts the consequence in front of the people who
 * act on it: Control, who would otherwise keep rostering the officer, and the
 * HR Manager, who ends the conditional employment. Deployability already
 * reads Time expired as a hard stop (lib/core/deployability.ts).
 *
 * Idempotent: a file it has expired is not expired twice. Run daily by
 * `npm run sweep:clocks`, or from the Vetting page.
 */

import { isExpiredOnClock } from "@/lib/core/screening-exceptions";
import { clockState } from "@/lib/bs7858";
import { formatDate } from "@/lib/format";
import type { Role } from "@/lib/types";
import { db } from "./client";
import { toCoreScreeningFile } from "./queries";

export interface SweepResult {
  checked: number;
  expired: string[];
}

export async function sweepScreeningClocks(opts: {
  actorUserId?: string;
  actorRole?: Role;
  now?: Date;
} = {}): Promise<SweepResult> {
  const now = opts.now ?? new Date();
  const files = await db.screeningFile.findMany({
    where: {
      disposedAt: null,
      conditionalEmploymentStart: { not: null },
      controllerReview2At: null,
      status: { notIn: ["time_expired", "withdrawn", "unsuccessful", "complete"] },
    },
    include: { checks: true, person: { include: { employment: true } } },
  });

  const expired: string[] = [];
  for (const f of files) {
    const core = toCoreScreeningFile(f, f.personId);
    if (!isExpiredOnClock(core, now)) continue;
    const deadline = clockState(core, now)!.deadline;
    const pin = f.person.employment?.pin;
    const who = `${f.person.fullName}${pin ? ` (PIN ${pin})` : ""}`;
    const tomorrow = new Date(now.getTime() + 86_400_000);

    await db.$transaction([
      db.screeningFile.update({ where: { id: f.id }, data: { status: "time_expired" } }),
      db.event.create({
        data: {
          type: "screening.time_expired",
          ...(opts.actorUserId
            ? { actorUserId: opts.actorUserId, actorRole: opts.actorRole }
            : { actorSystem: "scheduler" }),
          department: "vetting",
          personId: f.personId,
          screeningFileId: f.id,
          detail: `Screening period ran out on ${formatDate(deadline)} without full screening complete. Must not continue in relevant employment (7.6).`,
        },
      }),
      db.workItem.create({
        data: {
          title: `Do not roster: ${who} — screening period expired (7.6)`,
          personId: f.personId,
          ownerRole: "control",
          dueAt: tomorrow,
          slaDays: 1,
        },
      }),
      db.workItem.create({
        data: {
          title: `Conditional employment must cease: ${who} — screening not completed in time (7.6)`,
          screeningFileId: f.id,
          ownerRole: "recruitment_manager",
          dueAt: tomorrow,
          slaDays: 1,
        },
      }),
    ]);
    expired.push(f.person.fullName);
  }
  return { checked: files.length, expired };
}
