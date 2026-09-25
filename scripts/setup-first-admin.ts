/**
 * The first Managing Director on a new production database (26 September
 * 2026). Everyone else is then added from inside the portal, by people, with a
 * record of who did it.
 *
 *   npm run setup:first-admin -- --name "Full Name" --username first.last --email name@company.co.uk
 *
 * Prints a temporary password once. They must change it, and set up two-factor,
 * when they first sign in. Refuses if a Managing Director already exists.
 */

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";

const db = new PrismaClient();

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v || v.startsWith("--")) throw new Error(`Give --${name}. Usage: npm run setup:first-admin -- --name "Full Name" --username first.last --email name@company.co.uk`);
  return v.trim();
}

function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("").replace(/(.{4})(?=.)/g, "$1-");
}

async function main() {
  const name = arg("name");
  const username = arg("username").toLowerCase();
  const email = arg("email").toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error("A username is 3–40 letters, numbers, dots, dashes or underscores.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That is not an email address.");
  if (email.endsWith("@example.com")) throw new Error("example.com is for demonstration accounts. Use a real address.");
  const existing = await db.userRole.count({ where: { role: "top_management", revokedAt: null, user: { active: true } } });
  if (existing) throw new Error("There is already a Managing Director. Add people from inside the portal (System → People and roles).");
  if (await db.user.findFirst({ where: { OR: [{ username }, { email }] } })) throw new Error("That username or email is already in use.");

  const temp = temporaryPassword();
  const passwordHash = await hashPassword(temp);
  await db.$transaction(async (tx) => {
    const person = await tx.person.create({ data: { fullName: name, email, lifecycle: "confirmed_officer" } });
    const user = await tx.user.create({ data: { personId: person.id, displayName: name, username, email, passwordHash, status: "active", department: "administration", mustChangePassword: true } });
    // The first grant has nobody before it to make it, so it is recorded as its own.
    await tx.userRole.create({ data: { userId: user.id, role: "top_management", grantedById: user.id, grantBasis: "First Managing Director, set up from the server when the portal was installed." } });
    await tx.setting.upsert({
      where: { key: "security.require_2fa" },
      create: { key: "security.require_2fa", value: "managers", valueType: "text", label: "Who must use two-factor sign-in", usedBy: "sign-in", updatedById: user.id },
      update: {},
    });
    await tx.event.create({ data: { type: "account.first_admin", actorSystem: "setup", department: "administration", personId: person.id, detail: `${name} (${username}) set up as the first Managing Director from the server. Two-factor sign-in is required for managers.` } });
  });
  console.log(`\n${name} can now sign in.\n\n  Username:            ${username}\n  Temporary password:  ${temp}\n\nThis is shown once and is not stored anywhere readable. They will be asked to choose their own password and set up two-factor sign-in straight away.\n`);
}

main()
  .catch((e) => {
    console.error(`\n${(e as Error).message}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
