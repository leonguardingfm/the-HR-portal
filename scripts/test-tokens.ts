/**
 * Sign-in tokens and the secret behind them (26 September 2026): what opens,
 * what does not, and changing the secret without locking anyone out.
 *
 *   npm run test:tokens
 */

import { randomBytes } from "node:crypto";
import { SignJWT, base64url } from "jose";
import { readToken, issueToken } from "../lib/auth/jwt";
import { authSecret, secretProblem } from "../lib/auth/secret";
import { sign, verify, type Session } from "../lib/auth/session";
import { sealToken, unsealToken, unsealWith } from "../lib/db/email";

const env = process.env as Record<string, string | undefined>;
let fails = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  <- ${detail}` : ""}`);
  if (!ok) fails++;
};
const strong = () => randomBytes(48).toString("base64url");

async function main() {
  const A = strong();
  const B = strong();
  env.AUTH_SECRET = A;
  delete env.AUTH_SECRET_PREVIOUS;

  // --- The secret -----------------------------------------------------------
  check("a missing secret is refused", secretProblem(undefined) !== null);
  check("a short one is refused", secretProblem("abc123-short-secret") !== null);
  check("the development placeholder is refused", secretProblem("dev-only-insecure-secret-change-me-please-now") !== null);
  check("a repetitive one is refused", secretProblem("a".repeat(40)) !== null);
  check("64 random bytes are accepted", secretProblem(A) === null);
  env.NODE_ENV = "production";
  env.AUTH_SECRET = "too-short";
  let threw = false;
  try {
    authSecret();
  } catch {
    threw = true;
  }
  check("in production a weak secret stops the portal", threw);
  env.AUTH_SECRET = A;
  check("…and a strong one is used", authSecret() === A);
  env.NODE_ENV = "test";

  // --- A sign-in token ------------------------------------------------------
  const session: Session = { userId: "u-123", personId: "p-9", name: "Hannah Brooks", activeRole: "control", roles: ["control"], workSessionId: "ws-1", issuedAt: Date.now(), must: "2fa" };
  const token = await sign(session);
  const parts = token.split(".");
  check("the cookie is an encrypted JWT (five parts)", parts.length === 5);
  const header = JSON.parse(new TextDecoder().decode(base64url.decode(parts[0])));
  check("…whose header says JWT, dir, A256GCM, with a key id", header.typ === "JWT" && header.alg === "dir" && header.enc === "A256GCM" && typeof header.kid === "string", JSON.stringify(header));
  const readable = parts.map((p) => {
    try {
      return new TextDecoder().decode(base64url.decode(p));
    } catch {
      return "";
    }
  }).join(" ");
  check("…and nobody holding a copy can read who it is for", !readable.includes("Hannah") && !readable.includes("u-123") && !readable.includes("control"));
  const back = await verify(token);
  check("it opens to the same person and role", back?.userId === "u-123" && back.activeRole === "control" && back.name === "Hannah Brooks" && back.must === "2fa" && back.workSessionId === "ws-1", JSON.stringify(back));

  const flipped = parts.map((p, i) => (i === 3 ? (p[0] === "A" ? "B" : "A") + p.slice(1) : p)).join(".");
  check("one changed character and it will not open", (await verify(flipped)) === null);
  check("…nor a token cut short", (await verify(parts.slice(0, 4).join("."))) === null);
  check("…nor an unsigned one (alg: none)", (await verify(`${base64url.encode('{"alg":"none"}')}.${base64url.encode('{"sub":"u-123","activeRole":"top_management"}')}.`)) === null);
  const forged = await new SignJWT({ activeRole: "top_management", roles: ["top_management"], workSessionId: "x" }).setProtectedHeader({ alg: "HS256" }).setSubject("u-123").setIssuer("leon-portal").setAudience("leon-portal/session").setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(A));
  check("…nor a signed-but-not-encrypted JWT made with the secret itself", (await verify(forged)) === null);

  const step = await issueToken("2fa-pending", "u-123", { next: "/" }, 300);
  check("a two-factor step token cannot be used as a sign-in", (await verify(step)) === null);
  check("…though it opens as what it is", (await readToken("2fa-pending", step))?.sub === "u-123");

  env.AUTH_SECRET = B;
  check("a token made with another secret will not open", (await verify(token)) === null);

  // --- Changing the secret --------------------------------------------------
  env.AUTH_SECRET_PREVIOUS = A;
  check("during a change, tokens made with the old secret still open", (await verify(token))?.userId === "u-123");
  const fresh = await sign(session);
  const freshKid = JSON.parse(new TextDecoder().decode(base64url.decode(fresh.split(".")[0]))).kid;
  check("…and new ones are made with the new secret", freshKid !== header.kid);
  delete env.AUTH_SECRET_PREVIOUS;
  check("…and once the old one is removed, its tokens stop", (await verify(token)) === null && (await verify(fresh))?.userId === "u-123");

  env.AUTH_SECRET = A;
  const sealed = sealToken("JBSWY3DPEHPK3PXP");
  env.AUTH_SECRET = B;
  env.AUTH_SECRET_PREVIOUS = A;
  check("sealed two-factor keys still open during a change", unsealToken(sealed) === "JBSWY3DPEHPK3PXP");
  const resealed = sealToken(unsealWith(sealed, A)!);
  delete env.AUTH_SECRET_PREVIOUS;
  check("…and once moved across, open with the new secret alone", unsealToken(resealed) === "JBSWY3DPEHPK3PXP" && unsealToken(sealed) === null);

  // --- Expiry -----------------------------------------------------------------
  const short = await issueToken("session", "u-123", { activeRole: "control", roles: ["control"], workSessionId: "ws" }, 1);
  await new Promise((r) => setTimeout(r, 7_000));
  check("an expired token will not open", (await verify(short)) === null);

  console.log(fails ? `\n${fails} FAILED` : "\nAll token checks passed.");
  process.exit(fails ? 1 : 0);
}

main();
