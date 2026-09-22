import { LiveBoard, type LiveFocus } from "@/components/live/LiveBoard";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { getLiveRows, getOpenIncidents } from "@/lib/db/queries";

/** Live, so it is never served from a cache. */
export const dynamic = "force-dynamic";

/**
 * Book-ons and check calls are views of this board, not screens of their own.
 * The navigation links to `?view=`; the board narrows. One set of rows, three
 * ways in.
 */
const VIEWS: Record<string, LiveFocus> = {
  "book-ons": "book_ons",
  "check-calls": "check_calls",
};

export default async function LivePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireSession();
  const { view } = await searchParams;
  const [rows, incidents] = await Promise.all([getLiveRows(), getOpenIncidents()]);

  // Worked out here, on the server, from the signed session. The buttons only
  // reflect it; the actions check it again before they write.
  const perms = {
    checkCall: deniedReason(session.activeRole, "check_call.record"),
    attempt: deniedReason(session.activeRole, "contact_attempt.log"),
    bookOn: deniedReason(session.activeRole, "book_on.record"),
    notify: deniedReason(session.activeRole, "incident.notify_client"),
  };

  return (
    <LiveBoard
      rows={rows}
      incidents={incidents}
      perms={perms}
      focus={(view && VIEWS[view]) || "all"}
    />
  );
}
