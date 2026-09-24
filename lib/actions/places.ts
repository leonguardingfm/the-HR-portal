"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { CHECK_CALL_RULES, RADIUS_LIMITS, changes, clientProblem, patternWarning, postProblem, siteProblem, type CheckCallRuleId } from "@/lib/core/places";
import { parseLatLng } from "@/lib/core/proof";
import { refused, ok, type ActionResult } from "./types";

/**
 * Clients, sites and posts, entered and changed by Control (25 September
 * 2026). Same shape as every other write: guard, re-read, write with the event
 * in the same transaction, and the event says exactly what changed.
 *
 * Nothing is deleted. A client, site or post that is no longer covered is made
 * inactive — and not while it still has shifts ahead of it, which would leave
 * officers booked onto a place the rota no longer shows.
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
const optional = (f: FormData, k: string) => text(f, k) || null;
const yes = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "1" || f.get(k) === "true";
const date = (f: FormData, k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(text(f, k)) ? text(f, k) : null);

const refresh = () => {
  for (const p of ["/clients", "/scheduling", "/requirements", "/requirements/new", "/sales"]) revalidatePath(p);
};

/** Shifts still ahead on these posts: booked, open, or needing cover. */
async function aheadOn(postIds: string[], now: Date) {
  const [booked, open] = await Promise.all([
    db.assignment.count({ where: { postId: { in: postIds }, state: { notIn: ["cancelled"] }, endsAt: { gt: now } } }),
    db.openShift.count({ where: { postId: { in: postIds }, cancelledAt: null, assignmentId: null, endsAt: { gt: now } } }),
  ]);
  return booked + open;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function saveClient(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("place.manage");
  if (error || !session) return error!;

  const id = optional(formData, "id");
  const next = {
    name: text(formData, "name"),
    screeningPeriodYears: Number(text(formData, "screeningPeriodYears") || "5"),
    requiresAdditionalInterview: yes(formData, "requiresAdditionalInterview"),
    regulatedActivity: yes(formData, "regulatedActivity"),
    contractStart: date(formData, "contractStart"),
    contractEnd: date(formData, "contractEnd"),
    active: id ? yes(formData, "active") : true,
  };
  const problem = clientProblem(next);
  if (problem) return refused(problem);

  const clash = await db.client.findFirst({ where: { name: { equals: next.name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
  if (clash) return refused(`There is already a client called ${clash.name}.`);
  const data = {
    ...next,
    contractStart: next.contractStart ? new Date(`${next.contractStart}T00:00:00Z`) : null,
    contractEnd: next.contractEnd ? new Date(`${next.contractEnd}T00:00:00Z`) : null,
  };

  if (!id) {
    const c = await db.$transaction(async (tx) => {
      const c = await tx.client.create({ data });
      await tx.event.create({
        data: { type: "client.created", actorUserId: session.userId, actorRole: session.activeRole, department: "control", detail: `Client added: ${c.name} (${c.screeningPeriodYears}-year screening).` },
      });
      return c;
    });
    refresh();
    return ok(`${c.name} added. Now add its sites.`);
  }

  const before = await db.client.findUnique({ where: { id }, include: { sites: { include: { posts: { select: { id: true } } } } } });
  if (!before) return refused("That client no longer exists.");
  if (before.active && !next.active) {
    const ahead = await aheadOn(before.sites.flatMap((s) => s.posts.map((p) => p.id)), new Date());
    if (ahead) return refused(`${before.name} still has ${ahead} shift${ahead === 1 ? "" : "s"} ahead on the rota. Cancel or finish them before making the client inactive.`);
  }
  const said = changes(
    { ...before, contractStart: before.contractStart?.toISOString().slice(0, 10), contractEnd: before.contractEnd?.toISOString().slice(0, 10) },
    next,
    { name: "Name", screeningPeriodYears: "Screening period (years)", requiresAdditionalInterview: "Additional interview", regulatedActivity: "Regulated activity", contractStart: "Contract start", contractEnd: "Contract end", active: "Active" },
  );
  if (said.length === 0) return refused("Nothing has changed.");
  await db.$transaction([
    db.client.update({ where: { id }, data }),
    db.event.create({
      data: { type: "client.updated", actorUserId: session.userId, actorRole: session.activeRole, department: "control", detail: `${before.name} changed — ${said.join("; ")}.` },
    }),
  ]);
  refresh();
  return ok(`Saved. ${said.length} change${said.length === 1 ? "" : "s"} recorded.`);
}

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

export async function saveSite(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("place.manage");
  if (error || !session) return error!;

  const id = optional(formData, "id");
  const locationText = text(formData, "location");
  const location = parseLatLng(locationText);
  const next = {
    name: text(formData, "name"),
    address: optional(formData, "address"),
    clientRef: optional(formData, "clientRef"),
    checkCallInstruction: optional(formData, "checkCallInstruction"),
    contactName: optional(formData, "contactName"),
    contactPhone: optional(formData, "contactPhone"),
    radiusMetres: Number(text(formData, "radiusMetres") || RADIUS_LIMITS.default),
    active: id ? yes(formData, "active") : true,
  };
  const problem = siteProblem({ ...next, locationText, location });
  if (problem) return refused(problem);
  const data = { ...next, latitude: location?.lat ?? null, longitude: location?.lng ?? null };

  if (!id) {
    const clientId = text(formData, "clientId");
    const client = await db.client.findUnique({ where: { id: clientId } });
    if (!client || !client.active) return refused("That client is not active. Make it active first.");
    if (await db.site.findFirst({ where: { clientId, name: { equals: next.name, mode: "insensitive" } } })) return refused(`${client.name} already has a site called ${next.name}.`);
    const s = await db.$transaction(async (tx) => {
      const s = await tx.site.create({ data: { ...data, clientId } });
      await tx.event.create({
        data: { type: "site.created", actorUserId: session.userId, actorRole: session.activeRole, department: "control", siteId: s.id, detail: `Site added: ${s.name}, ${client.name}${location ? "" : " — no location yet, so selfies there cannot be checked"}.` },
      });
      return s;
    });
    refresh();
    return ok(`${s.name} added.${location ? "" : " Set its location so officers' selfies can be checked."} Now add its posts.`);
  }

  const before = await db.site.findUnique({ where: { id }, include: { posts: { select: { id: true } }, client: true } });
  if (!before) return refused("That site no longer exists.");
  if (await db.site.findFirst({ where: { clientId: before.clientId, id: { not: id }, name: { equals: next.name, mode: "insensitive" } } })) return refused(`${before.client.name} already has a site called ${next.name}.`);
  if (before.active && !next.active) {
    const ahead = await aheadOn(before.posts.map((p) => p.id), new Date());
    if (ahead) return refused(`${before.name} still has ${ahead} shift${ahead === 1 ? "" : "s"} ahead on the rota. Cancel or finish them before making the site inactive.`);
  }
  const loc = (lat: unknown, lng: unknown) => (lat == null ? null : `${Number(lat)}, ${Number(lng)}`);
  const said = changes(
    { ...before, location: loc(before.latitude, before.longitude) },
    { ...next, location: loc(data.latitude, data.longitude) },
    { name: "Name", address: "Address", clientRef: "Client's reference", contactName: "Contact", contactPhone: "Contact's phone", checkCallInstruction: "Check-call instruction", location: "Location", radiusMetres: "Radius (m)", active: "Active" },
  );
  if (said.length === 0) return refused("Nothing has changed.");
  await db.$transaction([
    db.site.update({ where: { id }, data }),
    db.event.create({
      data: { type: "site.updated", actorUserId: session.userId, actorRole: session.activeRole, department: "control", siteId: id, detail: `${before.name}, ${before.client.name} changed — ${said.join("; ")}.` },
    }),
  ]);
  refresh();
  return ok(`Saved. ${said.length} change${said.length === 1 ? "" : "s"} recorded.`);
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export async function savePost(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("place.manage");
  if (error || !session) return error!;

  const id = optional(formData, "id");
  const next = {
    name: text(formData, "name"),
    pattern: optional(formData, "pattern"),
    requiresSiaLicence: yes(formData, "requiresSiaLicence"),
    screeningPeriodYears: Number(text(formData, "screeningPeriodYears") || "5"),
    checkCalls: text(formData, "checkCalls") || "always",
    loneWorking: yes(formData, "loneWorking"),
    mobileSignal: yes(formData, "mobileSignal"),
    phone: optional(formData, "phone"),
    instructions: optional(formData, "instructions"),
    active: id ? yes(formData, "active") : true,
  };
  const problem = postProblem(next);
  if (problem) return refused(problem);
  const data = { ...next, checkCalls: next.checkCalls as CheckCallRuleId };
  if (!CHECK_CALL_RULES.includes(data.checkCalls)) return refused("Choose when check calls are made on this post.");
  const warn = patternWarning(next.pattern);

  if (!id) {
    const siteId = text(formData, "siteId");
    const site = await db.site.findUnique({ where: { id: siteId }, include: { client: true } });
    if (!site || !site.active || !site.client.active) return refused("That site is not active. Make it active first.");
    if (await db.post.findFirst({ where: { siteId, name: { equals: next.name, mode: "insensitive" } } })) return refused(`${site.name} already has a post called ${next.name}.`);
    const p = await db.$transaction(async (tx) => {
      const p = await tx.post.create({ data: { ...data, siteId } });
      await tx.event.create({
        data: { type: "post.created", actorUserId: session.userId, actorRole: session.activeRole, department: "control", siteId, detail: `Post added: ${p.name} at ${site.name}, ${site.client.name}.` },
      });
      return p;
    });
    refresh();
    return ok(`${p.name} added. It is on the rota now — create its shifts from Scheduling.${warn ? ` ${warn}` : ""}`);
  }

  const before = await db.post.findUnique({ where: { id }, include: { site: true } });
  if (!before) return refused("That post no longer exists.");
  if (await db.post.findFirst({ where: { siteId: before.siteId, id: { not: id }, name: { equals: next.name, mode: "insensitive" } } })) return refused(`${before.site.name} already has a post called ${next.name}.`);
  if (before.active && !next.active) {
    const ahead = await aheadOn([id], new Date());
    if (ahead) return refused(`${before.name} still has ${ahead} shift${ahead === 1 ? "" : "s"} ahead on the rota. Cancel or finish them before making the post inactive.`);
  }
  const said = changes(before, next, {
    name: "Name",
    pattern: "Pattern",
    requiresSiaLicence: "SIA licence required",
    screeningPeriodYears: "Screening period (years)",
    checkCalls: "Check calls",
    loneWorking: "Lone working",
    mobileSignal: "Mobile signal",
    phone: "Post phone",
    instructions: "Instructions",
    active: "Active",
  });
  if (said.length === 0) return refused("Nothing has changed.");
  await db.$transaction([
    db.post.update({ where: { id }, data }),
    db.event.create({
      data: {
        type: "post.updated",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        siteId: before.siteId,
        // Instructions can be long; the log says they changed, not all of them twice.
        detail: `${before.name}, ${before.site.name} changed — ${said.map((s) => (s.startsWith("Instructions:") ? "Instructions updated" : s)).join("; ")}.`,
      },
    }),
  ]);
  refresh();
  return ok(`Saved. ${said.length} change${said.length === 1 ? "" : "s"} recorded.${warn ? ` ${warn}` : ""}`);
}
