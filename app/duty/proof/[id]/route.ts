import { type NextRequest } from "next/server";
import { canAccessPath } from "@/components/layout/nav";
import { getSession } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { getObject } from "@/lib/storage";

/**
 * A book-on or check-call selfie, for Control to look at. Only the roles that
 * work the duty pages see them; the officer's own copy is the one on their
 * phone. Not written to the event log on every view — the boards show these
 * thumbnails constantly, and a log entry per glance would drown the log (and
 * move every screen's pulse).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sign in to view this.", { status: 401 });
  if (!canAccessPath(session.activeRole, "/duty/book-ons")) return new Response("Your role does not open duty photos.", { status: 403 });
  const { id } = await params;
  const proof = await db.dutyProof.findUnique({ where: { id } });
  if (!proof) return new Response("Not found.", { status: 404 });
  const bytes = await getObject(proof.storageKey);
  if (!bytes) return new Response("The photo could not be found.", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": proof.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${proof.code}.jpg"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
      "Referrer-Policy": "no-referrer",
    },
  });
}
