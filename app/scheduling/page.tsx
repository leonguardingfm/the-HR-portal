import { RotaBoard } from "@/components/scheduling/RotaBoard";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { getPublicationChecks, getRotaRows } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function SchedulingPage() {
  const session = await requireSession();
  const [rows, checks] = await Promise.all([getRotaRows(), getPublicationChecks()]);
  return (
    <RotaBoard
      rows={rows}
      checks={checks}
      publishDenied={deniedReason(session.activeRole, "assignment.publish")}
    />
  );
}
