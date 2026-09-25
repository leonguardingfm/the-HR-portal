/**
 * Demonstration client portal logins (26 September 2026) — for trying the
 * client portal, and for the browser tests. Not for production: the go-live
 * checklist refuses example.com accounts.
 *
 *   npm run demo:client
 *
 * Makes two client contacts on the demonstration password: one for Meridian
 * Logistics seeing all its sites, and one for Riverside Estates — so the two
 * can be compared, and neither can see the other. Meridian's contract names
 * officers with their SIA numbers and pays for every extra; Riverside's names
 * nobody and has the portal alone.
 */

import { DEV_SEED_PASSWORD } from "../lib/accounts";
import { hashPassword } from "../lib/auth/password";
import { db } from "../lib/db/client";

const CONTACTS = [
  { client: "Meridian Logistics", name: "Grace Whitfield", username: "grace.meridian", identity: "name_and_sia" as const, live: true, siteIssues: true },
  { client: "Riverside Estates", name: "Tom Ashby", username: "tom.riverside", identity: "none" as const, live: false, siteIssues: false },
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Demonstration logins are not for production.");
  const hash = await hashPassword(DEV_SEED_PASSWORD);
  const granter = await db.userRole.findFirst({ where: { role: "top_management", revokedAt: null }, select: { userId: true } });
  if (!granter) throw new Error("Run npm run db:seed first.");
  for (const c of CONTACTS) {
    const client = await db.client.findUnique({ where: { name: c.client } });
    if (!client) throw new Error(`No client "${c.client}" — run npm run db:seed first.`);
    // Meridian pays for every extra; Riverside for the portal alone.
    const now = new Date();
    await db.client.update({ where: { id: client.id }, data: { officerIdentity: c.identity, portalSince: client.portalSince ?? now, liveSince: c.live ? (client.liveSince ?? now) : null, siteIssuesSince: c.siteIssues ? (client.siteIssuesSince ?? now) : null } });
    const existing = await db.user.findUnique({ where: { username: c.username } });
    if (existing) {
      await db.user.update({ where: { id: existing.id }, data: { passwordHash: hash, active: true, status: "active", mustChangePassword: false, failedSignIns: 0, lockedUntil: null } });
      await db.userRole.updateMany({ where: { userId: existing.id, role: "client" }, data: { revokedAt: null } });
      console.log(`${c.username} (${c.client}) — ready again`);
      continue;
    }
    const email = `${c.username}@example.com`;
    await db.$transaction(async (tx) => {
      const person = await tx.person.create({ data: { fullName: c.name, email } });
      const user = await tx.user.create({ data: { personId: person.id, displayName: c.name, username: c.username, email, passwordHash: hash, department: "client_portal", status: "active", clientId: client.id } });
      await tx.userRole.create({ data: { userId: user.id, role: "client", grantedById: granter.userId, grantBasis: "Demonstration client portal login." } });
      await tx.event.create({ data: { type: "client.portal_login_added", actorSystem: "demo-setup", department: "account_management", personId: person.id, detail: `Demonstration client portal login for ${c.name} (${c.client}).` } });
    });
    console.log(`${c.username} (${c.client}) — made`);
  }
  console.log(`\nSign in at /signin with either username and the demonstration password.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
