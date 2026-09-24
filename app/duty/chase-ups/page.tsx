import { after } from "next/server";
import { ChaseUpBoard } from "@/components/duty/ChaseUpBoard";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { sweepDutyChecks } from "@/lib/db/duty-sweep";
import { getLiveRows } from "@/lib/db/queries";
import { getOpenCoverNeeds } from "@/lib/db/rota";

export const dynamic = "force-dynamic";

export default async function ChaseUpsPage() {
  const session = await requireSession();
  const [rows, coverNeeds] = await Promise.all([getLiveRows(12), getOpenCoverNeeds()]);
  // The durable alerts, once the page is on its way: nothing waits on them.
  after(() => sweepDutyChecks());
  return <ChaseUpBoard rows={rows} coverNeeds={coverNeeds} denied={deniedReason(session.activeRole, "chase_up.record")} />;
}
