"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { clearSession, getSession, setSession, switchRole } from "@/lib/auth/server";
import { canAccessPath } from "@/components/layout/nav";
import { departmentSpec, roleHome } from "@/lib/accounts";
import { decoyHash, verifyPassword } from "@/lib/auth/password";
import type { Role } from "@/lib/types";

export interface SignInState {
  error: string | null;
  /** Echoed back so a failed attempt does not clear the username field. */
  username: string;
}

/**
 * Username and password sign-in.
 *
 * No role is asked for: the account's department decided it at registration,
 * and anything else the person holds is offered by the role switcher in the
 * top bar once they are in.
 *
 * THIS IS STILL THE SSO SEAM. When company sign-on arrives, its callback ends
 * in the same setSession call and nothing downstream changes.
 */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!username || !password) {
    return { error: "Enter your username and password.", username };
  }

  const user = await db.user.findUnique({ where: { username } });
  // Always run the hash, so a username that does not exist takes as long to
  // refuse as a wrong password and the timing does not say which it was.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await decoyHash()));
  if (!user || !ok) {
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

  const { getEffectiveRoles } = await import("@/lib/db/roles");
  const roles = (await getEffectiveRoles(user.id))?.all ?? [];
  if (roles.length === 0) {
    return { error: "Your account has no role yet. Speak to Administration.", username };
  }
  // The department's role if they still hold it, otherwise the first they do.
  const deptRole = user.department ? departmentSpec(user.department)?.role : undefined;
  const role: Role = deptRole && roles.includes(deptRole) ? deptRole : roles[0]!;

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

  // Only a local path this role may open; anything else goes to its home.
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") && canAccessPath(role, next.split("?")[0]!)
      ? next
      : roleHome(role);
  redirect(safeNext);
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
