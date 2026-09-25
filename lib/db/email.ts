/**
 * Email out — application links, reminders, interview invitations, reference
 * requests (HR, 25 September 2026).
 *
 * Every message is kept, sent or not: what a candidate or referee was sent,
 * and when, is a record. With a mail server set (SMTP_HOST, SMTP_PORT,
 * SMTP_USER, SMTP_PASS, MAIL_FROM) it is sent; without one it is kept as "not
 * sent — email is not set up here", and the page shows the link so a person
 * can send it by hand. Nothing pretends to have gone when it has not.
 *
 * Also the secure links those emails carry: a random token in the link, only
 * its hash in the database, so a copy of the database opens nothing.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import nodemailer, { type Transporter } from "nodemailer";
import type { Prisma } from "@prisma/client";
import { authSecret, previousAuthSecret } from "@/lib/auth/secret";
import { db } from "./client";

export interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
  purpose: string;
  personId?: string | null;
  candidacyId?: string | null;
  createdById?: string | null;
}

let transport: Transporter | null | undefined;

export function emailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

function mailer(): Transporter | null {
  if (transport !== undefined) return transport;
  if (!emailConfigured()) return (transport = null);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

/** Send, and keep the message whatever happens. */
export async function sendEmail(m: OutgoingEmail, client: Prisma.TransactionClient | typeof db = db) {
  const t = mailer();
  let status: "sent" | "failed" | "not_configured" = "not_configured";
  let error: string | null = null;
  if (t) {
    try {
      await t.sendMail({ from: process.env.MAIL_FROM, to: m.to, subject: m.subject, text: m.body });
      status = "sent";
    } catch (e) {
      status = "failed";
      error = String((e as Error).message ?? e).slice(0, 300);
    }
  }
  return client.emailMessage.create({
    data: { to: m.to, subject: m.subject, body: m.body, purpose: m.purpose, personId: m.personId ?? null, candidacyId: m.candidacyId ?? null, createdById: m.createdById ?? null, status, error },
  });
}

/** A fresh secret for a link, and the hash that is stored in its place. */
export function newLinkToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** The key a link is sealed with: the server's own secret, never stored with the data. */
const sealKeyFor = (secret: string) => createHash("sha256").update(`link-seal:${secret}`).digest();
const sealKey = () => sealKeyFor(authSecret());

/** A link token, sealed (AES-256-GCM) so a reminder can carry it again. */
export function sealToken(token: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", sealKey(), iv);
  const body = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

/** Opens with the current secret — or, while it is being changed, the previous one. */
export function unsealToken(sealed: string | null): string | null {
  return unsealWith(sealed, authSecret()) ?? unsealWithPrevious(sealed);
}

function unsealWithPrevious(sealed: string | null): string | null {
  const previous = previousAuthSecret();
  return previous ? unsealWith(sealed, previous) : null;
}

/** For moving sealed values to a new secret: opens with exactly this one, or null. */
export function unsealWith(sealed: string | null, secret: string): string | null {
  if (!sealed) return null;
  try {
    const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = createDecipheriv("aes-256-gcm", sealKeyFor(secret), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(body), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** The portal's own address, for links in emails: APP_URL when set, else the address this request came in on. */
export async function appUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
    if (host) return `${proto}://${host}`;
  } catch {
    // Outside a request — the worker's reminders.
  }
  return "http://localhost:3000";
}

/** The company's name as it signs its emails. */
export { COMPANY } from "@/lib/core/emails";
