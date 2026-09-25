"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ACTIONS, canDo, type ActionId } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/server";
import { ALERT_KIND_SPECS } from "@/lib/core/alerts";
import { sniffMime } from "@/lib/core/screening-documents";
import { REPORT_WINDOW_HOURS, SITE_ISSUE_KINDS, SITE_ISSUE_PHOTOS, SITE_ISSUE_URGENCY, kindLabel } from "@/lib/core/site-issues";
import { db } from "@/lib/db/client";
import { portalScope } from "@/lib/db/client-portal";
import { sweepDutyChecks } from "@/lib/db/duty-sweep";
import { siteIssueRef } from "@/lib/db/site-issues";
import { deleteObject, putObject } from "@/lib/storage";
import { ok, refused, type ActionResult } from "./types";

/**
 * Site issues (26 September 2026). An officer reports something wrong at the
 * site, with photos; Control reviews it and decides what the client sees, in
 * words Control approves; the client says when it is fixed; the next officer on
 * site checks. Each step is recorded, and each is checked against who is
 * asking — an officer only on their own shift, a client only at their own
 * sites.
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { session: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) return { session: null, error: refused(`${ACTIONS[action].what} belongs to ${ACTIONS[action].owner}.`) };
  return { session, error: null };
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const refresh = () => {
  for (const p of ["/duty/site-issues", "/me", "/client-portal/site-issues", "/client-portal", "/live"]) revalidatePath(p);
};

// ---------------------------------------------------------------------------
// The officer
// ---------------------------------------------------------------------------

/** Something wrong at the site of the officer's own shift — during it, or up to twelve hours after. */
export async function reportSiteIssue(assignmentId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("duty.self");
  if (error || !session) return error!;
  const a = await db.assignment.findUnique({ where: { id: String(assignmentId) }, select: { id: true, personId: true, state: true, startsAt: true, endsAt: true, postId: true, post: { select: { name: true, site: { select: { id: true, name: true, client: { select: { name: true } } } } } }, person: { select: { fullName: true } } } });
  if (!a || a.personId !== session.personId || a.state === "draft" || a.state === "cancelled") return refused("That shift is not one of yours.");
  const now = new Date();
  if (a.startsAt.getTime() - now.getTime() > 60 * 60_000 || now.getTime() - a.endsAt.getTime() > REPORT_WINDOW_HOURS * 3_600_000) return refused("Report it on the shift you found it on — during it, or up to twelve hours after.");
  const kind = text(formData, "kind");
  const urgency = text(formData, "urgency");
  if (!SITE_ISSUE_KINDS.some((k) => k.id === kind)) return refused("Choose what kind of problem it is.");
  if (!SITE_ISSUE_URGENCY.some((u) => u.id === urgency)) return refused("Say how urgent it is.");
  const description = text(formData, "description").slice(0, 2000);
  if (description.length < 3) return refused("Say what you found.");
  const location = text(formData, "location").slice(0, 200) || null;

  const files = formData.getAll("photo").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > SITE_ISSUE_PHOTOS.max) return refused(`Up to ${SITE_ISSUE_PHOTOS.max} photos.`);
  const photos: { key: string; mime: string; bytes: Uint8Array }[] = [];
  for (const f of files) {
    if (f.size > SITE_ISSUE_PHOTOS.bytes) return refused("One of the photos is too large (8 MB at most).");
    const bytes = new Uint8Array(await f.arrayBuffer());
    const mime = sniffMime(bytes);
    if (mime !== "image/jpeg" && mime !== "image/png") return refused("Photos must be JPEG or PNG — take them with the phone's camera.");
    photos.push({ key: `site-issues/${now.toISOString().slice(0, 10)}/${randomUUID()}.${mime === "image/png" ? "png" : "jpg"}`, mime, bytes });
  }
  for (const p of photos) await putObject(p.key, p.bytes);
  try {
    const issue = await db.$transaction(async (tx) => {
      const i = await tx.siteIssue.create({
        data: {
          siteId: a.post.site.id,
          postId: a.postId,
          assignmentId: a.id,
          reportedByPersonId: a.personId,
          reportedByUserId: session.userId,
          kind: kind as never,
          urgency: urgency as never,
          location,
          description,
          photos: { create: photos.map((p) => ({ storageKey: p.key, mimeType: p.mime, sizeBytes: p.bytes.length, sha256: createHash("sha256").update(p.bytes).digest("hex") })) },
        },
      });
      const where = `${a.post.site.name}${location ? ` (${location})` : ""}`;
      await tx.workItem.create({
        data: {
          title: `${urgency === "urgent" ? ALERT_KIND_SPECS.site_issue_urgent.prefix : ALERT_KIND_SPECS.site_issue.prefix}: ${kindLabel(kind)} at ${where} — reported by ${a.person.fullName}. Review it and decide what ${a.post.site.client.name} sees`,
          siteIssueId: i.id,
          ownerRole: "control",
          dueAt: now,
          slaDays: 0,
        },
      });
      await tx.event.create({
        data: { type: "site_issue.reported", actorUserId: session.userId, actorRole: session.activeRole, department: "control", assignmentId: a.id, personId: a.personId, detail: `${a.person.fullName} reported ${siteIssueRef(i.number)} at ${where}: ${kindLabel(kind)}, ${urgency}. “${description.slice(0, 200)}”${photos.length ? ` ${photos.length} photo${photos.length === 1 ? "" : "s"}.` : ""}` },
      });
      return i;
    });
    if (urgency === "urgent") await sweepDutyChecks();
    refresh();
    return ok(`Sent to Control as ${siteIssueRef(issue.number)}.${urgency === "urgent" ? " It is marked urgent — if anyone is in danger, ring Control now as well." : ""}`);
  } catch (e) {
    for (const p of photos) await deleteObject(p.key).catch(() => {});
    throw e;
  }
}

/** The client says it is fixed; the officer on site now looks, and says whether it is. */
export async function checkSiteIssue(issueId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("duty.self");
  if (error || !session) return error!;
  const i = await db.siteIssue.findUnique({ where: { id: String(issueId) }, select: { id: true, number: true, status: true, siteId: true, site: { select: { name: true } } } });
  if (!i || i.status !== "client_fixed") return refused("There is nothing waiting to be checked on that.");
  const now = new Date();
  const onSite = await db.assignment.count({ where: { personId: session.personId, post: { siteId: i.siteId }, state: { in: ["published", "amended", "completed"] }, startsAt: { lte: now }, endsAt: { gt: now } } });
  if (!onSite) return refused("Only an officer on duty at that site can check it.");
  const fixed = text(formData, "fixed") === "yes";
  const note = text(formData, "note").slice(0, 500) || null;
  if (!fixed && !note) return refused("Say what is still wrong.");
  const who = await db.person.findUnique({ where: { id: session.personId }, select: { fullName: true } });
  await db.$transaction(async (tx) => {
    await tx.siteIssue.update({
      where: { id: i.id },
      data: fixed
        ? { status: "resolved", checkedAt: now, checkedByPersonId: session.personId, checkedByUserId: session.userId, checkNote: note, resolvedAt: now }
        : { status: "open", checkedAt: now, checkedByPersonId: session.personId, checkedByUserId: session.userId, checkNote: note, reopenCount: { increment: 1 } },
    });
    if (!fixed) await tx.workItem.create({ data: { title: `${ALERT_KIND_SPECS.site_issue.prefix}: ${siteIssueRef(i.number)} at ${i.site.name} is not fixed yet, though the client said it was — ${note}`, siteIssueId: i.id, ownerRole: "control", dueAt: now, slaDays: 0 } });
    await tx.event.create({ data: { type: fixed ? "site_issue.confirmed_fixed" : "site_issue.not_fixed", actorUserId: session.userId, actorRole: session.activeRole, department: "control", personId: session.personId, detail: `${who?.fullName ?? "The officer"} checked ${siteIssueRef(i.number)} at ${i.site.name}: ${fixed ? "fixed" : "not fixed"}${note ? ` — ${note}` : ""}.` } });
  });
  refresh();
  return ok(fixed ? "Thank you — it is closed, and the client can see it has been checked." : "Thank you — it stays open, and Control has been told.");
}

// ---------------------------------------------------------------------------
// Control
// ---------------------------------------------------------------------------

/** Share it with the client — in approved words, with the photos chosen — or keep it internal, with why. */
export async function reviewSiteIssue(issueId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("site_issue.review");
  if (error || !session) return error!;
  const i = await db.siteIssue.findUnique({ where: { id: String(issueId) }, select: { id: true, number: true, status: true, site: { select: { name: true, client: { select: { name: true } } } }, photos: { select: { id: true } } } });
  if (!i || i.status !== "reported") return refused("That has been reviewed already.");
  const now = new Date();
  const share = text(formData, "decision") === "share";
  if (share) {
    const clientText = text(formData, "clientText").slice(0, 2000);
    if (clientText.length < 5) return refused("Write what the client should read.");
    const chosen = new Set(formData.getAll("photoId").map(String));
    const photoIds = i.photos.map((p) => p.id).filter((id) => chosen.has(id));
    await db.$transaction([
      db.siteIssue.update({ where: { id: i.id }, data: { status: "open", clientText, reviewedAt: now, reviewedById: session.userId } }),
      db.siteIssuePhoto.updateMany({ where: { issueId: i.id, id: { in: photoIds } }, data: { shared: true } }),
      db.workItem.updateMany({ where: { siteIssueId: i.id, state: "open" }, data: { state: "done", doneAt: now } }),
      db.event.create({ data: { type: "site_issue.shared", actorUserId: session.userId, actorRole: session.activeRole, department: "control", detail: `${session.name} shared ${siteIssueRef(i.number)} (${i.site.name}) with ${i.site.client.name}${photoIds.length ? `, with ${photoIds.length} photo${photoIds.length === 1 ? "" : "s"}` : ""}: “${clientText.slice(0, 200)}”` } }),
    ]);
    refresh();
    return ok(`Shared. ${i.site.client.name} can see it in their portal now.`);
  }
  const reason = text(formData, "reason").slice(0, 500);
  if (reason.length < 3) return refused("Say why it is not for the client — e.g. “our own equipment”, “already fixed on the night”.");
  await db.$transaction([
    db.siteIssue.update({ where: { id: i.id }, data: { status: "kept_internal", internalReason: reason, reviewedAt: now, reviewedById: session.userId } }),
    db.workItem.updateMany({ where: { siteIssueId: i.id, state: "open" }, data: { state: "done", doneAt: now } }),
    db.event.create({ data: { type: "site_issue.kept_internal", actorUserId: session.userId, actorRole: session.activeRole, department: "control", detail: `${session.name} kept ${siteIssueRef(i.number)} (${i.site.name}) from the client: ${reason}` } }),
  ]);
  refresh();
  return ok("Kept internal. The client will not see it.");
}

/** No officer due at the site soon: Control confirms it is fixed, saying how it knows. */
export async function confirmSiteIssueByControl(issueId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("site_issue.review");
  if (error || !session) return error!;
  const i = await db.siteIssue.findUnique({ where: { id: String(issueId) }, select: { id: true, number: true, status: true, site: { select: { name: true } } } });
  if (!i || i.status !== "client_fixed") return refused("Only an issue the client says is fixed can be confirmed.");
  const note = text(formData, "note").slice(0, 500);
  if (note.length < 5) return refused("Say how you know it is fixed — e.g. “photo from the site manager”, “checked by the mobile patrol”.");
  const now = new Date();
  await db.$transaction([
    db.siteIssue.update({ where: { id: i.id }, data: { status: "resolved", checkedAt: now, checkedByUserId: session.userId, checkNote: `Confirmed by Control: ${note}`, resolvedAt: now } }),
    db.event.create({ data: { type: "site_issue.confirmed_fixed", actorUserId: session.userId, actorRole: session.activeRole, department: "control", detail: `${session.name} confirmed ${siteIssueRef(i.number)} (${i.site.name}) fixed: ${note}` } }),
  ]);
  refresh();
  return ok("Closed as fixed.");
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

/** "We have fixed it." Our next officer on site checks before it is closed. */
export async function markSiteIssueFixed(issueId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("client.site_issue");
  if (error || !session) return error!;
  const scope = await portalScope(session);
  if (!scope) return refused("Your login is not linked to your organisation yet.");
  const i = await db.siteIssue.findUnique({ where: { id: String(issueId) }, select: { id: true, number: true, status: true, siteId: true, site: { select: { name: true } } } });
  // Another client's issue, or one not shared, is the same as none at all.
  if (!i || !scope.siteIds.includes(i.siteId) || !["open", "client_fixed", "resolved"].includes(i.status)) return refused("That issue was not found.");
  if (i.status !== "open") return ok("Already noted.");
  const note = text(formData, "note").slice(0, 500) || null;
  const now = new Date();
  await db.$transaction([
    db.siteIssue.update({ where: { id: i.id }, data: { status: "client_fixed", clientFixedAt: now, clientFixedById: session.userId, clientFixedNote: note } }),
    db.event.create({ data: { type: "site_issue.client_fixed", actorUserId: session.userId, actorRole: session.activeRole, department: "control", detail: `${scope.name} (${scope.clientName}) says ${siteIssueRef(i.number)} at ${i.site.name} is fixed${note ? `: ${note}` : ""}. The next officer on site will check.` } }),
  ]);
  refresh();
  return ok("Thank you. Our next officer on site will check it, and it will close once they have.");
}
