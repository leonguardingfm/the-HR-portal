/**
 * Demonstration data for the Performance hub — the test inbox filled with
 * realistic emails in every state, for seeing how the hub looks and works
 * before a real mailbox is connected. Not for production.
 *
 *   npm run demo:hub
 *
 * Makes the three test mailboxes (Control Room, HR, Accounts), a Shift
 * Supervisor account (sam.supervisor) and eighteen emails spread over the last
 * few hours: unassigned, one over its accept time, accepted, in progress, on
 * hold, escalated and closed. Everything goes through the same code a real
 * email will, with the times set as if it had happened. Only test mailboxes
 * are touched; run it again to start the test inbox afresh.
 */

import { DEV_SEED_PASSWORD } from "../lib/accounts";
import { hashPassword } from "../lib/auth/password";
import { SAMPLE_EMAILS, TEST_MAILBOXES } from "../lib/core/hub-samples";
import { db } from "../lib/db/client";
import * as hub from "../lib/db/hub";
import { sweepHub } from "../lib/db/hub-sweep";
import type { Role } from "../lib/types";

const MIN = 60_000;

async function actor(username: string, role: Role): Promise<hub.Actor> {
  const u = await db.user.findUnique({ where: { username }, select: { id: true, displayName: true } });
  if (!u) throw new Error(`No demonstration account "${username}" — run npm run db:seed first.`);
  return { userId: u.id, role, name: u.displayName };
}

async function main() {
  const now = new Date();
  const granter = await db.userRole.findFirst({ where: { role: "top_management", revokedAt: null }, select: { userId: true } });
  if (!granter) throw new Error("No higher-management account to grant the Shift Supervisor role — run npm run db:seed first.");

  // The Shift Supervisor.
  let sam = await db.user.findUnique({ where: { username: "sam.supervisor" } });
  if (!sam) {
    const person = await db.person.create({ data: { fullName: "Sam Carter", email: "sam.carter@example.com", lifecycle: "confirmed_officer" } });
    sam = await db.user.create({ data: { personId: person.id, displayName: "Sam Carter", username: "sam.supervisor", passwordHash: await hashPassword(DEV_SEED_PASSWORD), status: "active", department: "control_room" } });
  }
  await db.userRole.upsert({ where: { userId_role: { userId: sam.id, role: "shift_supervisor" } }, create: { userId: sam.id, role: "shift_supervisor", grantedById: granter.userId, grantBasis: "Demonstration" }, update: { revokedAt: null } });

  // The test mailboxes, emptied of earlier demonstration tasks by closing them.
  const boxes: Record<string, string> = {};
  for (const m of TEST_MAILBOXES) {
    const row = await db.mailbox.upsert({ where: { address: m.address }, create: { address: m.address, displayName: m.displayName, department: m.department, mode: "test", officeHoursOnly: m.officeHoursOnly }, update: { mode: "test", active: true } });
    boxes[m.key] = row.id;
  }
  const old = await db.hubTask.findMany({ where: { test: true, status: { notIn: ["completed", "unsuccessful", "cancelled"] } }, select: { id: true } });
  if (old.length) {
    await db.$transaction([
      db.hubTask.updateMany({ where: { id: { in: old.map((t) => t.id) } }, data: { status: "cancelled", outcome: "duplicate_or_mistake", completedAt: now, withinSla: null, outcomeReason: "Test inbox reset", correctiveAction: "None — demonstration data", updateDueAt: null, handoverNeededAt: null } }),
      db.workItem.updateMany({ where: { hubTaskId: { in: old.map((t) => t.id) }, state: "open" }, data: { state: "done", doneAt: now } }),
      db.event.create({ data: { type: "hub.test_reset", actorSystem: "demo-hub", department: "control", detail: `Test inbox reset: ${old.length} open test task${old.length === 1 ? "" : "s"} closed.` } }),
    ]);
  }

  const alpha = await actor("hannah.brooks", "control");
  const bravo = await actor("daniel.okoye", "control");
  const supervisor: hub.Actor = { userId: sam.id, role: "shift_supervisor", name: "Sam Carter" };
  const priya = await actor("priya", "recruitment");
  const joel = await actor("joel", "recruitment");
  const kirsty = await actor("kirsty", "admin_officer");
  const douglas = await actor("douglas", "admin_manager");

  // The critical ones are for trying live from "Send test email" — not for the demo to sound.
  const samples = SAMPLE_EMAILS.filter((s) => !["fire", "safeguarding"].includes(s.key)).sort((a, b) => b.minutesAgo - a.minutesAgo);
  const ids: Record<string, string> = {};
  for (const s of samples) {
    const at = new Date(now.getTime() - s.minutesAgo * MIN);
    const r = await hub.ingestEmail({
      mailboxId: boxes[s.mailbox],
      graphMessageId: `demo-${s.key}-${now.getTime()}`,
      internetMessageId: `<demo-${s.key}-${now.getTime()}@test.leonguarding.example>`,
      conversationId: `demo-${s.key}-${now.getTime()}`,
      receivedAt: at,
      recordedAt: at,
      fromName: s.fromName,
      fromAddress: s.fromAddress,
      to: [TEST_MAILBOXES.find((m) => m.key === s.mailbox)!.address],
      subject: s.subject,
      body: s.body,
    });
    ids[s.key] = r.taskId;
  }
  const at = (key: string, plus: number) => new Date(now.getTime() - (samples.find((s) => s.key === key)!.minutesAgo - plus) * MIN);
  const must = (r: hub.HubResult, what: string) => {
    if (!r.ok) console.warn(`  ! ${what}: ${r.message}`);
  };

  // Control Room.
  must(await hub.acceptTask(ids.cover, alpha, at("cover", 1)), "cover accept");
  must(await hub.recordNote(ids.cover, alpha, { kind: "action", text: "Checked Friday's rota: Grace Mbeki is free and has worked Northgate before. Asked her by WhatsApp.", nextAction: "Confirm Grace and reply to Priya", nextActionAt: new Date(now.getTime() + 50 * MIN) }, at("cover", 3)), "cover action");

  must(await hub.acceptTask(ids.complaint, bravo, at("complaint", 2)), "complaint accept");

  must(await hub.acceptTask(ids.noshow, supervisor, at("noshow", 1)), "no-show accept");
  must(await hub.recordNote(ids.noshow, supervisor, { kind: "action", text: "Rang the officer twice, no answer. Relief officer Liam asked to attend — ETA 40 minutes." }, at("noshow", 3)), "no-show action");
  must(await hub.recordNote(ids.noshow, supervisor, { kind: "response", text: "Called Sam Okafor: told him relief is on the way, arriving about 08:10." }, at("noshow", 5)), "no-show response");
  must(await hub.escalate(ids.noshow, supervisor, "Second no-show by this officer this month — Operations Manager to review.", at("noshow", 8)), "no-show escalate");

  must(await hub.acceptTask(ids.cancel, alpha, at("cancel", 2)), "cancel accept");
  must(await hub.recordNote(ids.cancel, alpha, { kind: "action", text: "Sunday day shift at Depot 4 taken off the rota; officer told by phone." }, at("cancel", 6)), "cancel action");
  must(await hub.recordNote(ids.cancel, alpha, { kind: "response", text: "Emailed Dan to confirm the cancellation." }, at("cancel", 9)), "cancel response");
  must(await hub.closeTask(ids.cancel, alpha, { outcome: "successful", reason: "", corrective: "" }, at("cancel", 11)), "cancel close");

  must(await hub.acceptTask(ids.incident, bravo, at("incident", 1)), "incident accept");
  must(await hub.recordNote(ids.incident, bravo, { kind: "action", text: "Read Grace's report; CCTV reference logged. No damage." }, at("incident", 4)), "incident action");
  must(await hub.recordNote(ids.incident, bravo, { kind: "response", text: "Emailed the Northgate centre manager a summary of the incident." }, at("incident", 12)), "incident response");
  must(await hub.closeTask(ids.incident, bravo, { outcome: "successful", reason: "", corrective: "" }, at("incident", 14)), "incident close");

  must(await hub.acceptTask(ids.request, alpha, at("request", 2)), "request accept");
  must(await hub.recordNote(ids.request, alpha, { kind: "action", text: "Briefed the officer at Clearwater gate about the key handover." }, at("request", 7)), "request action");
  must(await hub.setWaiting(ids.request, alpha, { status: "awaiting_client", reason: "Need the contractor's name to check ID", waitingFor: "Olga Petrenko, Clearwater Pharma", followUpAt: new Date(now.getTime() + 90 * MIN), evidence: "Emailed Olga asking for the contractor's name and company" }, at("request", 9)), "request waiting");

  // Late on everything: a breach on each clock, closed with the reason and the fix.
  must(await hub.acceptTask(ids.query, bravo, at("query", 6)), "query accept");
  must(await hub.recordNote(ids.query, bravo, { kind: "response", text: "Told Liam the swap is fine once Marta confirms in writing." }, at("query", 21)), "query response");
  must(await hub.closeTask(ids.query, bravo, { outcome: "successful", reason: "Picked up late — the desk was handling the Halton no-show.", corrective: "Supervisor to reassign officer queries when the desk is on a live incident." }, at("query", 24)), "query close");

  must(await hub.acceptTask(ids.newsletter, alpha, at("newsletter", 20)), "newsletter accept");
  must(await hub.closeTask(ids.newsletter, alpha, { outcome: "no_action_required", reason: "Marketing email.", corrective: "Ask the supplier to email sales instead." }, at("newsletter", 21)), "newsletter close");

  // HR.
  must(await hub.acceptTask(ids.sia, priya, at("sia", 5)), "sia accept");
  must(await hub.recordNote(ids.sia, priya, { kind: "action", text: "Checked the SIA register: renewal application received. Expiry diarised." }, at("sia", 12)), "sia action");
  must(await hub.acceptTask(ids.holiday, joel, at("holiday", 10)), "holiday accept");
  must(await hub.recordNote(ids.holiday, joel, { kind: "response", text: "Replied: 72 hours left this year; asked him to request December through his portal." }, at("holiday", 20)), "holiday response");
  must(await hub.closeTask(ids.holiday, joel, { outcome: "successful", reason: "", corrective: "" }, at("holiday", 22)), "holiday close");
  must(await hub.acceptTask(ids.payroll, priya, at("payroll", 15)), "payroll accept");
  must(await hub.recordNote(ids.payroll, priya, { kind: "action", text: "Checked the timesheet: overtime approved but missed from the September run. Passed to payroll for a correction." }, at("payroll", 40)), "payroll action");

  // Accounts.
  must(await hub.acceptTask(ids.invoice, kirsty, at("invoice", 8)), "invoice accept");
  must(await hub.recordNote(ids.invoice, kirsty, { kind: "action", text: "Pulled the August timesheets for Clearwater — 180 hours confirmed; two extra shifts were requested on 14 and 21 August." }, at("invoice", 25)), "invoice action");
  must(await hub.acceptTask(ids.remittance, douglas, at("remittance", 30)), "remittance accept");
  must(await hub.closeTask(ids.remittance, douglas, { outcome: "no_action_required", reason: "", corrective: "" }, at("remittance", 32)), "remittance close");

  const swept = await sweepHub(now);
  const open = await db.hubTask.count({ where: { test: true, status: { notIn: ["completed", "unsuccessful", "cancelled"] } } });
  console.log(`Test inbox ready: ${samples.length} emails, ${open} open. Sweep: ${swept.warnings} warnings, ${swept.breaches} breaches.`);
  console.log(`Shift Supervisor: sam.supervisor / ${DEV_SEED_PASSWORD}`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
