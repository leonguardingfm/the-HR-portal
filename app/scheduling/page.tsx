import { RotaBoard } from "@/components/scheduling/RotaBoard";
import { getPublicationChecks, getRotaRows } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function SchedulingPage() {
  const [rows, checks] = await Promise.all([getRotaRows(), getPublicationChecks()]);
  return <RotaBoard rows={rows} checks={checks} />;
}
