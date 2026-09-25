/**
 * Two-factor sign-in codes (26 September 2026): the six-digit codes an
 * authenticator app shows — Microsoft Authenticator, Google Authenticator,
 * 1Password and the rest all use this standard (RFC 6238: a 30-second step,
 * HMAC-SHA1, six digits). Pure: no database here.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** A new secret: 20 random bytes, written the way the apps expect. */
export const newTotpSecret = () => base32Encode(randomBytes(20));

export const stepAt = (at: Date) => Math.floor(at.getTime() / 1000 / STEP_SECONDS);

export function codeFor(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", Buffer.from(base32Decode(secret))).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const n = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/**
 * The step a code belongs to, or null. One step either side is allowed, for a
 * phone clock a little out; a step already used is refused, so a code seen over
 * someone's shoulder cannot be used again.
 */
export function checkCode(secret: string, code: string, at: Date, lastStep: number | null): number | null {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const now = stepAt(at);
  for (const step of [now, now - 1, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    const expected = codeFor(secret, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return step;
  }
  return null;
}

/** What the app scans. */
export function otpauthUri(secret: string, account: string, issuer = "Leon Guarding"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}
