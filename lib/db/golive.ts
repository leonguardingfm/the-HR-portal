/**
 * The go-live checklist's automatic checks (26 September 2026): what the
 * portal can see for itself about the server it is running on and the data it
 * holds. Read-only; nothing here changes anything.
 */

import { access, constants } from "node:fs/promises";
import path from "node:path";
import { MANUAL_CHECKS } from "@/lib/core/golive";
import { workerHealth } from "@/lib/worker";
import { db } from "./client";
import { emailConfigured } from "./email";

export type CheckState = "ok" | "warn" | "fail";
export interface Check {
  key: string;
  group: string;
  label: string;
  state: CheckState;
  detail: string;
  fix?: string;
}

/** Demonstration accounts are seeded with example.com addresses, and nothing real has one. */
export const DEMO_EMAIL = "@example.com";

export async function goLiveChecks(): Promise<{ checks: Check[]; manual: { key: string; group: string; label: string; why: string; done: { by: string; at: string; note: string } | null }[] }> {
  const env = process.env;
  const secret = env.AUTH_SECRET ?? "";
  const storage = path.resolve(env.DOCUMENT_STORAGE_DIR ?? "storage/documents");
  const writable = await access(storage, constants.W_OK).then(
    () => true,
    () => false,
  );
  const w = workerHealth();
  const [demoUsers, demoPeople, testMailboxes, liveMailboxes, policy, mds, templates, manualRow, triggers, constraint] = await Promise.all([
    db.user.count({ where: { active: true, email: { endsWith: DEMO_EMAIL } } }),
    db.person.count({ where: { OR: [{ email: { endsWith: DEMO_EMAIL } }, { nationalInsurance: { startsWith: "QQ" } }] } }),
    db.mailbox.count({ where: { active: true, mode: "test" } }),
    db.mailbox.count({ where: { active: true, mode: { in: ["live", "shadow"] } } }),
    db.setting.findUnique({ where: { key: "security.require_2fa" } }),
    db.user.findMany({ where: { active: true, roles: { some: { role: "top_management", revokedAt: null } } }, select: { displayName: true, totpEnabledAt: true } }),
    db.replyTemplate.count({ where: { active: true } }),
    db.setting.findUnique({ where: { key: "golive.manual" } }),
    db.$queryRaw<{ tgname: string; tgenabled: string }[]>`SELECT tgname, tgenabled FROM pg_trigger WHERE tgname IN ('event_append_only', 'disposal_append_only')`,
    db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_constraint WHERE conname = 'reply_template_whole'`,
  ]);
  const mdsWithout2fa = mds.filter((m) => !m.totpEnabledAt).map((m) => m.displayName);
  const age = (t: number | null) => (t ? Math.round((Date.now() - t) / 1000) : null);
  const hubAge = age(w.hubLastOk);
  const dutyAge = age(w.dutyLastOk);

  const checks: Check[] = [
    { key: "production", group: "The server", label: "Running as a production build", state: env.NODE_ENV === "production" ? "ok" : "fail", detail: env.NODE_ENV === "production" ? "Yes." : `No — running as "${env.NODE_ENV ?? "unset"}".`, fix: "Start it with npm run build, then npm start." },
    {
      key: "secret",
      group: "The server",
      label: "A strong, private sign-in secret (AUTH_SECRET)",
      state: secret.length >= 32 && !secret.includes("dev-only") && !secret.includes("change-me") ? "ok" : "fail",
      detail: secret ? `Set, ${secret.length} characters.` : "Not set.",
      fix: "Set AUTH_SECRET to at least 32 random characters: openssl rand -base64 48. Never reuse the development one.",
    },
    { key: "url", group: "The server", label: "The portal's own address is https (APP_URL)", state: env.APP_URL?.startsWith("https://") ? "ok" : "fail", detail: env.APP_URL ? env.APP_URL : "Not set.", fix: "Set APP_URL to the portal's https address, e.g. https://portal.yourcompany.co.uk — links in emails use it." },
    {
      key: "worker",
      group: "The server",
      label: "Background checks are running (duty, HR and hub clocks)",
      state: w.running && hubAge !== null && hubAge < 120 && dutyAge !== null && dutyAge < 180 ? "ok" : "fail",
      detail: w.running ? `Hub clocks last ran ${hubAge ?? "—"}s ago, duty checks ${dutyAge ?? "—"}s ago.${w.hubError || w.dutyError ? ` Last error: ${w.hubError ?? w.dutyError}` : ""}` : "Not running.",
      fix: "Run exactly one server with DUTY_WORKER unset (or on), and check its log.",
    },
    { key: "storage", group: "The server", label: "Uploaded documents have somewhere safe to go", state: writable && !!env.DOCUMENT_STORAGE_DIR ? "ok" : writable ? "warn" : "fail", detail: `${storage} — ${writable ? "writable" : "not writable"}${env.DOCUMENT_STORAGE_DIR ? "" : " (the default inside the app folder)"}.`, fix: "Set DOCUMENT_STORAGE_DIR to a folder outside the app, on a disk that is backed up." },
    {
      key: "database",
      group: "The server",
      label: "The database's own protections are on",
      state: triggers.length === 2 && triggers.every((t) => t.tgenabled === "O") && Number(constraint[0]?.n ?? 0) > 0 ? "ok" : "fail",
      detail: `${triggers.filter((t) => t.tgenabled === "O").length} of 2 append-only guards on; latest rules ${Number(constraint[0]?.n ?? 0) > 0 ? "present" : "missing"}.`,
      fix: "Run npm run db:migrate. Never switch the append-only guards off on a live database.",
    },

    { key: "email", group: "Connections", label: "Email can be sent (password resets, welcome packs, summaries)", state: emailConfigured() ? "ok" : "fail", detail: emailConfigured() ? `Through ${env.SMTP_HOST}, from ${env.MAIL_FROM}.` : "No mail server set — emails are kept but not sent.", fix: "Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM (the email integration step)." },
    { key: "mailboxes", group: "Connections", label: "The shared mailboxes are connected to the hub", state: liveMailboxes ? "ok" : "warn", detail: liveMailboxes ? `${liveMailboxes} connected (live or shadow).` : "None yet.", fix: "Connected at the email integration step. Run each in Shadow for a week before Live." },
    { key: "push", group: "Connections", label: "Phone alerts for officers and the Control Room (web push)", state: env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY ? "ok" : "warn", detail: env.VAPID_PUBLIC_KEY ? "Keys set." : "Not set — alerts show only while the portal is open.", fix: "Generate once with npx web-push generate-vapid-keys; set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (mailto:you@company)." },
    { key: "ai", group: "Connections", label: "AI sorting of hub emails", state: env.ANTHROPIC_API_KEY ? "ok" : "warn", detail: env.ANTHROPIC_API_KEY ? "Key set." : "Not set — emails are sorted by rules only, and flagged for checking.", fix: "Set ANTHROPIC_API_KEY, after the data processing agreement is in place." },

    { key: "demo_accounts", group: "Data", label: "No demonstration accounts can sign in", state: demoUsers ? "fail" : "ok", detail: demoUsers ? `${demoUsers} active account${demoUsers === 1 ? "" : "s"} with ${DEMO_EMAIL} addresses.` : "None.", fix: "Production starts from an empty database. If demonstration data got in, switch the accounts off below." },
    { key: "demo_people", group: "Data", label: "No invented people in the records", state: demoPeople ? "fail" : "ok", detail: demoPeople ? `${demoPeople} demonstration people (example.com addresses or QQ… National Insurance numbers).` : "None.", fix: "Start production from an empty database: npm run db:migrate, npm run setup:config, npm run setup:first-admin." },
    { key: "test_mailbox", group: "Data", label: "The hub's test inbox is off", state: testMailboxes ? "warn" : "ok", detail: testMailboxes ? `${testMailboxes} test mailbox${testMailboxes === 1 ? "" : "es"} on.` : "Off.", fix: "Switched off with the demonstration accounts below, or on Hub settings." },

    { key: "twofactor_policy", group: "Security", label: "Managers must use two-factor sign-in", state: policy && policy.value !== "off" ? "ok" : "fail", detail: policy ? `Required for: ${policy.value === "managers" ? "managers and screening staff" : policy.value === "staff" ? "all office staff" : "nobody"}.` : "Not decided.", fix: "System → People and roles → Two-factor sign-in." },
    { key: "md_2fa", group: "Security", label: "Every Managing Director account has two-factor on", state: mds.length && !mdsWithout2fa.length ? "ok" : "fail", detail: !mds.length ? "No Managing Director." : mdsWithout2fa.length ? `Not yet: ${mdsWithout2fa.join(", ")}.` : `${mds.length} of ${mds.length}.`, fix: "Settings → Two-factor sign-in, on the account itself." },
    { key: "templates", group: "Security", label: "Reply templates written for the common replies", state: templates ? "ok" : "warn", detail: `${templates} in use.`, fix: "Performance hub → Reply templates. Each department's manager." },
  ];

  const ticks = manualRow ? (JSON.parse(manualRow.value) as Record<string, { by: string; at: string; note: string }>) : {};
  return { checks, manual: MANUAL_CHECKS.map((m) => ({ ...m, done: ticks[m.key] ?? null })) };
}
