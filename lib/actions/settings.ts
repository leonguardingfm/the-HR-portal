"use server";

import { revalidatePath } from "next/cache";
import { getSession, setSession } from "@/lib/auth/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { STAFF_ROLES_NEEDING_2FA, type TwoFactorPolicy } from "@/lib/auth/limits";
import { checkCode, newTotpSecret, otpauthUri } from "@/lib/auth/totp";
import { sealToken, unsealToken } from "@/lib/db/email";
import { PASSWORD_MIN } from "@/lib/accounts";
import { THEMES } from "@/lib/core/themes";
import { db } from "@/lib/db/client";
import { refused, ok, type ActionResult } from "./types";

/**
 * Everyone's own settings (25 September 2026): their theme, whether the hub's
 * notifications make a sound, and their password. Anyone signed in may change
 * their own — and only their own: the person is the session, never a field on
 * the form.
 *
 * A theme or a sound switch is not work, so it writes no event: an event moves
 * every open screen's pulse, and nobody else's screen needs to reload because
 * one person chose navy.
 */
async function guard() {
  const session = await getSession();
  if (!session) return { session: null, error: refused("Your session has ended. Sign in again.") };
  return { session, error: null };
}

export async function saveTheme(theme: string): Promise<ActionResult> {
  const { session, error } = await guard();
  if (error || !session) return error!;
  if (!THEMES.some((t) => t.id === theme)) return refused("That theme is not one of the choices.");
  await db.user.update({ where: { id: session.userId }, data: { theme } });
  revalidatePath("/", "layout");
  return ok("Saved — it follows you to any device you sign in on.");
}

export async function saveSound(on: boolean): Promise<ActionResult> {
  const { session, error } = await guard();
  if (error || !session) return error!;
  await db.user.update({ where: { id: session.userId }, data: { soundOn: on === true } });
  revalidatePath("/", "layout");
  return ok(on ? "Notifications will sound." : "Notifications are silent.");
}

export async function changePassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard();
  if (error || !session) return error!;
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const user = await db.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true, username: true } });
  if (!user?.passwordHash) return refused("This account signs in another way, so it has no password to change here.");
  if (!(await verifyPassword(current, user.passwordHash))) return refused("Your current password is not right.");
  if (next.length < PASSWORD_MIN) return refused(`The new password needs at least ${PASSWORD_MIN} characters.`);
  if (next === current) return refused("The new password is the same as the old one.");
  if (user.username && next.toLowerCase().includes(user.username.toLowerCase())) return refused("The new password should not contain your username.");
  if (next !== confirm) return refused("The two new passwords are not the same.");
  await db.$transaction([
    db.user.update({ where: { id: session.userId }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } }),
    db.event.create({ data: { type: "account.password_changed", actorUserId: session.userId, actorRole: session.activeRole, department: "administration", personId: session.personId, detail: "Changed their own password." } }),
  ]);
  const still = await nextRequirement(session.userId, session.roles);
  if (session.must) await setSession({ ...session, must: still });
  if (still === "2fa") return ok("Password changed. One more step: your role needs two-factor sign-in — set it up below.");
  return ok("Password changed. Use the new one next time you sign in.");
}

/** What is still owed before they may carry on, if anything. */
async function nextRequirement(userId: string, roles: string[]): Promise<"2fa" | undefined> {
  const [u, policy] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true } }),
    db.setting.findUnique({ where: { key: "security.require_2fa" } }),
  ]);
  const needed = (STAFF_ROLES_NEEDING_2FA[(policy?.value ?? "off") as TwoFactorPolicy] ?? []) as readonly string[];
  return !u?.totpEnabledAt && roles.some((r) => needed.includes(r)) ? "2fa" : undefined;
}

export type TwoFactorStart = ActionResult & { uri?: string; secret?: string };

/**
 * Two-factor, step one: a new secret for their authenticator app, shown once
 * as a QR code and as text. Nothing changes at sign-in until they confirm a
 * code from the app, so a half-finished set-up cannot lock them out.
 */
export async function startTwoFactor(): Promise<TwoFactorStart> {
  const { session, error } = await guard();
  if (error || !session) return error!;
  const u = await db.user.findUnique({ where: { id: session.userId }, select: { totpEnabledAt: true, username: true, displayName: true } });
  if (u?.totpEnabledAt) return refused("Two-factor is already on. Turn it off first to move it to a new phone.");
  const secret = newTotpSecret();
  await db.user.update({ where: { id: session.userId }, data: { totpSecret: sealToken(secret), totpLastStep: null } });
  return { ...ok("Scan the code with your authenticator app, then type the six digits it shows."), uri: otpauthUri(secret, u?.username ?? u?.displayName ?? "account"), secret };
}

export async function confirmTwoFactor(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard();
  if (error || !session) return error!;
  const u = await db.user.findUnique({ where: { id: session.userId }, select: { totpSecret: true, totpEnabledAt: true } });
  if (u?.totpEnabledAt) return refused("Two-factor is already on.");
  const secret = unsealToken(u?.totpSecret ?? null);
  if (!secret) return refused("Start again: press Set up two-factor.");
  const step = checkCode(secret, String(formData.get("code") ?? ""), new Date(), null);
  if (step === null) return refused("That code is not right. Check the app shows Leon Guarding, and type the newest six digits.");
  await db.$transaction([
    db.user.update({ where: { id: session.userId }, data: { totpEnabledAt: new Date(), totpLastStep: step } }),
    db.event.create({ data: { type: "account.two_factor_on", actorUserId: session.userId, actorRole: session.activeRole, department: "administration", personId: session.personId, detail: "Turned on two-factor sign-in." } }),
  ]);
  if (session.must === "2fa") await setSession({ ...session, must: undefined });
  revalidatePath("/settings");
  return ok("Two-factor is on. From now on you will be asked for a code from your app when you sign in.");
}

export async function turnOffTwoFactor(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard();
  if (error || !session) return error!;
  const u = await db.user.findUnique({ where: { id: session.userId }, select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true } });
  if (!u?.totpEnabledAt) return refused("Two-factor is not on.");
  const policy = await db.setting.findUnique({ where: { key: "security.require_2fa" } });
  const needed = (STAFF_ROLES_NEEDING_2FA[(policy?.value ?? "off") as TwoFactorPolicy] ?? []) as readonly string[];
  if (session.roles.some((r) => needed.includes(r))) return refused("Your role must use two-factor, so it stays on. To move it to a new phone, ask the Admin Manager to reset it.");
  const secret = unsealToken(u.totpSecret);
  if (!secret || checkCode(secret, String(formData.get("code") ?? ""), new Date(), u.totpLastStep) === null) return refused("That code is not right.");
  await db.$transaction([
    db.user.update({ where: { id: session.userId }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null } }),
    db.event.create({ data: { type: "account.two_factor_off", actorUserId: session.userId, actorRole: session.activeRole, department: "administration", personId: session.personId, detail: "Turned off two-factor sign-in." } }),
  ]);
  revalidatePath("/settings");
  return ok("Two-factor is off.");
}
