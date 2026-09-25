import { requireSession } from "@/lib/auth/server";
import { portalScope } from "@/lib/db/client-portal";

/** For a client portal page: the signed-in contact's client and sites, or null if the login is not linked. */
export async function clientScope() {
  const session = await requireSession();
  return portalScope(session);
}
