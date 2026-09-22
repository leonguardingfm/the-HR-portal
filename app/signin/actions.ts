"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { clearSession, getSession, setSession, switchRole } from "@/lib/auth/server";
import type { Role } from "@/lib/types";

/**
 * Development sign-in.
 *
 * THIS IS THE SSO SEAM AND IT IS NOT AUTHENTICATION. It proves nothing about
 * who is at the keyboard; it only checks that the person exists and holds the
 * role they are asking to work as. It refuses to run in production unless
 * someone deliberately sets ALLOW_DEV_SIGNIN, so it cannot be left switched on
 * by accident.
 *
 * In R1 this is replaced by the callback from company sign-on: the identity
 * provider authenticates, its subject is matched to User.ssoSubject, and
 * setSession is called with the same shape. Nothing downstream changes.
 */
export async function devSignIn(formData: FormData) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_SIGNIN !== "yes") {
    throw new Error(
      "Development sign-in is disabled. Configure company sign-on, or set ALLOW_DEV_SIGNIN=yes deliberately.",
    );
  }

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  const next = String(formData.get("next") ?? "/");

  const user = await db.user.findFirst({
    where: { id: userId, active: true },
    include: { person: true, roles: { where: { revokedAt: null } } },
  });
  if (!user) throw new Error("That user does not exist, or is no longer active.");

  const roles = user.roles.map((r) => r.role as Role);
  if (!roles.includes(role)) {
    throw new Error(`${user.displayName} does not hold the ${role} role.`);
  }

  // Close anything left open from a previous visit, then open one. Presence
  // is a record, so it has to be opened and closed rather than assumed.
  await db.workSession.updateMany({
    where: { userId: user.id, signedOutAt: null },
    data: { signedOutAt: new Date() },
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
  });

  await db.event.create({
    data: {
      type: "session.signed_in",
      actorUserId: user.id,
      actorRole: role,
      department: "administration",
      personId: user.personId,
      detail: `Signed in, working as ${role}.`,
    },
  });

  redirect(next.startsWith("/") ? next : "/");
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
