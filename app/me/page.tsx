import { redirect } from "next/navigation";
import { MyDuties } from "@/components/me/MyDuties";
import { roleHome } from "@/lib/accounts";
import { requireSession } from "@/lib/auth/server";
import { getControlPhone, getMyAlerts, getMyAvailability, getMyLeave, getMyOpenShifts } from "@/lib/db/me";
import { vapidPublicKey } from "@/lib/db/push";
import { getMyDuties } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * The officer's portal. Everything on it is theirs: the duties, the open
 * shifts and the availability are read by the person on the session, never by
 * anything the page asks for.
 */
export default async function MyDutiesPage() {
  const session = await requireSession();
  if (session.activeRole !== "officer") redirect(roleHome(session.activeRole));
  const [rows, alerts, openShifts, availability, controlPhone, leave] = await Promise.all([
    getMyDuties(session.personId),
    getMyAlerts(session.userId),
    getMyOpenShifts(session.personId),
    getMyAvailability(session.personId),
    getControlPhone(),
    getMyLeave(session.personId),
  ]);
  return (
    <MyDuties
      rows={rows}
      alerts={alerts}
      name={session.name}
      pin={rows[0]?.pin ?? null}
      controlPhone={controlPhone}
      vapidKey={vapidPublicKey()}
      openShifts={openShifts}
      availability={availability}
      leave={leave}
    />
  );
}
