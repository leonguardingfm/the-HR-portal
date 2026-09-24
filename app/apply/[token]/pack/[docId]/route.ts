import { type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { inviteByToken } from "@/lib/db/application";
import { getObject } from "@/lib/storage";

/**
 * A welcome-pack document, for the candidate to read through their link —
 * only the documents Recruitment sent with that pack, only while the link is
 * live. Each opening is logged.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  const r = await inviteByToken(token, "welcome_pack");
  if (!r.invite) return new Response("This link does not work.", { status: 404 });
  const person = r.invite.candidacy.person;
  const doc = person.documents.find((d) => d.id === docId && d.typeId === "welcome_pack" && d.note === "Sent in the welcome pack");
  if (!doc?.storageKey || !doc.mimeType) return new Response("Not found.", { status: 404 });
  const bytes = await getObject(doc.storageKey);
  if (!bytes) return new Response("Not found.", { status: 404 });
  await db.event.create({
    data: { type: "candidate.welcome_pack_document_opened", actorSystem: "candidate-portal", department: "recruitment", personId: person.id, documentId: doc.id, detail: `${person.fullName} opened “${doc.fileName ?? "a pack document"}” from their welcome pack link.` },
  });
  const name = (doc.fileName ?? "document").replace(/["\r\n]/g, "");
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
