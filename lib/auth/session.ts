/**
 * The session.
 *
 * An http-only cookie carrying the user id and the role they are working as,
 * as an encrypted JWT. Web Crypto and jose rather than node:crypto, so the
 * same code opens it in proxy.ts and in server components.
 *
 * THIS IS THE SSO SEAM. `createSession` is called today by a development
 * sign-in that checks a person exists and holds the role. In R1 it is called
 * instead by the callback from company sign-on (Microsoft Entra ID or Google
 * Workspace), with the identity provider's subject mapped onto User.ssoSubject.
 * Nothing downstream changes: everything reads getSession().
 *
 * What the cookie is NOT: a permission. It carries who you are and what you
 * are working as. What you may do with that is lib/auth/permissions.ts, checked
 * on every action.
 */

import type { Role } from "@/lib/types";
import { issueToken, readToken } from "./jwt";

const COOKIE = "leon_session";
const MAX_AGE_SECONDS = 12 * 60 * 60;

export interface Session {
  userId: string;
  personId: string;
  name: string;
  activeRole: Role;
  /** Every role the user holds, so the role switcher cannot offer more. */
  roles: Role[];
  /** The WorkSession row. This is what makes presence a record rather than a
   *  guess: "who is doing what right now" is a query, not an inference. */
  workSessionId: string;
  issuedAt: number;
  /**
   * Something they must do before anything else (26 September 2026): choose a
   * new password after a reset, or set up two-factor where it is required.
   * proxy.ts keeps them on My settings until it is done.
   */
  must?: "password" | "2fa";
}

/**
 * The cookie is an encrypted JSON Web Token (26 September 2026 — see
 * lib/auth/jwt.ts): unreadable and tamper-proof, for signing in only, and
 * stopping after twelve hours. Who it is for is the token's subject.
 */
export async function sign(session: Session): Promise<string> {
  const { userId, issuedAt: _issuedAt, ...rest } = session;
  return issueToken("session", userId, rest, MAX_AGE_SECONDS);
}

/** Returns null for anything that does not open — never throws at a caller. */
export async function verify(token: string | undefined | null): Promise<Session | null> {
  const c = await readToken("session", token);
  if (!c || typeof c.sub !== "string" || typeof c.activeRole !== "string" || typeof c.workSessionId !== "string" || !Array.isArray(c.roles)) return null;
  return {
    userId: c.sub,
    personId: String(c.personId ?? ""),
    name: String(c.name ?? ""),
    activeRole: c.activeRole as Role,
    roles: c.roles as Role[],
    workSessionId: c.workSessionId,
    issuedAt: (c.iat ?? 0) * 1000,
    ...(c.must === "password" || c.must === "2fa" ? { must: c.must } : {}),
  };
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = MAX_AGE_SECONDS;
