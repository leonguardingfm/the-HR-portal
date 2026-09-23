/**
 * When records fall due for disposal [11.1, 11.3, C14]. Pure.
 *
 * An unsuccessful applicant's screening records: 12 months after the
 * application ended. A leaver's: seven years after employment ceased.
 */

import { RETENTION } from "@/lib/bs7858";

export type DisposalKind = "candidacy" | "employment";

export function retentionDue(kind: DisposalKind, since: Date): Date {
  const due = new Date(since);
  if (kind === "candidacy") due.setMonth(due.getMonth() + RETENTION.unsuccessfulApplicantMonths);
  else due.setFullYear(due.getFullYear() + RETENTION.afterCessationYears);
  return due;
}

/** Due on the day itself, not the day after. */
export const isDue = (due: Date, now = new Date()) => due.getTime() <= now.getTime();
