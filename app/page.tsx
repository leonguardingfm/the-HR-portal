import { DashboardView } from "@/components/dashboard/DashboardView";
import { requireSession } from "@/lib/auth/server";
import {
  getDashboardCounts,
  getLiveRows,
  getPresence,
  getRecentEvents,
} from "@/lib/db/queries";
import { getClockRows } from "@/lib/db/screening";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireSession();
  const [liveRows, events, counts, presence, clockFiles] = await Promise.all([
    getLiveRows(),
    getRecentEvents(7),
    getDashboardCounts(),
    getPresence(),
    getClockRows(),
  ]);
  return (
    <DashboardView
      liveRows={liveRows}
      events={events}
      counts={counts}
      presence={presence}
      clockFiles={clockFiles}
      role={session.activeRole}
      name={session.name}
      userId={session.userId}
    />
  );
}
