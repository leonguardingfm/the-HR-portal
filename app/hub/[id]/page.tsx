import { notFound } from "next/navigation";
import { HubTaskView } from "@/components/hub/HubTaskView";
import { requireSession } from "@/lib/auth/server";
import { canDo } from "@/lib/auth/permissions";
import { getHubTask } from "@/lib/db/hub-queries";

export const dynamic = "force-dynamic";

/** One email or task on the Performance hub, with everything done to it. */
export default async function HubTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const t = await getHubTask(id, session);
  if (!t) notFound();
  return <HubTaskView t={t} meId={session.userId} can={{ work: canDo(session.activeRole, "hub.work"), supervise: canDo(session.activeRole, "hub.supervise") }} />;
}
