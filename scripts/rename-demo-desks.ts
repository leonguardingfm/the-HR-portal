/**
 * One-off, for an existing demonstration database (25 September 2026): the
 * two shared Control "desk" logins become individual people — Hannah Brooks
 * (team Alpha) and Daniel Okoye (team Bravo) — so the top bar and the
 * Performance hub show a person, not a desk. A fresh seed already has them.
 *
 *   npx tsx --env-file-if-exists=.env scripts/rename-demo-desks.ts
 */

import { db } from "../lib/db/client";
import { rewriteIdentityKeys } from "../lib/db/people";

const RENAMES = [
  { from: "control.alpha.desk", name: "Hannah Brooks", username: "hannah.brooks" },
  { from: "control.bravo.desk", name: "Daniel Okoye", username: "daniel.okoye" },
];

async function main() {
  for (const r of RENAMES) {
    const u = await db.user.findUnique({ where: { username: r.from }, include: { person: true } });
    if (!u) {
      console.log(`${r.from}: not here (already renamed?)`);
      continue;
    }
    const email = `${r.username}@example.com`;
    const clash = await db.$transaction(async (tx) => {
      const c = await rewriteIdentityKeys(tx, u.personId, { fullName: r.name, dateOfBirth: u.person.dateOfBirth, email, phone: u.person.phone, nationalInsurance: u.person.nationalInsurance });
      if (c) return c;
      await tx.person.update({ where: { id: u.personId }, data: { fullName: r.name, email } });
      await tx.user.update({ where: { id: u.id }, data: { displayName: r.name, username: r.username, email } });
      await tx.event.create({ data: { type: "account.renamed", actorSystem: "demo-setup", department: "administration", personId: u.personId, detail: `Demonstration login "${u.displayName}" (${r.from}) is now ${r.name} (${r.username}): Control logins are one per person, not per desk.` } });
      return null;
    });
    console.log(clash ? `${r.from}: refused — ${clash}` : `${r.from} → ${r.username} (${r.name})`);
  }
}

main().finally(() => db.$disconnect());
