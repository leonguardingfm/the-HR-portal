import { type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/server";
import { departmentsOf, type HubDepartment } from "@/lib/core/hub";
import { db } from "@/lib/db/client";
import { getObject } from "@/lib/storage";

/**
 * Evidence on a hub task, for the departments that work it and the Managing
 * Director. Each opening is logged.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sign in to view evidence.", { status: 401 });
  const { id } = await params;
  const f = await db.hubFile.findUnique({ where: { id }, include: { task: { select: { id: true, department: true } } } });
  if (!f || f.removedAt) return new Response("Not found.", { status: 404 });
  if (!departmentsOf(session.activeRole).includes(f.task.department as HubDepartment)) return new Response("Your role does not open this evidence.", { status: 403 });
  const bytes = await getObject(f.storageKey);
  if (!bytes) return new Response("The stored copy could not be found.", { status: 404 });
  await db.event.create({ data: { type: "hub.file_viewed", actorUserId: session.userId, actorRole: session.activeRole, department: f.task.department, hubTaskId: f.task.id, detail: `“${f.fileName}” opened.` } });
  const name = f.fileName.replace(/["\r\n]/g, "");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": f.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
