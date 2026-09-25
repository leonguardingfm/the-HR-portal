/**
 * After changing AUTH_SECRET (26 September 2026): re-lock everything sealed
 * with the old secret — two-factor keys, and the links in emails still
 * waiting to be used — with the new one, so AUTH_SECRET_PREVIOUS can then be
 * removed without anyone losing two-factor or a link going dead.
 *
 *   AUTH_SECRET=<new> AUTH_SECRET_PREVIOUS=<old> npm run secret:reseal
 *
 * Safe to run more than once: anything already on the new secret is left alone.
 */

import { PrismaClient } from "@prisma/client";
import { authSecret, previousAuthSecret } from "../lib/auth/secret";
import { sealToken, unsealWith } from "../lib/db/email";

const db = new PrismaClient();

async function main() {
  const current = authSecret();
  const previous = previousAuthSecret();
  if (!previous) throw new Error("Set AUTH_SECRET_PREVIOUS to the old secret (and AUTH_SECRET to the new one) first.");

  const tally = { moved: 0, already: 0, unreadable: 0 };
  const move = (sealed: string | null): string | null => {
    if (!sealed) return null;
    if (unsealWith(sealed, current) !== null) {
      tally.already++;
      return null;
    }
    const plain = unsealWith(sealed, previous);
    if (plain === null) {
      tally.unreadable++;
      return null;
    }
    tally.moved++;
    return sealToken(plain);
  };

  for (const u of await db.user.findMany({ where: { totpSecret: { not: null } }, select: { id: true, totpSecret: true } })) {
    const next = move(u.totpSecret);
    if (next) await db.user.update({ where: { id: u.id }, data: { totpSecret: next } });
  }
  for (const i of await db.candidateInvite.findMany({ where: { tokenSealed: { not: null } }, select: { id: true, tokenSealed: true } })) {
    const next = move(i.tokenSealed);
    if (next) await db.candidateInvite.update({ where: { id: i.id }, data: { tokenSealed: next } });
  }
  for (const r of await db.referenceRequest.findMany({ where: { tokenSealed: { not: null } }, select: { id: true, tokenSealed: true } })) {
    const next = move(r.tokenSealed);
    if (next) await db.referenceRequest.update({ where: { id: r.id }, data: { tokenSealed: next } });
  }
  await db.event.create({
    data: { type: "security.secret_changed", actorSystem: "setup", department: "administration", detail: `Sealed values moved to the new sign-in secret: ${tally.moved} moved, ${tally.already} already on it, ${tally.unreadable} readable with neither.` },
  });
  console.log(`\nMoved ${tally.moved}; ${tally.already} were already on the new secret; ${tally.unreadable} could be opened with neither.`);
  console.log(tally.unreadable ? "Those few belong to neither secret — check you have the right old value before removing AUTH_SECRET_PREVIOUS.\n" : "Everything is on the new secret. Remove AUTH_SECRET_PREVIOUS once twelve hours have passed.\n");
}

main()
  .catch((e) => {
    console.error(`\n${(e as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
