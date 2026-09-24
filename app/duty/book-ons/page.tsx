import { after } from "next/server";
import { BookOnBoard } from "@/components/duty/BookOnBoard";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { sweepDutyChecks } from "@/lib/db/duty-sweep";
import { getLiveRows } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function BookOnsPage() {
  const session = await requireSession();
  const rows = await getLiveRows(12);
  after(() => sweepDutyChecks());
  return (
    <BookOnBoard
      rows={rows}
      perms={{
        bookOn: deniedReason(session.activeRole, "book_on.record"),
        attempt: deniedReason(session.activeRole, "contact_attempt.log"),
        cover: deniedReason(session.activeRole, "rota.change"),
        noSignalNotify: deniedReason(session.activeRole, "no_signal.notify_client"),
      }}
    />
  );
}
