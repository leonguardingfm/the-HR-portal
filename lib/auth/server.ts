import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/lib/types";
import { SESSION_COOKIE, SESSION_MAX_AGE, sign, verify, type Session } from "./session";

/**
 * Whether the account behind a cookie may still use the platform. Checked on
 * every request rather than trusted from the cookie, so suspending someone
 * takes effect on their next click and not twelve hours later. Cached per
 * request, because the shell, the page and its actions all ask.
 */
/**
 * The roles the account holds right now, or null when it may not sign in at
 * all. Checked on every request, so suspending an account, or taking away the
 * role someone is working in, ends it at once — not when the cookie runs out
 * (26 September 2026).
 */
const liveRoles = cache(async (userId: string): Promise<string[] | null> => {
  const { db } = await import("@/lib/db/client");
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { active: true, status: true },
  });
  if (!user?.active || user.status !== "active") return null;
  const { getEffectiveRoles } = await import("@/lib/db/roles");
  return (await getEffectiveRoles(userId))?.all ?? [];
});

/** The signed-in session, or null. Safe to call anywhere on the server. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const session = await verify(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const roles = await liveRoles(session.userId);
  if (!roles || !roles.includes(session.activeRole)) return null;
  return session;
}

/**
 * The session, or a redirect to sign-in.
 *
 * Used by every page and every action, so an unauthenticated request never
 * reaches a query. proxy.ts redirects too; this is the backstop for
 * anything the matcher misses.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    // A cookie that verifies but whose account is no longer live has to be
    // cleared, or proxy.ts would keep treating the browser as signed in. Only
    // a route handler may clear it, so hand over to one.
    const jar = await cookies();
    redirect(jar.has(SESSION_COOKIE) ? "/signin/ended" : "/signin");
  }
  return session;
}

export async function setSession(session: Session): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await sign(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * Change the role being worked as.
 *
 * Refused unless the user actually holds it — the select element in the top
 * bar is a suggestion, and this is the decision. The work session moves too,
 * so the presence board shows the change immediately.
 */
export async function switchRole(role: Role): Promise<void> {
  const session = await requireSession();
  // Resolved from the database, not from the cookie: a role lent to this
  // person an hour ago should be selectable without signing out and in again,
  // and one that expired an hour ago should not.
  const { getEffectiveRoles } = await import("@/lib/db/roles");
  const effective = await getEffectiveRoles(session.userId);
  if (!effective?.all.includes(role)) {
    throw new Error(`You do not hold the ${role} role, so you cannot work as it.`);
  }
  const { db } = await import("@/lib/db/client");
  await db.workSession.updateMany({
    where: { id: session.workSessionId, signedOutAt: null },
    data: { activeRole: role, lastSeenAt: new Date() },
  });
  // The session's role list is refreshed at the same time, so the switcher
  // offers what is true now rather than what was true at sign-in.
  await setSession({ ...session, activeRole: role, roles: effective.all });
}

/** Called on every shell render, so idle time on the board means something. */
export async function touchSession(workSessionId: string): Promise<void> {
  const { db } = await import("@/lib/db/client");
  await db.workSession
    .updateMany({ where: { id: workSessionId, signedOutAt: null }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);
}

export type { Session };
