import { CheckCallBoard } from "@/components/duty/CheckCallBoard";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { getLiveRows } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function CheckCallsPage() {
  const session = await requireSession();
  const rows = await getLiveRows(12);
  return (
    <CheckCallBoard
      rows={rows}
      perms={{
        checkCall: deniedReason(session.activeRole, "check_call.record"),
        attempt: deniedReason(session.activeRole, "contact_attempt.log"),
        noSignalNotify: deniedReason(session.activeRole, "no_signal.notify_client"),
        noSignalLoss: deniedReason(session.activeRole, "no_signal.report_loss"),
      }}
    />
  );
}
