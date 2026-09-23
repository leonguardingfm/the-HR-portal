/**
 * Settling a screening file's status after a write.
 *
 * One place, so the check editor, the controller review, the exception
 * decisions and the clock sweep all agree on what a file's status is. The
 * rule itself is fileStatus in lib/core/screening-exceptions.ts.
 */

import type { Prisma } from "@prisma/client";
import { fileStatus } from "@/lib/core/screening-exceptions";
import { toCoreScreeningFile } from "./queries";

export async function settleFileStatus(tx: Prisma.TransactionClient, fileId: string, now = new Date()) {
  const f = await tx.screeningFile.findUniqueOrThrow({
    where: { id: fileId },
    include: { checks: true, exceptions: { where: { state: { not: "decided" } }, select: { kind: true } } },
  });
  const status = fileStatus(
    toCoreScreeningFile(f, f.personId),
    f.exceptions.map((e) => e.kind),
    now,
  );
  if (status !== f.status) await tx.screeningFile.update({ where: { id: fileId }, data: { status } });
  return status;
}
