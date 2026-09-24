"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { PASSWORD_MIN, USERNAME_PATTERN, departmentSpec } from "@/lib/accounts";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db/client";

export type SignUpField = "fullName" | "username" | "email" | "password" | "confirm" | "department";

export interface SignUpState {
  error: string | null;
  fields: Partial<Record<SignUpField, string>>;
  /** Echoed back so a refused form keeps what was typed (never the password). */
  values: { fullName: string; username: string; email: string; department: string };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Self-registration.
 *
 * Creates the Person (one per human being, as everywhere else) and the User on
 * top of it. Most departments are active straight away with the department's
 * role granted. Administration and HR – Vetting are created `pending` with no
 * role at all, and get one only when an administrator approves them — see
 * DEPARTMENTS in lib/accounts.ts for why.
 */
export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const values = {
    fullName: String(formData.get("fullName") ?? "").trim().replace(/\s+/g, " "),
    username: String(formData.get("username") ?? "").trim().toLowerCase(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    department: String(formData.get("department") ?? ""),
  };
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const fields: SignUpState["fields"] = {};
  if (values.fullName.length < 2 || values.fullName.length > 80) {
    fields.fullName = "Enter your full name.";
  }
  if (!USERNAME_PATTERN.test(values.username)) {
    fields.username = "3–32 characters: letters, numbers, dots, dashes or underscores.";
  }
  if (!EMAIL.test(values.email) || values.email.length > 254) {
    fields.email = "Enter a valid email address.";
  }
  if (password.length < PASSWORD_MIN) {
    fields.password = `Use at least ${PASSWORD_MIN} characters.`;
  } else if (password.length > 200) {
    fields.password = "Use 200 characters or fewer.";
  }
  if (confirm !== password) fields.confirm = "The passwords do not match.";
  const dept = departmentSpec(values.department);
  if (!dept) fields.department = "Choose your department.";
  // An officer's account attaches to their existing record, after proving who they are.
  else if (dept.id === "officer") fields.department = "Officers set up their account with their PIN — use “I’m a security officer”.";

  if (!fields.username || !fields.email) {
    const taken = await db.user.findMany({
      where: { OR: [{ username: values.username }, { email: values.email }] },
      select: { username: true, email: true },
    });
    if (taken.some((u) => u.username === values.username)) {
      fields.username = "That username is already taken.";
    }
    if (taken.some((u) => u.email === values.email)) {
      fields.email = "An account with this email already exists.";
    }
  }

  if (Object.keys(fields).length > 0 || !dept) {
    return { error: "Check the highlighted fields.", fields, values };
  }

  const passwordHash = await hashPassword(password);
  const pending = dept.needsApproval !== null;

  try {
    await db.$transaction(async (tx) => {
      const person = await tx.person.create({
        data: { fullName: values.fullName, email: values.email },
      });
      const user = await tx.user.create({
        data: {
          personId: person.id,
          displayName: values.fullName,
          username: values.username,
          email: values.email,
          passwordHash,
          department: dept.id,
          status: pending ? "pending" : "active",
        },
      });
      if (!pending) {
        // Self-granted, and recorded as such. Only departments whose role can
        // be self-granted reach this line.
        await tx.userRole.create({
          data: {
            userId: user.id,
            role: dept.role,
            grantedById: user.id,
            grantBasis: `Self-registered to ${dept.label}`,
          },
        });
      }
      await tx.event.create({
        data: {
          type: "account.registered",
          actorUserId: user.id,
          actorRole: pending ? null : dept.role,
          department: "administration",
          personId: person.id,
          detail: pending
            ? `Registered for ${dept.label}; waiting for approval.`
            : `Registered for ${dept.label}.`,
        },
      });
    });
  } catch (err) {
    // Two people racing for the same username: the unique index decides.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        error: "That username or email was taken a moment ago. Try another.",
        fields: {},
        values,
      };
    }
    throw err;
  }

  const qs = new URLSearchParams({ registered: pending ? "pending" : "active", u: values.username });
  redirect(`/signin?${qs}`);
}
