/**
 * Sign-in tokens as JSON Web Tokens (26 September 2026).
 *
 * Each token is an encrypted JWT (JWE, compact form: "dir" with A256GCM), so
 * it is both sealed — nobody holding a copy can read who it belongs to or what
 * roles they hold — and tamper-proof: any change and it will not open. Each
 * carries the standard claims, checked on every use:
 *
 *   iss  leon-portal                     who issued it
 *   aud  leon-portal/<purpose>           what it is for — a two-factor step
 *                                        token cannot be used as a sign-in
 *   sub  the user                        whom it is for
 *   iat, exp                             when it was made, when it stops
 *   jti                                  a unique id
 *
 * The key is derived from AUTH_SECRET (HKDF-SHA-256) for this use only, so no
 * other part of the portal shares it. The header names the key by a short
 * fingerprint ("kid"), so tokens made before a change of secret still open
 * while AUTH_SECRET_PREVIOUS is set. Web Crypto and jose only, so the same
 * code runs in proxy.ts and on the server.
 */

import { EncryptJWT, base64url, decodeProtectedHeader, jwtDecrypt, type JWTPayload } from "jose";
import { authSecret, previousAuthSecret } from "./secret";

export const ISSUER = "leon-portal";
export type TokenPurpose = "session" | "2fa-pending";

const enc = new TextEncoder();
const keys = new Map<string, Promise<{ key: Uint8Array; kid: string }>>();

/** The token key for a secret, and its fingerprint. Derived once per secret. */
function tokenKey(secret: string) {
  let k = keys.get(secret);
  if (!k) {
    k = (async () => {
      const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: enc.encode("leon-portal"), info: enc.encode("jwt:v1") }, base, 256);
      const key = new Uint8Array(bits);
      const kid = base64url.encode(new Uint8Array(await crypto.subtle.digest("SHA-256", key))).slice(0, 12);
      return { key, kid };
    })();
    keys.set(secret, k);
  }
  return k;
}

/** A new token for one purpose, good for ttlSeconds. */
export async function issueToken(purpose: TokenPurpose, subject: string, claims: Record<string, unknown>, ttlSeconds: number): Promise<string> {
  const { key, kid } = await tokenKey(authSecret());
  return new EncryptJWT(claims)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "JWT", kid })
    .setIssuer(ISSUER)
    .setAudience(`${ISSUER}/${purpose}`)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(`${Math.max(1, Math.round(ttlSeconds))}s`)
    .setJti(crypto.randomUUID())
    .encrypt(key);
}

/** The token's claims — or null for anything that does not open, is for something else, or has expired. Never throws. */
export async function readToken(purpose: TokenPurpose, token: string | undefined | null): Promise<(JWTPayload & Record<string, unknown>) | null> {
  if (!token || token.split(".").length !== 5) return null;
  try {
    const { kid, alg, enc: e } = decodeProtectedHeader(token);
    if (alg !== "dir" || e !== "A256GCM") return null;
    const secrets = [authSecret(), previousAuthSecret()].filter((s): s is string => !!s);
    for (const s of secrets) {
      const k = await tokenKey(s);
      if (kid && kid !== k.kid) continue;
      const { payload } = await jwtDecrypt(token, k.key, {
        issuer: ISSUER,
        audience: `${ISSUER}/${purpose}`,
        keyManagementAlgorithms: ["dir"],
        contentEncryptionAlgorithms: ["A256GCM"],
        requiredClaims: ["sub", "iat", "exp", "jti"],
        clockTolerance: 5,
      });
      return payload as JWTPayload & Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
