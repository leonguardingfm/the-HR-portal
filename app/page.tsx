import { after } from "next/server";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { sweepDutyChecks } from "@/lib/db/duty-sweep";
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
    getLiveRows(12),
    getRecentEvents(7),
    getDashboardCounts(),
    getPresence(),
    getClockRows(),
  ]);
  after(() => sweepDutyChecks());
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
