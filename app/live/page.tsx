import { LiveBoard } from "@/components/live/LiveBoard";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { getLiveRows, getOpenIncidents } from "@/lib/db/queries";

/** Live, so it is never served from a cache. */
export const dynamic = "force-dynamic";

export default async function LivePage() {
  const session = await requireSession();
  const [rows, incidents] = await Promise.all([getLiveRows(), getOpenIncidents()]);

  // Worked out here, on the server, from the signed session. The buttons only
  // reflect it; the actions check it again before they write.
  const perms = {
    checkCall: deniedReason(session.activeRole, "check_call.record"),
    attempt: deniedReason(session.activeRole, "contact_attempt.log"),
    bookOn: deniedReason(session.activeRole, "book_on.record"),
    notify: deniedReason(session.activeRole, "incident.notify_client"),
  };

  return <LiveBoard rows={rows} incidents={incidents} perms={perms} />;
}
