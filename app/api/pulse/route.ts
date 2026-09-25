import { getSession } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { getPulse } from "@/lib/db/pulse";

/** Never cached: it is the answer to "has anything changed?". */
export const dynamic = "force-dynamic";

/**
 * What an open screen polls to stay current. Any signed-in person may ask,
 * officers included; the answer is only ever about them — their own alerts,
 * and a version that moves with what concerns them.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ signedOut: true }, { status: 401, headers: { "Cache-Control": "no-store" } });
  // A screen open in front of someone is someone on shift (26 September 2026):
  // without this, watching the hub for twenty minutes without clicking looked
  // like going home, and their work was flagged for handover. At most one
  // write a minute, however often the screen asks.
  if (new URL(request.url).searchParams.get("here") === "1") {
    await db.workSession
      .updateMany({ where: { id: session.workSessionId, signedOutAt: null, lastSeenAt: { lt: new Date(Date.now() - 60_000) } }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }
  const pulse = await getPulse(session);
  return Response.json(pulse, { headers: { "Cache-Control": "no-store" } });
}
