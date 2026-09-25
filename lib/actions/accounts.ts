"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { departmentSpec } from "@/lib/accounts";
import { canGrantRole, isScreeningRole } from "@/lib/roles";
import type { Role } from "@/lib/types";
import { refused, ok, type ActionResult } from "./types";

/**
 * Deciding registrations, and suspending or reactivating accounts.
 *
 * Same shape as every other write: guard, re-read, then write with the event
 * in the same transaction. Approval is the only way a pending account gets a
 * role, and the role it gets is the department's, never one typed in.
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { session: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) {
    const spec = ACTIONS[action];
    return {
      session,
      error: refused(
        `${spec.what} belongs to ${spec.owner}. You are working as ${session.activeRole.replace(/_/g, " ")}, so the platform refuses it.`,
      ),
    };
  }
  return { session, error: null };
}

const refresh = () => {
  revalidatePath("/admin/users");
  revalidatePath("/system");
};

export async function approveAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("account.review");
  if (error || !session) return error!;

  const userId = String(formData.get("userId") ?? "");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return refused("That account no longer exists.");
  if (user.status !== "pending") return refused("Only a pending registration can be approved.");
  const dept = user.department ? departmentSpec(user.department) : undefined;
  if (!dept) return refused("This registration has no department, so there is no role to grant.");

  // A screening role needs the 6.1/6.2 evidence confirmed by the approver, and
  // the same rule every other grant goes through decides whether it is enough.
  const screening = isScreeningRole(dept.role);
  const evidence = {
    ownScreeningComplete: formData.get("screened") === "on",
    confidentialityAgreementOnFile: formData.get("nda") === "on",
    trainingReviewedAt: formData.get("trained") === "on" ? new Date() : null,
  };
  if (screening) {
    const check = canGrantRole({
      role: dept.role,
      ...evidence,
      trainingReviewedAt: evidence.trainingReviewedAt?.toISOString() ?? null,
    });
    if (!check.permitted) return refused(`${check.reason}. Confirm all three before approving.`);
  }

  const now = new Date();
  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: {
        status: "active",
        reviewedAt: now,
        reviewedById: session.userId,
        ...(screening ? evidence : {}),
      },
    }),
    db.userRole.upsert({
      where: { userId_role: { userId: user.id, role: dept.role } },
      create: {
        userId: user.id,
        role: dept.role,
        grantedById: session.userId,
        grantBasis: screening
          ? `Registration approved for ${dept.label}; own screening, NDA and training confirmed (6.1, 6.2)`
          : `Registration approved for ${dept.label}`,
      },
      update: { revokedAt: null, grantedById: session.userId, grantedAt: now },
    }),
    db.event.create({
      data: {
        type: "account.approved",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "administration",
        personId: user.personId,
        detail: `Approved ${user.displayName} for ${dept.label}.`,
      },
    }),
  ]);

  refresh();
  return ok(`${user.displayName} can now sign in as ${dept.label}.`);
}

export async function rejectAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("account.review");
  if (error || !session) return error!;

  const userId = String(formData.get("userId") ?? "");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return refused("That account no longer exists.");
  if (user.status !== "pending") return refused("Only a pending registration can be rejected.");

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { status: "rejected", reviewedAt: new Date(), reviewedById: session.userId },
    }),
    db.event.create({
      data: {
        type: "account.rejected",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "administration",
        personId: user.personId,
        detail: `Rejected the registration from ${user.displayName}.`,
      },
    }),
  ]);

  refresh();
  return ok(`Registration from ${user.displayName} rejected.`);
}

export async function suspendAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("account.review");
  if (error || !session) return error!;

  const userId = String(formData.get("userId") ?? "");
  if (userId === session.userId) return refused("You cannot suspend your own account.");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return refused("That account no longer exists.");
  if (user.status !== "active") return refused("Only an active account can be suspended.");

  const now = new Date();
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { status: "suspended" } }),
    // Signed out everywhere at once: presence stops showing them as working.
    db.workSession.updateMany({
      where: { userId: user.id, signedOutAt: null },
      data: { signedOutAt: now },
    }),
    db.event.create({
      data: {
        type: "account.suspended",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "administration",
        personId: user.personId,
        detail: `Suspended ${user.displayName}.`,
      },
    }),
  ]);

  refresh();
  return ok(`${user.displayName} is suspended and has been signed out.`);
}

export async function reactivateAccount(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { session, error } = await guard("account.review");
  if (error || !session) return error!;

  const userId = String(formData.get("userId") ?? "");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return refused("That account no longer exists.");
  if (user.status !== "suspended") return refused("Only a suspended account can be reactivated.");

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { status: "active" } }),
    db.event.create({
      data: {
        type: "account.reactivated",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "administration",
        personId: user.personId,
        detail: `Reactivated ${user.displayName}.`,
      },
    }),
  ]);

  refresh();
  return ok(`${user.displayName} can sign in again.`);
}

// ---------------------------------------------------------------------------
// Roles, resets and two-factor (26 September 2026)
// ---------------------------------------------------------------------------

/** Roles given here. An officer's comes with their employment; a client's with their organisation. */
const GRANTABLE: Role[] = ["control", "shift_supervisor", "operations_manager", "recruitment", "recruitment_manager", "vetting_admin", "vetting_controller", "admin_officer", "admin_manager", "finance_officer", "top_management", "auditor", "sales"];

/** Give someone a role — a promotion, a second job, cover that is not temporary. Temporary cover is a delegation. */
export async function grantRole(userId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("role.grant");
  if (error || !session) return error!;
  const role = String(formData.get("role") ?? "") as Role;
  const basis = String(formData.get("basis") ?? "").trim().slice(0, 300);
  if (!GRANTABLE.includes(role)) return refused("Choose a role from the list.");
  if (basis.length < 3) return refused("Say why — for example “Promoted to Shift Supervisor, 1 October”.");
  if (String(userId) === session.userId) return refused("Someone else grants your own roles.");
  const user = await db.user.findUnique({ where: { id: String(userId) }, include: { roles: true } });
  if (!user || !user.active || user.status !== "active") return refused("That account is not active.");
  if (user.roles.some((r) => r.role === role && !r.revokedAt)) return refused("They already hold that role.");
  const check = canGrantRole({ role, ownScreeningComplete: user.ownScreeningComplete, confidentialityAgreementOnFile: user.confidentialityAgreementOnFile, trainingReviewedAt: user.trainingReviewedAt?.toISOString() ?? null });
  if (!check.permitted) return refused(`${check.reason}. Record it on their account first.`);
  await db.$transaction([
    db.userRole.upsert({
      where: { userId_role: { userId: user.id, role } },
      create: { userId: user.id, role, grantedById: session.userId, grantBasis: basis },
      update: { revokedAt: null, grantedById: session.userId, grantedAt: new Date(), grantBasis: basis },
    }),
    db.event.create({ data: { type: "role.granted", actorUserId: session.userId, actorRole: session.activeRole, department: "administration", personId: user.personId, detail: `${user.displayName} given the ${role.replace(/_/g, " ")} role: ${basis}` } }),
  ]);
  refresh();
  return ok(`${user.displayName} now holds that role. They switch to it from their name in the top bar.`);
}

export async function revokeRole(userId: string, role: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("role.grant");
  if (error || !session) return error!;
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (reason.length < 3) return refused("Say why the role is being taken away.");
  const held = await db.userRole.findUnique({ where: { userId_role: { userId: String(userId), role: role as Role } }, include: { user: true } });
  if (!held || held.revokedAt) return refused("They do not hold that role.");
  if (role === "top_management") {
    if (held.userId === session.userId) return refused("You cannot take away your own higher-management role.");
    const others = await db.userRole.count({ where: { role: "top_management", revokedAt: null, userId: { not: held.userId }, user: { active: true } } });
    if (others === 0) return refused("They are the only one in higher management — someone must always hold it.");
  }
  await db.$transaction([
    db.userRole.update({ where: { id: held.id }, data: { revokedAt: new Date() } }),
    db.event.create({ data: { type: "role.revoked", actorUserId: session.userId, actorRole: session.activeRole, department: "administration", personId: held.user.personId, detail: `${held.user.displayName}'s ${role.replace(/_/g, " ")} role taken away: ${reason}` } }),
  ]);
  refresh();
  return ok(`Done. If they were working in that role, they are signed out of it at once.`);
}

/** Readable, and hard to guess: 12 characters without look-alikes. */
function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("").replace(/(.{4})(?=.)/g, "$1-");
}

/**
 * Forgotten password, no email yet: a temporary password to read out to them.
 * It works once — they must choose their own straight after signing in.
 */
export async function resetUserPassword(userId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("account.reset");
  if (error || !session) return error!;
  if (String(userId) === session.userId) return refused("Change your own password in My settings.");
  const user = await db.user.findUnique({ where: { id: String(userId) } });
  if (!user?.username) return refused("That account has no username to sign in with.");
  const temp = temporaryPassword();
  const { hashPassword } = await import("@/lib/auth/password");
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(temp), mustChangePassword: true, failedSignIns: 0, lockedUntil: null } }),
    db.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    db.event.create({ data: { type: "account.password_reset", actorUserId: session.userId, actorRole: session.activeRole, department: "administration", personId: user.personId, detail: `${user.displayName}'s password reset to a temporary one; they must choose their own when they next sign in.` } }),
  ]);
  refresh();
  return ok(`Temporary password for ${user.username}: ${temp} — give it to them in person or by phone. It is shown once; they choose their own straight after signing in.`);
}

/** A lost or new phone: two-factor off, so they can sign in and set it up again. */
export async function resetUserTwoFactor(userId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("account.reset");
  if (error || !session) return error!;
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (reason.length < 3) return refused("Say why — for example “lost phone, confirmed by phone call”.");
  const user = await db.user.findUnique({ where: { id: String(userId) } });
  if (!user?.totpEnabledAt) return refused("They do not have two-factor on.");
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, failedSignIns: 0, lockedUntil: null } }),
    db.event.create({ data: { type: "account.two_factor_reset", actorUserId: session.userId, actorRole: session.activeRole, department: "administration", personId: user.personId, detail: `${user.displayName}'s two-factor reset: ${reason}` } }),
  ]);
  refresh();
  return ok("Two-factor reset. They sign in with their password and set it up again.");
}

export async function unlockUser(userId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("account.reset");
  if (error || !session) return error!;
  const user = await db.user.findUnique({ where: { id: String(userId) } });
  if (!user?.lockedUntil || user.lockedUntil < new Date()) return refused("That account is not locked.");
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { lockedUntil: null, failedSignIns: 0 } }),
    db.event.create({ data: { type: "account.unlocked", actorUserId: session.userId, actorRole: session.activeRole, department: "administration", personId: user.personId, detail: `${user.displayName}'s account unlocked.` } }),
  ]);
  refresh();
  return ok("Unlocked.");
}

/** Who must use two-factor: nobody yet, managers and screening staff, or all office staff. */
export async function setTwoFactorPolicy(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("security.policy");
  if (error || !session) return error!;
  const value = String(formData.get("policy") ?? "");
  if (!["off", "managers", "staff"].includes(value)) return refused("Choose who must use two-factor.");
  await db.$transaction([
    db.setting.upsert({
      where: { key: "security.require_2fa" },
      create: { key: "security.require_2fa", value, valueType: "text", label: "Who must use two-factor sign-in", usedBy: "sign-in", updatedById: session.userId },
      update: { value, updatedById: session.userId },
    }),
    db.event.create({ data: { type: "security.two_factor_policy", actorUserId: session.userId, actorRole: session.activeRole, department: "administration", detail: `Two-factor sign-in now required for: ${value === "off" ? "nobody" : value === "managers" ? "managers and screening staff" : "all office staff"}.` } }),
  ]);
  refresh();
  return ok(value === "off" ? "Two-factor is optional for everyone." : "Saved. Anyone it applies to is asked to set it up the next time they sign in.");
}
