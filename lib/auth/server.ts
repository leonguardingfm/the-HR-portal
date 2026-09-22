import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/lib/types";
import { SESSION_COOKIE, SESSION_MAX_AGE, sign, verify, type Session } from "./session";

/** The signed-in session, or null. Safe to call anywhere on the server. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verify(jar.get(SESSION_COOKIE)?.value);
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
  if (!session) redirect("/signin");
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
  if (!session.roles.includes(role)) {
    throw new Error(`You do not hold the ${role} role, so you cannot work as it.`);
  }
  const { db } = await import("@/lib/db/client");
  await db.workSession.updateMany({
    where: { id: session.workSessionId, signedOutAt: null },
    data: { activeRole: role, lastSeenAt: new Date() },
  });
  await setSession({ ...session, activeRole: role });
}

/** Called on every shell render, so idle time on the board means something. */
export async function touchSession(workSessionId: string): Promise<void> {
  const { db } = await import("@/lib/db/client");
  await db.workSession
    .updateMany({ where: { id: workSessionId, signedOutAt: null }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);
}

export type { Session };
