"use server";

import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { isPushConfigured, pushToUsers } from "@/lib/db/push";
import { refused, ok, type ActionResult } from "./types";

/**
 * Alerts on a person's own devices: turning them on for this phone or
 * computer, off again, and a test to prove it works. Everything here is about
 * the person signed in — a subscription is saved against their own account,
 * whatever the page sends.
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { session: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) {
    const spec = ACTIONS[action];
    return { session, error: refused(`${spec.what} belongs to ${spec.owner}.`) };
  }
  return { session, error: null };
}

export interface DeviceSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const isKey = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{16,200}={0,2}$/.test(v);

export async function subscribeDevice(sub: DeviceSubscription, userAgent: string): Promise<ActionResult> {
  const { session, error } = await guard("alerts.subscribe");
  if (error || !session) return error!;
  if (!isPushConfigured()) return refused("Alerts to devices are not set up on this server yet. The screen alarm still works.");

  const endpoint = String(sub?.endpoint ?? "");
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return refused("That device did not give a usable address for alerts.");
  }
  if (url.protocol !== "https:" || endpoint.length > 1000) return refused("That device did not give a usable address for alerts.");
  if (!isKey(sub?.keys?.p256dh) || !isKey(sub?.keys?.auth)) return refused("That device did not give usable keys for alerts.");

  // A device belongs to whoever turned alerts on last: a shared desk PC
  // follows the person signed in at it.
  await db.$transaction([
    db.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, userId: session.userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: String(userAgent ?? "").slice(0, 300) },
      update: { userId: session.userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: String(userAgent ?? "").slice(0, 300), failures: 0 },
    }),
    db.event.create({
      data: {
        type: "alerts.device_on",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "control",
        personId: session.personId,
        detail: `${session.name} turned alerts on for a device (${String(userAgent ?? "").slice(0, 80) || "unknown browser"}).`,
      },
    }),
  ]);
  return ok("Alerts are on for this device. You will be told here even with the portal closed.");
}

export async function unsubscribeDevice(endpoint: string): Promise<ActionResult> {
  const { session, error } = await guard("alerts.subscribe");
  if (error || !session) return error!;
  const gone = await db.pushSubscription.deleteMany({ where: { endpoint: String(endpoint ?? ""), userId: session.userId } });
  return gone.count ? ok("Alerts are off for this device.") : refused("Alerts were not on for this device.");
}

/** A test alert to every device this person has turned alerts on for. */
export async function testAlert(): Promise<ActionResult> {
  const { session, error } = await guard("alerts.subscribe");
  if (error || !session) return error!;
  const devices = await db.pushSubscription.count({ where: { userId: session.userId } });
  if (devices === 0) return refused("Turn alerts on for this device first.");
  const r = await pushToUsers([session.userId], {
    title: "Test alert",
    body: "This is how an alert arrives. Tap it to open the portal.",
    url: session.activeRole === "officer" ? "/me" : "/",
    tag: `test-${session.userId}`,
    urgent: true,
  });
  return r.delivered ? ok(`Test alert sent to ${r.delivered} device${r.delivered === 1 ? "" : "s"}.`) : refused("The test alert could not be delivered. Turn alerts off and on again on this device.");
}
