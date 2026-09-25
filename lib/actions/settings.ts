"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
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
    db.user.update({ where: { id: session.userId }, data: { passwordHash: await hashPassword(next) } }),
    db.event.create({ data: { type: "account.password_changed", actorUserId: session.userId, actorRole: session.activeRole, department: "administration", personId: session.personId, detail: "Changed their own password." } }),
  ]);
  return ok("Password changed. Use the new one next time you sign in.");
}
