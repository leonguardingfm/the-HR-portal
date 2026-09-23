import { type NextRequest } from "next/server";
import { canAccessPath } from "@/components/layout/nav";
import { getSession } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { getObject } from "@/lib/storage";

/**
 * The one way an uploaded copy leaves the platform.
 *
 * A copy on a screening file is shown only to roles that may open screening
 * files; a copy on a person only to roles that may open Compliance. Every view
 * is written to the event log, because who looked at somebody's passport is a
 * question the confidentiality obligations [6.1] expect to be answerable.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Sign in to view documents.", { status: 401 });

  const { id } = await params;
  const doc = await db.documentRecord.findUnique({ where: { id }, include: { type: true } });
  if (!doc) return new Response("Not found.", { status: 404 });

  const area = doc.screeningFileId ? "/vetting" : doc.personId ? "/compliance" : "/admin";
  if (!canAccessPath(session.activeRole, area)) {
    return new Response("Your role does not open these documents.", { status: 403 });
  }
  if (!doc.storageKey || doc.disposedAt) {
    return new Response("No copy is held for this document.", { status: 404 });
  }
  const bytes = doc.mimeType ? await getObject(doc.storageKey) : null;
  if (!bytes || !doc.mimeType) return new Response("The stored copy could not be found.", { status: 404 });

  await db.event.create({
    data: {
      type: "document.viewed",
      actorUserId: session.userId,
      actorRole: session.activeRole,
      department: doc.screeningFileId ? "vetting" : "compliance",
      personId: doc.personId,
      screeningFileId: doc.screeningFileId,
      documentId: doc.id,
      detail: `${doc.type.label} viewed.`,
    },
  });

  const name = (doc.fileName ?? `${doc.typeId}`).replace(/["\r\n]/g, "");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
