/**
 * Welfare visits under way, and who can be sent — for the check-calls page.
 * A visit stays on the page until what was found is recorded, even if the
 * shift itself has ended meanwhile.
 */

import { db } from "./client";
import { usersHolding } from "./push";

export interface OpenWelfareVisit {
  id: string;
  assignmentId: string;
  officer: string;
  officerPhone: string | null;
  where: string;
  attendeeKind: "supervisor" | "operations_manager";
  attendeeName: string;
  attendeePhone: string | null;
  dispatchedAt: string;
  expectedBy: string;
  arrivedAt: string | null;
}

export async function getOpenWelfareVisits(): Promise<OpenWelfareVisit[]> {
  const rows = await db.welfareVisit.findMany({
    where: { closedAt: null },
    orderBy: { dispatchedAt: "asc" },
    include: { assignment: { include: { person: { select: { fullName: true, phone: true } }, post: { include: { site: true } } } } },
  });
  return rows.map((v) => ({
    id: v.id,
    assignmentId: v.assignmentId,
    officer: v.assignment.person.fullName,
    officerPhone: v.assignment.person.phone,
    where: `${v.assignment.post.name}, ${v.assignment.post.site.name}`,
    attendeeKind: v.attendeeKind,
    attendeeName: v.attendeeName,
    attendeePhone: v.attendeePhone,
    dispatchedAt: v.dispatchedAt.toISOString(),
    expectedBy: v.expectedBy.toISOString(),
    arrivedAt: v.arrivedAt?.toISOString() ?? null,
  }));
}

/** The Operations Managers who can be sent, with their phones. */
export async function getOperationsManagers(): Promise<{ id: string; name: string; phone: string | null }[]> {
  const ids = await usersHolding(["operations_manager"]);
  const users = await db.user.findMany({ where: { id: { in: ids } }, include: { person: { select: { phone: true } } }, orderBy: { displayName: "asc" } });
  return users.map((u) => ({ id: u.id, name: u.displayName, phone: u.person.phone }));
}
