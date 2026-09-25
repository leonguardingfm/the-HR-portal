"use server";

import { revalidatePath } from "next/cache";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/server";
import { MANUAL_CHECKS } from "@/lib/core/golive";
import { db } from "@/lib/db/client";
import { DEMO_EMAIL } from "@/lib/db/golive";
import { ok, refused, type ActionResult } from "./types";

/**
 * The go-live checklist's two writes (26 September 2026): ticking an item the
 * portal cannot check for itself, and switching off demonstration accounts.
 * Accounts are switched off, never deleted — whatever they did stays attributed.
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { session: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) return { session, error: refused(`${ACTIONS[action].what} belongs to ${ACTIONS[action].owner}.`) };
  return { session, error: null };
}

export async function tickGoLive(key: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("system.golive");
  if (error || !session) return error!;
  const item = MANUAL_CHECKS.find((m) => m.key === key);
  if (!item) return refused("There is no such item.");
  const done = formData.get("done") === "on";
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  if (done && note.length < 3) return refused("Say briefly how you know — a date, a reference, who did it.");
  const me = await db.user.findUnique({ where: { id: session.userId }, select: { displayName: true } });
  const row = await db.setting.findUnique({ where: { key: "golive.manual" } });
  const ticks = row ? (JSON.parse(row.value) as Record<string, unknown>) : {};
  if (done) ticks[key] = { by: me?.displayName ?? "someone", at: new Date().toISOString(), note };
  else delete ticks[key];
  const value = JSON.stringify(ticks);
  await db.$transaction([
    db.setting.upsert({ where: { key: "golive.manual" }, create: { key: "golive.manual", value, valueType: "json", label: "Go-live checklist — items ticked by hand", usedBy: "go-live", updatedById: session.userId }, update: { value, updatedById: session.userId } }),
    db.event.create({ data: { type: done ? "golive.ticked" : "golive.unticked", actorUserId: session.userId, actorRole: session.activeRole, department: "administration", detail: `${me?.displayName ?? "Someone"} ${done ? "ticked" : "unticked"} “${item.label}”${done ? `: ${note}` : ""}.` } }),
  ]);
  revalidatePath("/system/go-live");
  return ok(done ? "Ticked." : "Unticked.");
}

export async function switchOffDemoAccounts(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("system.golive");
  if (error || !session) return error!;
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "SWITCH OFF") return refused("Type SWITCH OFF to confirm.");
  const users = await db.user.findMany({ where: { active: true, email: { endsWith: DEMO_EMAIL }, id: { not: session.userId } }, select: { id: true, displayName: true } });
  const mailboxes = await db.mailbox.findMany({ where: { active: true, mode: "test" }, select: { id: true } });
  if (!users.length && !mailboxes.length) return ok("There is nothing to switch off.");
  await db.$transaction([
    db.user.updateMany({ where: { id: { in: users.map((u) => u.id) } }, data: { active: false, status: "suspended" } }),
    db.workSession.updateMany({ where: { userId: { in: users.map((u) => u.id) }, signedOutAt: null }, data: { signedOutAt: new Date() } }),
    db.mailbox.updateMany({ where: { id: { in: mailboxes.map((m) => m.id) } }, data: { active: false } }),
    db.event.create({ data: { type: "golive.demo_switched_off", actorUserId: session.userId, actorRole: session.activeRole, department: "administration", detail: `Switched off ${users.length} demonstration account${users.length === 1 ? "" : "s"} (${users.map((u) => u.displayName).join(", ") || "none"}) and ${mailboxes.length} test mailbox${mailboxes.length === 1 ? "" : "es"}. Nothing was deleted.` } }),
  ]);
  revalidatePath("/system/go-live");
  return ok(`Switched off ${users.length} account${users.length === 1 ? "" : "s"} and ${mailboxes.length} test mailbox${mailboxes.length === 1 ? "" : "es"}.${users.length ? " Your own account is left on." : ""}`);
}
