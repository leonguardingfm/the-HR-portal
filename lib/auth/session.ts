/**
 * The session.
 *
 * A signed, http-only cookie carrying the user id and the role they are
 * working as. Signed with Web Crypto rather than node:crypto so the same code
 * verifies in proxy.ts (edge runtime) and in server components.
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

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set (at least 16 characters) in production.");
  }
  // Development only, and deliberately obvious in a git diff.
  return "dev-only-insecure-secret-change-me";
}

const enc = new TextEncoder();

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const b64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of view) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64url = (s: string): Uint8Array<ArrayBuffer> => {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export async function sign(session: Session): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(session)));
  const mac = await crypto.subtle.sign("HMAC", await key(), enc.encode(payload));
  return `${payload}.${b64url(mac)}`;
}

/** Returns null for anything that does not verify — never throws at a caller. */
export async function verify(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await key(),
      fromB64url(mac),
      enc.encode(payload),
    );
    if (!ok) return null;
    const session = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as Session;
    if (Date.now() - session.issuedAt > MAX_AGE_SECONDS * 1000) return null;
    return session;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = MAX_AGE_SECONDS;
