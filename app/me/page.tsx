import { redirect } from "next/navigation";
import { MyDuties } from "@/components/me/MyDuties";
import { roleHome } from "@/lib/accounts";
import { requireSession } from "@/lib/auth/server";
import { getMyAlerts } from "@/lib/db/me";
import { getMyDuties } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * The officer's portal. Everything on it is theirs: the duties are read by the
 * person on the session, never by anything the page asks for.
 */
export default async function MyDutiesPage() {
  const session = await requireSession();
  if (session.activeRole !== "officer") redirect(roleHome(session.activeRole));
  const [rows, alerts] = await Promise.all([getMyDuties(session.personId), getMyAlerts(session.userId)]);
  return <MyDuties rows={rows} alerts={alerts} name={session.name} pin={rows[0]?.pin ?? null} />;
}
