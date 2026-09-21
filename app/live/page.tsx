import { LiveBoard } from "@/components/live/LiveBoard";
import { getLiveRows, getOpenIncidents } from "@/lib/db/queries";

/** Live, so it is never served from a cache. */
export const dynamic = "force-dynamic";

export default async function LivePage() {
  const [rows, incidents] = await Promise.all([getLiveRows(), getOpenIncidents()]);
  return <LiveBoard rows={rows} incidents={incidents} />;
}
