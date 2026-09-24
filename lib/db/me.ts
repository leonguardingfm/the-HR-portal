/**
 * An officer's own portal: their alerts. Their duties come from getMyDuties
 * (./queries), filtered by their own person on the server.
 */

import { db } from "./client";

/** Open alerts addressed to this account — a missed book-on, an overdue check call. */
export async function getMyAlerts(userId: string) {
  const rows = await db.workItem.findMany({
    where: { ownerUserId: userId, state: "open" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, title: true, createdAt: true },
  });
  return rows.map((r) => ({ id: r.id, title: r.title, at: r.createdAt.toISOString() }));
}
