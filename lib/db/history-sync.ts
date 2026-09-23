/**
 * Keeping a file's history figures true to its timeline.
 *
 * Once a file has history rows, its unverified days, its gaps over 31 days and
 * the two history checks on Form 2 are calculated from them after every change
 * — never typed. A file with no rows yet keeps the figures entered by hand, so
 * files opened before the timeline existed are not suddenly marked as having
 * five unverified years.
 */

import type { Prisma } from "@prisma/client";
import { analyseHistory, historyCheckStatus, screeningWindow, type Period } from "@/lib/core/history";
import { settleFileStatus } from "./screening-status";

export async function syncHistoryFigures(tx: Prisma.TransactionClient, fileId: string, now = new Date()) {
  const f = await tx.screeningFile.findUniqueOrThrow({
    where: { id: fileId },
    include: {
      history: true,
      checks: true,
      person: { select: { dateOfBirth: true } },
      exceptions: {
        where: { kind: "statutory_declaration", decision: { outcome: "approved" } },
        select: { periodFrom: true, periodTo: true },
      },
    },
  });
  if (f.history.length === 0) return null;

  const periods = f.history.map((h) => ({ ...h, kind: h.kind })) as Period[];
  const analysis = analyseHistory({
    periods,
    window: screeningWindow({ reference: f.openedAt, dateOfBirth: f.person.dateOfBirth, years: f.screeningPeriodYears }),
    reference: f.openedAt,
    declarations: f.exceptions
      .filter((e) => e.periodFrom && e.periodTo)
      .map((e) => ({ from: e.periodFrom!, to: e.periodTo! })),
  });

  await tx.screeningFile.update({
    where: { id: fileId },
    data: { unverifiedDays: analysis.unverifiedDays, gapsOver31Days: analysis.overLimit.length },
  });

  // The two Form 2 history checks, read off the timeline.
  for (const [clause, done] of [
    ["7.5.2a", analysis.limitedDone],
    ["7.7", analysis.fullDone],
  ] as const) {
    const check = f.checks.find((c) => c.group === "history" && c.clause === clause);
    if (!check) continue;
    const s = historyCheckStatus(done, periods);
    if (check.status === s.status && (s.status !== "verified" || check.confirmedAt)) continue;
    await tx.screeningCheck.update({
      where: { id: check.id },
      data: {
        status: s.status,
        firstRequestSentAt: s.firstRequestAt,
        secondRequestSentAt: s.secondRequestAt,
        confirmedAt: s.status === "verified" ? (check.confirmedAt ?? now) : null,
      },
    });
  }

  await settleFileStatus(tx, fileId, now);
  return analysis;
}
