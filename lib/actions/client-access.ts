"use server";

import { revalidatePath } from "next/cache";
import { USERNAME_PATTERN } from "@/lib/accounts";
import { hashPassword } from "@/lib/auth/password";
import { ACTIONS, canDo, type ActionId } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { ok, refused, type ActionResult } from "./types";

/**
 * Client portal logins, made and taken away by Leon staff only — the account
 * manager, the Admin Manager or the Managing Director (26 September 2026).
 * Each login belongs to one client for good, sees only the sites chosen for
 * it, and can hold no other role; the database holds all three rules too
 * (constraints §27). Every change is recorded.
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { session: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) return { session: null, error: refused(`${ACTIONS[action].what} belongs to ${ACTIONS[action].owner}.`) };
  return { session, error: null };
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const refresh = (clientId: string) => revalidatePath(`/clients/${clientId}/portal`);

function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => alphabet[b % alphabet.length]).join("").replace(/(.{4})(?=.)/g, "$1-");
}

/** The sites asked for, if every one is this client's. */
async function ownSites(clientId: string, formData: FormData): Promise<string[] | null> {
  const ids = [...new Set(formData.getAll("siteId").map(String).filter(Boolean))];
  if (!ids.length) return [];
  const found = await db.site.count({ where: { id: { in: ids }, clientId } });
  return found === ids.length ? ids : null;
}

/** A contact of this client, or null. */
const contactOf = (userId: string) => db.user.findFirst({ where: { id: String(userId), clientId: { not: null } }, select: { id: true, displayName: true, username: true, clientId: true, personId: true, active: true, client: { select: { name: true } } } });

const OFFICER_IDENTITY = { none: "no officer names", name: "officers' names", name_and_sia: "officers' names and SIA licence numbers" } as const;

/** What the client's contract lets them see of the officers on their sites. */
export async function setOfficerIdentity(clientId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("client.portal");
  if (error || !session) return error!;
  const identity = text(formData, "identity") as keyof typeof OFFICER_IDENTITY;
  if (!(identity in OFFICER_IDENTITY)) return refused("Choose what the contract allows.");
  const c = await db.client.findUnique({ where: { id: String(clientId) }, select: { id: true, name: true, officerIdentity: true } });
  if (!c) return refused("That client no longer exists.");
  if (c.officerIdentity === identity) return ok("No change.");
  await db.$transaction([
    db.client.update({ where: { id: c.id }, data: { officerIdentity: identity } }),
    db.event.create({ data: { type: "client.officer_identity", actorUserId: session.userId, actorRole: session.activeRole, department: "account_management", detail: `${session.name} set ${c.name}'s portal to show ${OFFICER_IDENTITY[identity]} (was ${OFFICER_IDENTITY[c.officerIdentity]}).` } }),
  ]);
  refresh(c.id);
  return ok(`Saved. ${c.name} now sees ${OFFICER_IDENTITY[identity]}.`);
}

/** A new login for one of the client's own people. The temporary password is shown once. */
export async function addPortalContact(clientId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("client.portal");
  if (error || !session) return error!;
  const c = await db.client.findUnique({ where: { id: String(clientId) }, select: { id: true, name: true, active: true } });
  if (!c || !c.active) return refused("That client is not active.");
  const name = text(formData, "name").slice(0, 120);
  const email = text(formData, "email").toLowerCase().slice(0, 200);
  const username = (text(formData, "username") || email.split("@")[0]).toLowerCase();
  if (name.length < 3) return refused("Give their full name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return refused("Give their work email address.");
  if (!USERNAME_PATTERN.test(username)) return refused("A username is 3–32 lower-case letters, numbers, dots, dashes or underscores.");
  const sites = await ownSites(c.id, formData);
  if (sites === null) return refused("Choose from this client's own sites.");
  if (await db.user.findFirst({ where: { OR: [{ username }, { email }] }, select: { id: true } })) return refused("That username or email is already in use.");
  const temp = temporaryPassword();
  const passwordHash = await hashPassword(temp);
  await db.$transaction(async (tx) => {
    const person = await tx.person.create({ data: { fullName: name, email } });
    const user = await tx.user.create({ data: { personId: person.id, displayName: name, username, email, passwordHash, department: "client_portal", status: "active", clientId: c.id, mustChangePassword: true } });
    await tx.userRole.create({ data: { userId: user.id, role: "client", grantedById: session.userId, grantBasis: `Client portal login for ${c.name}, added by ${session.name}.` } });
    if (sites.length) await tx.clientContactSite.createMany({ data: sites.map((siteId) => ({ userId: user.id, siteId })) });
    await tx.event.create({ data: { type: "client.portal_login_added", actorUserId: session.userId, actorRole: session.activeRole, department: "account_management", personId: person.id, detail: `${session.name} gave ${name} (${c.name}) a client portal login, seeing ${sites.length ? `${sites.length} of ${c.name}'s sites` : `all of ${c.name}'s sites`}.` } });
  });
  refresh(c.id);
  return ok(`${name} can sign in as ${username} with the temporary password ${temp} — give it to them by phone, not in the same email as the username. It is shown once; they choose their own when they first sign in.`);
}

/** Which of the client's sites a contact sees. None ticked means all of them. */
export async function setContactSites(userId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("client.portal");
  if (error || !session) return error!;
  const u = await contactOf(userId);
  if (!u?.clientId) return refused("That is not a client portal login.");
  const sites = await ownSites(u.clientId, formData);
  if (sites === null) return refused("Choose from this client's own sites.");
  await db.$transaction([
    db.clientContactSite.deleteMany({ where: { userId: u.id } }),
    db.clientContactSite.createMany({ data: sites.map((siteId) => ({ userId: u.id, siteId })) }),
    db.event.create({ data: { type: "client.portal_sites", actorUserId: session.userId, actorRole: session.activeRole, department: "account_management", personId: u.personId, detail: `${session.name} set ${u.displayName} (${u.client?.name}) to see ${sites.length ? `${sites.length} site${sites.length === 1 ? "" : "s"}` : "all the client's sites"}.` } }),
  ]);
  refresh(u.clientId);
  return ok("Saved.");
}

/** They have left the client, or should no longer see it. The login stops at once; nothing they did is deleted. */
export async function removePortalContact(userId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("client.portal");
  if (error || !session) return error!;
  const reason = text(formData, "reason").slice(0, 300);
  if (reason.length < 3) return refused("Say why — for example “left Meridian, told by their manager”.");
  const u = await contactOf(userId);
  if (!u?.clientId) return refused("That is not a client portal login.");
  if (!u.active) return ok("Already removed.");
  const now = new Date();
  await db.$transaction([
    db.user.update({ where: { id: u.id }, data: { active: false, status: "suspended" } }),
    db.userRole.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: now } }),
    db.workSession.updateMany({ where: { userId: u.id, signedOutAt: null }, data: { signedOutAt: now } }),
    db.event.create({ data: { type: "client.portal_login_removed", actorUserId: session.userId, actorRole: session.activeRole, department: "account_management", personId: u.personId, detail: `${session.name} removed ${u.displayName}'s client portal login (${u.client?.name}): ${reason}` } }),
  ]);
  refresh(u.clientId);
  return ok(`${u.displayName} can no longer sign in.`);
}

/** A forgotten password, with no email yet: a new temporary one, shown once. */
export async function resetPortalPassword(userId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("client.portal");
  if (error || !session) return error!;
  const u = await contactOf(userId);
  if (!u?.clientId || !u.active) return refused("That login is not active.");
  const temp = temporaryPassword();
  await db.$transaction([
    db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(temp), mustChangePassword: true, failedSignIns: 0, lockedUntil: null } }),
    db.event.create({ data: { type: "client.portal_password_reset", actorUserId: session.userId, actorRole: session.activeRole, department: "account_management", personId: u.personId, detail: `${session.name} reset ${u.displayName}'s client portal password (${u.client?.name}).` } }),
  ]);
  refresh(u.clientId);
  return ok(`Temporary password for ${u.username}: ${temp} — give it to them by phone. Shown once.`);
}

/** The six-monthly check that this person should still see this client's portal. */
export async function reviewPortalContact(userId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("client.portal");
  if (error || !session) return error!;
  const u = await contactOf(userId);
  if (!u?.clientId || !u.active) return refused("That login is not active.");
  await db.$transaction([
    db.user.update({ where: { id: u.id }, data: { reviewedAt: new Date(), reviewedById: session.userId } }),
    db.event.create({ data: { type: "client.portal_login_reviewed", actorUserId: session.userId, actorRole: session.activeRole, department: "account_management", personId: u.personId, detail: `${session.name} confirmed ${u.displayName} should still see ${u.client?.name}'s portal.` } }),
  ]);
  refresh(u.clientId);
  return ok("Confirmed for another six months.");
}
