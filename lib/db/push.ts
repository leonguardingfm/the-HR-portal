/**
 * Alerts pushed to phones and desks — web push, the browser's own channel.
 *
 * An officer's phone buzzes when their check call is overdue even with the
 * portal closed; a Control desk gets a notification on top of whatever window
 * is in front. Every push is recorded against the alert it was about, which
 * is the record that the officer was told and when.
 *
 * This is also where a text message or a phone call would be added, once a
 * provider is chosen (E16): the same people, the same alert, another channel.
 *
 * Needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT. Without them
 * nothing is pushed, and the screens still sound — see isPushConfigured.
 */

import webpush from "web-push";
import type { Role } from "@/lib/types";
import { db } from "./client";

export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping it opens. */
  url: string;
  /** One notification per alert: a repeat replaces it, and buzzes again. */
  tag: string;
  /** Stays on screen until dealt with, and vibrates hard. */
  urgent: boolean;
}

let configured: boolean | null = null;

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export function isPushConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) return (configured = false);
  webpush.setVapidDetails(subject, pub, priv);
  return (configured = true);
}

/**
 * Push one message to every device these people have turned alerts on for.
 * Returns how many took it. A device the push service says is gone (404, 410)
 * is removed; any other failure is counted against it and it is tried again
 * next time.
 */
export async function pushToUsers(userIds: string[], message: PushMessage, workItemId: string | null = null): Promise<{ delivered: number; failed: number }> {
  if (userIds.length === 0 || !isPushConfigured()) return { delivered: 0, failed: 0 };
  const subs = await db.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  const payload = JSON.stringify(message);
  const byUser = new Map<string, { delivered: number; failed: number }>();
  await Promise.all(
    subs.map(async (s) => {
      const tally = byUser.get(s.userId) ?? { delivered: 0, failed: 0 };
      byUser.set(s.userId, tally);
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: message.urgent ? 600 : 3600,
          urgency: message.urgent ? "high" : "normal",
          topic: message.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
        });
        tally.delivered++;
        await db.pushSubscription.update({ where: { id: s.id }, data: { lastOkAt: new Date(), failures: 0 } });
      } catch (e) {
        tally.failed++;
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else await db.pushSubscription.update({ where: { id: s.id }, data: { failures: { increment: 1 } } }).catch(() => {});
      }
    }),
  );
  // One delivery row per person told, even if they have no device: "not
  // reached" is part of the record too.
  await db.alertDelivery.createMany({
    data: userIds.map((userId) => ({
      userId,
      workItemId,
      title: message.title,
      delivered: byUser.get(userId)?.delivered ?? 0,
      failed: byUser.get(userId)?.failed ?? 0,
    })),
  });
  let delivered = 0;
  let failed = 0;
  for (const t of byUser.values()) {
    delivered += t.delivered;
    failed += t.failed;
  }
  return { delivered, failed };
}

/** Everybody who can work as one of these roles and has an active account. */
export async function usersHolding(roles: Role[]): Promise<string[]> {
  const rows = await db.userRole.findMany({
    where: { role: { in: roles }, revokedAt: null, user: { active: true, status: "active" } },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}
