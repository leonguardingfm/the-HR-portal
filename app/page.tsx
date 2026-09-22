import { DashboardView } from "@/components/dashboard/DashboardView";
import { requireSession } from "@/lib/auth/server";
import {
  getDashboardCounts,
  getLiveRows,
  getPresence,
  getRecentEvents,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession();
  const [liveRows, events, counts, presence] = await Promise.all([
    getLiveRows(),
    getRecentEvents(7),
    getDashboardCounts(),
    getPresence(),
  ]);
  return (
    <DashboardView
      liveRows={liveRows}
      events={events}
      counts={counts}
      presence={presence}
      role={session.activeRole}
      name={session.name}
      userId={session.userId}
    />
  );
}
