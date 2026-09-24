"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { PASSWORD_MIN, USERNAME_PATTERN } from "@/lib/accounts";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/client";

export interface OfficerSignUpState {
  error: string | null;
  values: { pin: string; dateOfBirth: string; username: string };
}

/** The same words for every way it does not match, so the form cannot be used to find out who is on the books. */
const NO_MATCH = "Those details do not match an officer on our books. Check your PIN and date of birth, or ring Control.";

/**
 * An officer's own account (Control, 24 September 2026).
 *
 * An officer already exists — a person with a PIN and employment — so their
 * account attaches to that record rather than creating a new person. They
 * prove who they are with two things we hold and they know: their PIN and
 * their date of birth. It is active at once, with the officer role only:
 * their own duties and nothing else.
 *
 * Before going live this wants a third factor — a one-time code texted to the
 * mobile number on file (E16) — and a limit on attempts, like sign-in.
 */
export async function officerSignUp(_prev: OfficerSignUpState, formData: FormData): Promise<OfficerSignUpState> {
  const values = {
    pin: String(formData.get("pin") ?? "").trim(),
    dateOfBirth: String(formData.get("dateOfBirth") ?? "").trim(),
    username: String(formData.get("username") ?? "").trim().toLowerCase(),
  };
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const refuse = (error: string): OfficerSignUpState => ({ error, values });

  if (!/^\d{3,10}$/.test(values.pin)) return refuse("Enter your PIN — the number on your ID card.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.dateOfBirth)) return refuse("Enter your date of birth.");
  if (!USERNAME_PATTERN.test(values.username)) return refuse("Choose a username: 3–32 letters, numbers, dots, dashes or underscores.");
  if (password.length < PASSWORD_MIN) return refuse(`Choose a password of at least ${PASSWORD_MIN} characters.`);
  if (password.length > 200) return refuse("Use a password of 200 characters or fewer.");
  if (password !== confirm) return refuse("The passwords do not match.");

  const employment = await db.employment.findUnique({
    where: { pin: values.pin },
    include: { person: { include: { user: { select: { id: true } } } } },
  });
  const dob = employment?.person.dateOfBirth?.toISOString().slice(0, 10);
  if (!employment || employment.state === "ended" || dob !== values.dateOfBirth) return refuse(NO_MATCH);
  if (employment.person.user) return refuse("You already have an account. Sign in, or ring Control if you have forgotten your password.");
  if (await db.user.findUnique({ where: { username: values.username }, select: { id: true } })) return refuse("That username is taken. Choose another.");

  const passwordHash = await hashPassword(password);
  const person = employment.person;
  try {
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { personId: person.id, displayName: person.fullName, username: values.username, passwordHash, department: "officer", status: "active" },
      });
      await tx.userRole.create({
        data: { userId: user.id, role: "officer", grantedById: user.id, grantBasis: "Officer account: identity confirmed by PIN and date of birth" },
      });
      await tx.event.create({
        data: { type: "account.registered", actorUserId: user.id, actorRole: "officer", department: "administration", personId: person.id, detail: `Officer account set up by ${person.fullName} (PIN ${values.pin}).` },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return refuse("That username was taken a moment ago, or you already have an account.");
    throw err;
  }
  redirect(`/signin?${new URLSearchParams({ registered: "active", u: values.username })}`);
}
