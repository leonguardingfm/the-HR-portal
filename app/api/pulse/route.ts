import { getSession } from "@/lib/auth/server";
import { getPulse } from "@/lib/db/pulse";

/** Never cached: it is the answer to "has anything changed?". */
export const dynamic = "force-dynamic";

/**
 * What an open screen polls to stay current. Any signed-in person may ask,
 * officers included; the answer is only ever about them — their own alerts,
 * and a version that moves with what concerns them.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ signedOut: true }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const pulse = await getPulse(session);
  return Response.json(pulse, { headers: { "Cache-Control": "no-store" } });
}
