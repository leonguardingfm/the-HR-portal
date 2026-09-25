import { getSession } from "@/lib/auth/server";
import { canDo } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { portalScope } from "@/lib/db/client-portal";
import { getObject } from "@/lib/storage";

/**
 * A site issue photo (26 September 2026), to whoever may see it: the Control
 * Room and management; the officer who took it, or one on duty at that site
 * now; and the client — only a photo Control chose to share, of an issue
 * Control shared, at one of their own sites. Anyone else: not found.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sign in.", { status: 401 });
  const { id } = await params;
  const photo = await db.siteIssuePhoto.findUnique({ where: { id }, include: { issue: { select: { siteId: true, status: true, reportedByPersonId: true } } } });
  const none = new Response("Not found.", { status: 404 });
  if (!photo) return none;
  const role = session.activeRole;
  let allowed = canDo(role, "site_issue.review") || role === "top_management" || role === "auditor";
  if (!allowed && role === "officer") {
    const now = new Date();
    allowed = photo.issue.reportedByPersonId === session.personId || (await db.assignment.count({ where: { personId: session.personId, post: { siteId: photo.issue.siteId }, startsAt: { lte: now }, endsAt: { gt: now }, state: { in: ["published", "amended", "completed"] } } })) > 0;
  }
  if (!allowed && role === "client") {
    const scope = await portalScope(session);
    allowed = !!scope && photo.shared && scope.siteIds.includes(photo.issue.siteId) && ["open", "client_fixed", "resolved"].includes(photo.issue.status);
  }
  if (!allowed) return none;
  const bytes = await getObject(photo.storageKey);
  if (!bytes) return none;
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": photo.mimeType, "Content-Length": String(bytes.length), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
}
