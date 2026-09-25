import { db } from "@/lib/db/client";
import { workerHealth } from "@/lib/worker";

export const dynamic = "force-dynamic";

/**
 * For the host's monitoring (docs/platform/07): is the portal up, can it reach
 * its database, and are the background checks running? 200 when all is well,
 * 503 otherwise. Says nothing about anyone's data.
 */
export async function GET() {
  const now = Date.now();
  let database = false;
  try {
    await db.$queryRaw`SELECT 1`;
    database = true;
  } catch {}
  const w = workerHealth();
  const ago = (t: number | null) => (t ? Math.round((now - t) / 1000) : null);
  // The duty checks run every 30 s and the hub's every 10 s: two minutes without is a failure.
  const checks = w.running && ago(w.dutyLastOk) !== null && ago(w.dutyLastOk)! < 120 && ago(w.hubLastOk) !== null && ago(w.hubLastOk)! < 120;
  const ok = database && checks;
  return Response.json(
    { ok, database, backgroundChecks: { running: w.running, dutyLastOkSecondsAgo: ago(w.dutyLastOk), hubLastOkSecondsAgo: ago(w.hubLastOk), failing: !!(w.dutyError || w.hubError) }, at: new Date(now).toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
