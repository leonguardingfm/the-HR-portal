/**
 * Duplicate-check keys, normalised.
 *
 * PersonIdentityKey is unique per (kind, value), so the database is what stops
 * a second record for the same human being. That only works if every writer
 * normalises the same way, which is why the rules live here and nowhere else.
 */

import type { IdentityKeyKind } from "@prisma/client";

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Digits only, with a UK +44 prefix folded back to a leading 0. */
export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D+/g, "");
  return digits.startsWith("44") && digits.length === 12 ? `0${digits.slice(2)}` : digits;
}

/** Same shape the seed writes: lower-case name without spaces, then the ISO date. */
export function nameAndDobKey(fullName: string, dateOfBirth: Date): string {
  return `${fullName.toLowerCase().replace(/\s+/g, "")}|${dateOfBirth.toISOString().slice(0, 10)}`;
}

export function identityKeys(p: {
  fullName: string;
  dateOfBirth: Date | null;
  email: string | null;
  phone: string | null;
}): { kind: IdentityKeyKind; value: string }[] {
  const keys: { kind: IdentityKeyKind; value: string }[] = [];
  if (p.dateOfBirth) keys.push({ kind: "name_and_dob", value: nameAndDobKey(p.fullName, p.dateOfBirth) });
  if (p.email) keys.push({ kind: "email", value: normaliseEmail(p.email) });
  if (p.phone) {
    const phone = normalisePhone(p.phone);
    if (phone.length >= 10) keys.push({ kind: "phone", value: phone });
  }
  return keys;
}

export const IDENTITY_KEY_LABELS: Record<IdentityKeyKind, string> = {
  name_and_dob: "name and date of birth",
  national_insurance: "National Insurance number",
  sia_licence: "SIA licence number",
  phone: "phone number",
  email: "email address",
};
