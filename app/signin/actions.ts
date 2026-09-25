"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { clearSession, getSession, setSession, switchRole } from "@/lib/auth/server";
import { canAccessPath } from "@/components/layout/nav";
import { DEV_SEED_PASSWORD, PASSWORD_MIN, departmentSpec, roleHome } from "@/lib/accounts";
import { ACCOUNT_LOCK, STAFF_ROLES_NEEDING_2FA, addressBlockedFor, clearFailures, noteFailure, type TwoFactorPolicy } from "@/lib/auth/limits";
import { decoyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { checkCode } from "@/lib/auth/totp";
import { appUrl, hashToken, newLinkToken, sealToken, sendEmail, unsealToken } from "@/lib/db/email";
import type { Role } from "@/lib/types";

export interface SignInState {
  error: string | null;
  /** Echoed back so a failed attempt does not clear the username field. */
  username: string;
}

const PENDING_2FA = "leon_2fa";
const clientIp = async () => ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
const minutes = (n: number) => `${n} minute${n === 1 ? "" : "s"}`;

/**
 * Username and password sign-in.
 *
 * No role is asked for: the account's department decided it at registration,
 * and anything else the person holds is offered from their name in the top bar
 * once they are in.
 *
 * Guessing is slowed (26 September 2026): five wrong passwords lock the
 * account for fifteen minutes, and one network address gets twenty failures
 * in fifteen minutes across all accounts. Where two-factor is on, the password
 * only opens the second step.
 *
 * THIS IS STILL THE SSO SEAM. When company sign-on arrives, its callback ends
 * in completeSignIn and nothing downstream changes.
 */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!username || !password) {
    return { error: "Enter your username and password.", username };
  }
  const ip = await clientIp();
  const blocked = addressBlockedFor(ip);
  if (blocked) return { error: `Too many attempts from this network. Try again in ${minutes(blocked)}.`, username };

  const user = await db.user.findUnique({ where: { username } });
  // Always run the hash, so a username that does not exist takes as long to
  // refuse as a wrong password and the timing does not say which it was.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await decoyHash()));
  const now = new Date();
  if (user?.lockedUntil && user.lockedUntil > now) {
    noteFailure(ip);
    const left = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000);
    return { error: `This account is locked after too many wrong passwords. Try again in ${minutes(left)}, or ask the Admin Manager to reset your password.`, username };
  }
  if (!user || !ok) {
    noteFailure(ip);
    if (user) {
      const count = user.failedSignIns + 1;
      if (count >= ACCOUNT_LOCK.attempts) {
        await db.$transaction([
          db.user.update({ where: { id: user.id }, data: { failedSignIns: 0, lockedUntil: new Date(now.getTime() + ACCOUNT_LOCK.minutes * 60_000) } }),
          db.event.create({ data: { type: "account.locked", actorSystem: "sign-in", department: "administration", personId: user.personId, detail: `Locked for ${ACCOUNT_LOCK.minutes} minutes after ${ACCOUNT_LOCK.attempts} wrong passwords in a row (from ${ip}).` } }),
        ]);
        return { error: `Too many wrong passwords — this account is locked for ${ACCOUNT_LOCK.minutes} minutes.`, username };
      }
      await db.user.update({ where: { id: user.id }, data: { failedSignIns: count } });
    }
    return { error: "That username and password do not match an account.", username };
  }

  if (user.status === "pending") {
    return {
      error: "Your account is waiting for an administrator to approve it. You can sign in once it has been approved.",
      username,
    };
  }
  if (user.status === "rejected") {
    return { error: "This registration was not approved. Speak to Administration.", username };
  }
  if (user.status === "suspended" || !user.active) {
    return { error: "This account has been suspended. Speak to Administration.", username };
  }
  clearFailures(ip);
  if (user.failedSignIns || user.lockedUntil) await db.user.update({ where: { id: user.id }, data: { failedSignIns: 0, lockedUntil: null } });

  // Two-factor: the password has opened the second step, not the portal.
  if (user.totpEnabledAt && user.totpSecret) {
    const jar = await cookies();
    jar.set(PENDING_2FA, sealToken(JSON.stringify({ userId: user.id, next, exp: Date.now() + 5 * 60_000 })), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 5 * 60,
    });
    redirect("/signin/verify");
  }
  return completeSignIn(user.id, next, username);
}

/** The second step: the six-digit code from their authenticator app. */
export async function verifyTwoFactor(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const jar = await cookies();
  const raw = unsealToken(jar.get(PENDING_2FA)?.value ?? null);
  const pending = raw ? (JSON.parse(raw) as { userId: string; next: string; exp: number }) : null;
  if (!pending || pending.exp < Date.now()) {
    jar.delete(PENDING_2FA);
    redirect("/signin?expired=1");
  }
  const ip = await clientIp();
  const blocked = addressBlockedFor(ip);
  if (blocked) return { error: `Too many attempts from this network. Try again in ${minutes(blocked)}.`, username: "" };
  const user = await db.user.findUnique({ where: { id: pending.userId } });
  if (!user?.totpSecret || !user.totpEnabledAt || !user.active || user.status !== "active") redirect("/signin");
  const secret = unsealToken(user.totpSecret);
  const step = secret ? checkCode(secret, String(formData.get("code") ?? ""), new Date(), user.totpLastStep) : null;
  if (step === null) {
    noteFailure(ip);
    const count = user.failedSignIns + 1;
    if (count >= ACCOUNT_LOCK.attempts) {
      await db.$transaction([
        db.user.update({ where: { id: user.id }, data: { failedSignIns: 0, lockedUntil: new Date(Date.now() + ACCOUNT_LOCK.minutes * 60_000) } }),
        db.event.create({ data: { type: "account.locked", actorSystem: "sign-in", department: "administration", personId: user.personId, detail: `Locked for ${ACCOUNT_LOCK.minutes} minutes after ${ACCOUNT_LOCK.attempts} wrong two-factor codes.` } }),
      ]);
      jar.delete(PENDING_2FA);
      redirect("/signin?locked=1");
    }
    await db.user.update({ where: { id: user.id }, data: { failedSignIns: count } });
    return { error: "That code is not right. Use the newest code in your authenticator app.", username: "" };
  }
  jar.delete(PENDING_2FA);
  await db.user.update({ where: { id: user.id }, data: { totpLastStep: step, failedSignIns: 0 } });
  return completeSignIn(user.id, pending.next, user.username ?? "");
}

/** Everything after the identity is proved: roles, the work session, the cookie, and where to go. */
async function completeSignIn(userId: string, next: string, username: string): Promise<SignInState> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const { getEffectiveRoles } = await import("@/lib/db/roles");
  const roles = (await getEffectiveRoles(user.id))?.all ?? [];
  if (roles.length === 0) {
    return { error: "Your account has no role yet. Speak to Administration.", username };
  }
  // The department's role if they still hold it, otherwise the first they do.
  const deptRole = user.department ? departmentSpec(user.department)?.role : undefined;
  const role: Role = deptRole && roles.includes(deptRole) ? deptRole : roles[0]!;

  // Two-factor, where the Managing Director has made it required for this person's roles.
  const policy = ((await db.setting.findUnique({ where: { key: "security.require_2fa" } }))?.value ?? "off") as TwoFactorPolicy;
  const needs2fa = !user.totpEnabledAt && roles.some((r) => (STAFF_ROLES_NEEDING_2FA[policy] ?? []).includes(r));
  const must = user.mustChangePassword ? ("password" as const) : needs2fa ? ("2fa" as const) : undefined;

  // Close anything left open from a previous visit, then open one. Presence
  // is a record, so it has to be opened and closed rather than assumed.
  const now = new Date();
  await db.workSession.updateMany({
    where: { userId: user.id, signedOutAt: null },
    data: { signedOutAt: now },
  });
  const work = await db.workSession.create({
    data: { userId: user.id, activeRole: role },
  });

  await setSession({
    userId: user.id,
    personId: user.personId,
    name: user.displayName,
    activeRole: role,
    roles,
    workSessionId: work.id,
    issuedAt: Date.now(),
    ...(must ? { must } : {}),
  });

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { lastSignInAt: now } }),
    db.event.create({
      data: {
        type: "session.signed_in",
        actorUserId: user.id,
        actorRole: role,
        department: "administration",
        personId: user.personId,
        detail: `Signed in${user.totpEnabledAt ? " with two-factor" : ""}, working as ${role}.`,
      },
    }),
  ]);

  if (must) redirect(`/settings?must=${must}`);
  // Only a local path this role may open; anything else goes to its home.
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") && canAccessPath(role, next.split("?")[0]!)
      ? next
      : roleHome(role);
  redirect(safeNext);
}

export interface ResetState {
  error: string | null;
  done: string | null;
}

/**
 * "I've forgotten my password." An email with a link good for an hour — sent
 * only to the address on the account, and the same answer whether or not the
 * account exists, so nobody can use this to find out who works here.
 */
export async function requestPasswordReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const who = String(formData.get("who") ?? "").trim().toLowerCase();
  if (who.length < 3) return { error: "Enter your username or your email address.", done: null };
  const ip = await clientIp();
  const blocked = addressBlockedFor(ip);
  if (blocked) return { error: `Too many attempts from this network. Try again in ${minutes(blocked)}.`, done: null };
  noteFailure(ip); // A request counts towards the limit, so it cannot be used to flood someone's inbox.
  const same = "If that matches an account with an email address, a link to set a new password is on its way. It works for an hour. No email? Ask the Admin Manager to reset your password.";
  const user = await db.user.findFirst({ where: { OR: [{ username: who }, { email: { equals: who, mode: "insensitive" } }], active: true, status: "active" } });
  if (!user?.email) return { error: null, done: same };
  const { token, hash } = newLinkToken();
  const now = new Date();
  const link = `${await appUrl()}/signin/reset/${token}`;
  await db.$transaction(async (tx) => {
    await tx.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
    await tx.passwordReset.create({ data: { userId: user.id, tokenHash: hash, expiresAt: new Date(now.getTime() + 3_600_000), requestedIp: ip } });
    await sendEmail(
      {
        to: user.email!,
        subject: "Set a new password — Leon Guarding portal",
        body: `Hello ${user.displayName.split(" ")[0]},\n\nSomeone (hopefully you) asked to set a new password for your Leon Guarding portal account (${user.username}). Use this link within the next hour:\n\n${link}\n\nIf you did not ask, ignore this email — your password stays as it is.\n\nLeon Guarding`,
        purpose: "password_reset",
        personId: user.personId,
      },
      tx,
    );
    await tx.event.create({ data: { type: "account.reset_requested", actorSystem: "sign-in", department: "administration", personId: user.personId, detail: `A password reset link was requested (from ${ip}).` } });
  });
  return { error: null, done: same };
}

/** The link from that email: a new password, once. */
export async function resetPasswordWithLink(token: string, _prev: ResetState, formData: FormData): Promise<ResetState> {
  const t = String(token ?? "");
  const reset = t.length >= 20 && t.length <= 100 ? await db.passwordReset.findUnique({ where: { tokenHash: hashToken(t) }, include: { user: true } }) : null;
  if (!reset || reset.usedAt || reset.expiresAt < new Date() || !reset.user.active) return { error: "This link has expired or been used. Ask for a new one.", done: null };
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const problem = passwordProblem(next, reset.user.username);
  if (problem) return { error: problem, done: null };
  if (next !== confirm) return { error: "The two passwords are not the same.", done: null };
  const now = new Date();
  await db.$transaction([
    db.passwordReset.update({ where: { id: reset.id }, data: { usedAt: now } }),
    db.user.update({ where: { id: reset.userId }, data: { passwordHash: await hashPassword(next), mustChangePassword: false, failedSignIns: 0, lockedUntil: null } }),
    db.event.create({ data: { type: "account.password_reset_by_link", actorUserId: reset.userId, department: "administration", personId: reset.user.personId, detail: "Set a new password with an emailed reset link." } }),
  ]);
  return { error: null, done: "Your new password is set. Sign in with it now." };
}

function passwordProblem(pw: string, username: string | null): string | null {
  if (pw.length < PASSWORD_MIN) return `The new password needs at least ${PASSWORD_MIN} characters.`;
  if (username && pw.toLowerCase().includes(username.toLowerCase())) return "The new password should not contain your username.";
  if (process.env.NODE_ENV === "production" && pw === DEV_SEED_PASSWORD) return "Choose a password of your own.";
  return null;
}

export async function signOut() {
  const session = await getSession();
  if (session) {
    await db.workSession.updateMany({
      where: { id: session.workSessionId, signedOutAt: null },
      data: { signedOutAt: new Date() },
    });
    await db.event.create({
      data: {
        type: "session.signed_out",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "administration",
        personId: session.personId,
        detail: "Signed out.",
      },
    });
  }
  await clearSession();
  redirect("/signin");
}

/** Change the role being worked as. Refused unless the user holds it. */
export async function changeRole(formData: FormData) {
  await switchRole(String(formData.get("role") ?? "") as Role);
  redirect(String(formData.get("from") ?? "/"));
}
