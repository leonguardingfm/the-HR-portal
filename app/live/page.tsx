import { redirect } from "next/navigation";
import { after } from "next/server";
import { LiveBoard, type LiveFocus } from "@/components/live/LiveBoard";
import { sweepDutyChecks } from "@/lib/db/duty-sweep";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { getLiveRows, getOpenIncidents } from "@/lib/db/queries";

/** Live, so it is never served from a cache. */
export const dynamic = "force-dynamic";

/**
 * Everything on one board. Chase-ups, book-ons and check calls each have a
 * page of their own under /duty, where the work for that step is laid out;
 * this is the whole picture, with the same flow across the top.
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
  // Book-ons and check calls have pages of their own now; old links still land.
  if (view === "book-ons") redirect("/duty/book-ons");
  if (view === "check-calls") redirect("/duty/check-calls");
  const [rows, incidents] = await Promise.all([getLiveRows(), getOpenIncidents()]);
  after(() => sweepDutyChecks());

  // Worked out here, on the server, from the signed session. The buttons only
  // reflect it; the actions check it again before they write.
  const perms = {
    checkCall: deniedReason(session.activeRole, "check_call.record"),
    attempt: deniedReason(session.activeRole, "contact_attempt.log"),
    bookOn: deniedReason(session.activeRole, "book_on.record"),
    notify: deniedReason(session.activeRole, "incident.notify_client"),
    noSignalNotify: deniedReason(session.activeRole, "no_signal.notify_client"),
    noSignalLoss: deniedReason(session.activeRole, "no_signal.report_loss"),
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
