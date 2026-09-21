import { DashboardView } from "@/components/dashboard/DashboardView";
import { getDashboardCounts, getLiveRows, getRecentEvents } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [liveRows, events, counts] = await Promise.all([
    getLiveRows(),
    getRecentEvents(7),
    getDashboardCounts(),
  ]);
  return <DashboardView liveRows={liveRows} events={events} counts={counts} />;
}
