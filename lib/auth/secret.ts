/**
 * The sign-in secret (26 September 2026). One private value, AUTH_SECRET,
 * from which the keys that protect sign-in tokens and sealed data are derived.
 * It never leaves the server and is never stored with the data.
 *
 * In production it must be strong — at least 32 characters of real
 * randomness — or the portal refuses to start rather than run on a guessable
 * key. `npm run secret:new` makes one.
 *
 * Changing it (if it may have leaked, or as routine): put the old value in
 * AUTH_SECRET_PREVIOUS and the new one in AUTH_SECRET. Everything made with the
 * old one still opens, and everything new uses the new one. Run
 * `npm run secret:reseal` to move stored secrets across, and remove
 * AUTH_SECRET_PREVIOUS once sign-ins made before the change have expired
 * (twelve hours).
 */

export const DEV_SECRET = "dev-only-insecure-secret-change-me";
export const MIN_SECRET_LENGTH = 32;

/** Why a secret is not good enough, or null when it is. */
export function secretProblem(s: string | undefined | null): string | null {
  if (!s) return "it is not set";
  if (s.length < MIN_SECRET_LENGTH) return `it is ${s.length} characters; at least ${MIN_SECRET_LENGTH} are needed`;
  if (/dev-only|change-?me|insecure|example|password|^secret/i.test(s)) return "it is a placeholder, not a secret";
  if (new Set(s).size < 16) return "it is too repetitive to be random";
  return null;
}

const production = () => process.env.NODE_ENV === "production";

/** The current secret. In production a weak or missing one stops the portal, with the reason. */
export function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  const problem = secretProblem(s);
  if (!problem) return s!;
  if (production()) throw new Error(`AUTH_SECRET is not strong enough: ${problem}. Make one with: npm run secret:new`);
  // Development only, and deliberately obvious in a git diff.
  return s && s.length >= 16 ? s : DEV_SECRET;
}

/** The secret before the last change, while a change is under way. */
export function previousAuthSecret(): string | null {
  const s = process.env.AUTH_SECRET_PREVIOUS;
  if (!s) return null;
  if (s === process.env.AUTH_SECRET) return null;
  return s;
}
