/**
 * Keeping a person's details and their duplicate-check keys in step. When a
 * name, date of birth, email, phone or National Insurance number is corrected,
 * the keys are rewritten from it — and a correction that would make this
 * person the same as someone else is refused, rather than creating the
 * duplicate the keys exist to stop.
 */

import type { Prisma } from "@prisma/client";
import { identityKeys, IDENTITY_KEY_LABELS } from "@/lib/core/identity";

const OWNED = ["name_and_dob", "email", "phone", "national_insurance"] as const;

export async function rewriteIdentityKeys(
  tx: Prisma.TransactionClient,
  personId: string,
  p: { fullName: string; dateOfBirth: Date | null; email: string | null; phone: string | null; nationalInsurance: string | null },
): Promise<string | null> {
  const keys = identityKeys(p);
  if (p.nationalInsurance) keys.push({ kind: "national_insurance", value: p.nationalInsurance.replace(/\s+/g, "").toUpperCase() });
  const clash = keys.length
    ? await tx.personIdentityKey.findFirst({
        where: { personId: { not: personId }, OR: keys.map((k) => ({ kind: k.kind, value: k.value })) },
        include: { person: { select: { fullName: true } } },
      })
    : null;
  if (clash) return `That ${IDENTITY_KEY_LABELS[clash.kind]} already belongs to ${clash.person.fullName}. Check it — this may be the same person.`;
  await tx.personIdentityKey.deleteMany({ where: { personId, kind: { in: [...OWNED] } } });
  if (keys.length) await tx.personIdentityKey.createMany({ data: keys.map((k) => ({ personId, kind: k.kind, value: k.value })) });
  return null;
}
