import { redirect } from "next/navigation";
import { HubBoard } from "@/components/hub/HubBoard";
import { requireSession } from "@/lib/auth/server";
import { canDo } from "@/lib/auth/permissions";
import { departmentsOf } from "@/lib/core/hub";
import { db } from "@/lib/db/client";
import { getHubBoard, hubStaff, type HubTab } from "@/lib/db/hub-queries";

export const dynamic = "force-dynamic";

const TABS: HubTab[] = ["all", "mine", "unassigned", "attention", "waiting", "closed"];

/**
 * The Performance hub (Control, 25 September 2026): every email and task for
 * the departments this person works, most urgent first, each with one owner
 * and a clock. It keeps itself current; nobody needs to reload it.
 */
export default async function HubPage({ searchParams }: { searchParams: Promise<{ tab?: string; department?: string; q?: string; priority?: string }> }) {
  const session = await requireSession();
  const depts = departmentsOf(session.activeRole);
  if (!depts.length) redirect("/");
  const sp = await searchParams;
  const tab = TABS.includes(sp.tab as HubTab) ? (sp.tab as HubTab) : "all";
  const [board, staff, clients] = await Promise.all([
    getHubBoard(session, { tab, department: sp.department ?? null, q: sp.q ?? "", priority: sp.priority ?? null }),
    hubStaff(depts),
    db.client.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sites: { where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } } } }),
  ]);
  return (
    <HubBoard
      board={board}
      me={{ id: session.userId, name: session.name }}
      tab={tab}
      q={sp.q ?? ""}
      priority={sp.priority ?? null}
      can={{ work: canDo(session.activeRole, "hub.work"), test: canDo(session.activeRole, "hub.test") }}
      staff={staff}
      clients={clients}
    />
  );
}
