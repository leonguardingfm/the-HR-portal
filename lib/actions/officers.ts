"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { refused, ok, type ActionResult } from "./types";

/**
 * Keeping an officer off a site — the client does not want them there, or we
 * have taken them off it — and lifting it again (Control, 25 September 2026).
 * While it stands the rota refuses them there, on every path: asking, bulk
 * planning, publishing, and an officer offering in their portal.
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { session: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) {
    const spec = ACTIONS[action];
    return {
      session,
      error: refused(`${spec.what} belongs to ${spec.owner}. You are working as ${session.activeRole.replace(/_/g, " ")}, so the platform refuses it.`),
    };
  }
  return { session, error: null };
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function keepOffSite(personId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("officer.exclude");
  if (error || !session) return error!;
  const reason = text(formData, "reason").slice(0, 300);
  if (reason.length < 3) return refused("Say why — the client asked, or what happened.");
  const [person, site] = await Promise.all([
    db.person.findUnique({ where: { id: String(personId) }, select: { id: true, fullName: true } }),
    db.site.findUnique({ where: { id: text(formData, "siteId") }, include: { client: true } }),
  ]);
  if (!person) return refused("That officer no longer exists.");
  if (!site) return refused("Choose the site.");
  if (await db.siteExclusion.findFirst({ where: { personId: person.id, siteId: site.id, liftedAt: null } })) return refused(`${person.fullName} is already kept off ${site.name}.`);
  const ahead = await db.assignment.count({ where: { personId: person.id, post: { siteId: site.id }, state: { not: "cancelled" }, endsAt: { gt: new Date() } } });

  await db.$transaction([
    db.siteExclusion.create({ data: { personId: person.id, siteId: site.id, reason, addedById: session.userId } }),
    db.event.create({
      data: { type: "officer.kept_off_site", actorUserId: session.userId, actorRole: session.activeRole, department: "control", personId: person.id, siteId: site.id, detail: `${person.fullName} kept off ${site.name}, ${site.client.name}: ${reason}` },
    }),
  ]);
  revalidatePath(`/officers/${person.id}`);
  revalidatePath("/scheduling");
  return ok(
    `${person.fullName} is kept off ${site.name}. The rota will refuse them there.${ahead ? ` They are still on ${ahead} shift${ahead === 1 ? "" : "s"} there — take them off those on the rota.` : ""}`,
  );
}

export async function liftSiteExclusion(exclusionId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("officer.exclude");
  if (error || !session) return error!;
  const reason = text(formData, "reason").slice(0, 300);
  if (reason.length < 3) return refused("Say why it is being lifted.");
  const x = await db.siteExclusion.findUnique({ where: { id: String(exclusionId) }, include: { person: { select: { fullName: true } }, site: { select: { name: true } } } });
  if (!x || x.liftedAt) return refused("That has already been lifted.");
  await db.$transaction([
    db.siteExclusion.update({ where: { id: x.id }, data: { liftedAt: new Date(), liftedById: session.userId, liftedReason: reason } }),
    db.event.create({
      data: { type: "officer.site_exclusion_lifted", actorUserId: session.userId, actorRole: session.activeRole, department: "control", personId: x.personId, siteId: x.siteId, detail: `${x.person.fullName} may work at ${x.site.name} again: ${reason}` },
    }),
  ]);
  revalidatePath(`/officers/${x.personId}`);
  revalidatePath("/scheduling");
  return ok(`Lifted. ${x.person.fullName} can be put on ${x.site.name} again.`);
}
