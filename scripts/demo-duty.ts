/**
 * Demonstration data for the duty checks — for reviewing how the chase-up,
 * book-on and check-call pages and the dashboard look and work, with every
 * state on screen at once. Not for production.
 *
 *   npm run demo:duty
 *
 * Builds ten shifts around the time it is run: officers on duty and in
 * contact, a check call just missed, one missed with a failed try, a late
 * book-on, a no-show, an officer due on site, a no-signal post held by the
 * client, a chase-up due, one not yet due, and an officer who cannot attend
 * with the shift on the cover list. Run it again to move the picture to now:
 * its earlier shifts are cancelled first, and any real shift it would clash
 * with is cancelled with a note in the event log.
 */

import type { ChaseUpOutcome, ContactChannel, AskChannel } from "@prisma/client";
import { DEV_SEED_PASSWORD } from "../lib/accounts";
import { hashPassword } from "../lib/auth/password";
import { db } from "../lib/db/client";
import { loadLive, officerOffWrites } from "../lib/db/cover";

const MIN = 60_000;
const H = 60 * MIN;

interface Scenario {
  post: string;
  officer: string;
  /** Has their own portal account, and did their own checks in it. */
  portal?: boolean;
  from: number;
  to: number;
  chase?: { at: number; outcome: ChaseUpOutcome; channel?: AskChannel; note?: string }[];
  bookOn?: { at: number; channel: ContactChannel };
  calls?: number[];
  attempts?: { at: number; channel: ContactChannel; note: string }[];
  clientTold?: { at: number; contact: string };
  cannotAttend?: { note: string };
  what: string;
}

async function main() {
  const now = new Date(Math.floor(Date.now() / (5 * MIN)) * 5 * MIN);
  const T = now.getTime();
  const control = await db.user.findFirst({ where: { username: "control.alpha.desk" } });
  if (!control) throw new Error("The demo needs the control.alpha.desk account from the seed.");

  const scenarios: Scenario[] = [
    { what: "On duty, every call on time", portal: true, post: "Vehicle gate", officer: "Adebayo O Fashola", from: -5 * H, to: 7 * H,
      chase: [{ at: -7 * H, outcome: "confirmed", channel: "phone" }], bookOn: { at: -5 * H - 4 * MIN, channel: "site_phone" },
      calls: [-4 * H - 5 * MIN, -3 * H - 8 * MIN, -2 * H - 10 * MIN, -1 * H - 13 * MIN, -20 * MIN] },
    { what: "Check call just missed — step 1", portal: true, post: "Gatehouse", officer: "Kieran Doyle", from: -3 * H - 15 * MIN, to: 8 * H + 45 * MIN,
      chase: [{ at: -5 * H, outcome: "confirmed", channel: "whatsapp" }], bookOn: { at: -3 * H - 13 * MIN, channel: "phone" },
      calls: [-2 * H - 15 * MIN, -1 * H - 15 * MIN] },
    { what: "Missed, one failed try — step 2", portal: true, post: "Concourse, retail hours", officer: "Liam Corrigan", from: -4 * H, to: 8 * H,
      chase: [{ at: -6 * H, outcome: "confirmed", channel: "phone" }], bookOn: { at: -4 * H - 5 * MIN, channel: "app" },
      calls: [-3 * H - 2 * MIN, -2 * H - 5 * MIN, -1 * H - 40 * MIN],
      attempts: [{ at: -25 * MIN, channel: "phone", note: "Rang out, no voicemail" }] },
    { what: "No signal at the post — client holding contact", portal: true, post: "Perimeter, nights", officer: "Grace Mbeki", from: -2 * H, to: 10 * H,
      chase: [{ at: -4 * H, outcome: "confirmed", channel: "phone" }], bookOn: { at: -2 * H - 10 * MIN, channel: "phone" },
      clientTold: { at: -1 * H - 55 * MIN, contact: "Halton gatehouse — Sam Price" } },
    { what: "Booked on late, now in contact — no portal account, Control records for him", post: "Concourse, second officer", officer: "Rashid Karim", from: -2 * H, to: 6 * H,
      chase: [{ at: -4 * H, outcome: "confirmed", channel: "sms" }], bookOn: { at: -1 * H - 38 * MIN, channel: "phone" },
      calls: [-43 * MIN] },
    { what: "Due on site now, confirmed in the portal", portal: true, post: "Day patrol", officer: "Shanice Bennett", from: -10 * MIN, to: 1 * H + 30 * MIN,
      chase: [{ at: -2 * H, outcome: "confirmed" }] },
    { what: "No show — two unanswered chase-ups", portal: true, post: "Vehicle gate, relief", officer: "Callum Reid", from: -40 * MIN, to: 11 * H + 20 * MIN,
      chase: [{ at: -2 * H - 40 * MIN, outcome: "no_answer", channel: "phone" }, { at: -1 * H - 40 * MIN, outcome: "no_answer", channel: "phone" }] },
    { what: "Cannot attend — off, cover needed", portal: true, post: "Concierge desk", officer: "Marta Kowalczyk", from: 1 * H + 30 * MIN, to: 13 * H + 30 * MIN,
      cannotAttend: { note: "Rang in with a temperature" } },
    { what: "Chase-up due, no answer yet", portal: true, post: "Day patrol", officer: "Elena Petrova", from: 1 * H + 40 * MIN, to: 9 * H + 40 * MIN,
      chase: [{ at: -10 * MIN, outcome: "no_answer", channel: "phone" }] },
    { what: "Chase-up not due yet", portal: true, post: "Gatehouse", officer: "Wesley Anand", from: 9 * H, to: 17 * H },
  ];

  // 1. Last run's demo shifts come off first.
  const earlier = await db.event.findMany({ where: { type: "demo.duty_shift" }, select: { assignmentId: true } });
  const earlierIds = earlier.map((e) => e.assignmentId).filter(Boolean) as string[];
  if (earlierIds.length) {
    await db.$transaction([
      db.workItem.updateMany({ where: { assignmentId: { in: earlierIds }, state: "open" }, data: { state: "cancelled", doneAt: now } }),
      db.coverNeed.updateMany({
        where: { fromAssignmentId: { in: earlierIds }, coverAssignmentId: null, closedAt: null },
        data: { closedAt: now, closedReason: "Demonstration data, replaced by a fresh run", closedById: control.id },
      }),
      db.assignment.updateMany({ where: { id: { in: earlierIds }, state: { not: "cancelled" } }, data: { state: "cancelled" } }),
    ]);
  }

  const posts = await db.post.findMany({ include: { site: true } });
  const people = await db.person.findMany({ select: { id: true, fullName: true } });
  const postId = (n: string) => posts.find((p) => p.name === n)?.id ?? (() => { throw new Error(`No post "${n}"`); })();
  const personId = (n: string) => people.find((p) => p.fullName === n)?.id ?? (() => { throw new Error(`No officer "${n}"`); })();
  const at = (offset: number) => new Date(T + offset);

  // 2. Clear the way: any live shift these officers or posts hold across the demo window.
  const from = at(-5 * H - 30 * MIN);
  const to = at(17 * H + 30 * MIN);
  const clashes = await db.assignment.findMany({
    where: {
      state: { not: "cancelled" },
      startsAt: { lt: to },
      endsAt: { gt: from },
      OR: [{ personId: { in: scenarios.map((s) => personId(s.officer)) } }, { postId: { in: scenarios.map((s) => postId(s.post)) } }],
    },
    select: { id: true },
  });
  if (clashes.length) {
    await db.$transaction([
      db.workItem.updateMany({ where: { assignmentId: { in: clashes.map((c) => c.id) }, state: "open" }, data: { state: "cancelled", doneAt: now } }),
      db.openShift.updateMany({ where: { assignmentId: { in: clashes.map((c) => c.id) } }, data: { assignmentId: null } }),
      db.assignment.updateMany({ where: { id: { in: clashes.map((c) => c.id) } }, data: { state: "cancelled" } }),
      db.event.create({
        data: { type: "demo.duty_cleared", actorSystem: "demo", department: "control", detail: `${clashes.length} shift(s) cancelled to make room for the duty-check demonstration.` },
      }),
    ]);
  }

  // 3. Portal accounts for the officers who have one: first.last, the dev password.
  const devHash = await hashPassword(DEV_SEED_PASSWORD);
  for (const sc of scenarios.filter((x) => x.portal)) {
    const pid = personId(sc.officer);
    if (await db.user.findUnique({ where: { personId: pid } })) continue;
    const parts = sc.officer.toLowerCase().split(" ");
    const username = `${parts[0]}.${parts[parts.length - 1]}`;
    await db.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { personId: pid, displayName: sc.officer, username, passwordHash: devHash, department: "officer", status: "active" } });
      await tx.userRole.create({ data: { userId: u.id, role: "officer", grantedById: control.id, grantBasis: "Demonstration officer account" } });
    });
    console.log(`  Portal account: ${username}`);
  }

  // 4. The picture.
  for (const s of scenarios) {
    const a = await db.assignment.create({
      data: {
        personId: personId(s.officer),
        postId: postId(s.post),
        startsAt: at(s.from),
        endsAt: at(s.to),
        state: "published",
        publishedAt: at(-3 * 24 * H),
        publishedById: control.id,
        publishCheckNote: "Passed with no warnings",
      },
    });
    const writes = [
      db.event.create({ data: { type: "demo.duty_shift", actorSystem: "demo", department: "control", assignmentId: a.id, detail: `Demonstration: ${s.what}.` } }),
      ...(s.chase ?? []).map((c) =>
        db.chaseUp.create({ data: { assignmentId: a.id, at: at(c.at), byUserId: c.channel ? control.id : null, channel: c.channel ?? null, outcome: c.outcome, note: c.note ?? (c.channel ? null : "Confirmed by the officer in their portal") } }),
      ),
      ...(s.bookOn
        ? [
            db.bookOn.create({
              data: s.portal && s.officer !== "Grace Mbeki"
                ? { assignmentId: a.id, at: at(s.bookOn.at), channel: "app" }
                : { assignmentId: a.id, at: at(s.bookOn.at), channel: s.bookOn.channel, recordedByUserId: control.id },
            }),
          ]
        : []),
      ...(s.calls ?? []).map((c, i) =>
        db.checkCall.create({
          // Officers with a portal make their own; one of Liam's came in by phone.
          data: s.portal && !(s.officer === "Liam Corrigan" && i === 1)
            ? { assignmentId: a.id, at: at(c), channel: "app", allWell: true }
            : { assignmentId: a.id, at: at(c), channel: "phone", allWell: true, takenByUserId: control.id },
        }),
      ),
      ...(s.attempts ?? []).map((t) =>
        db.contactAttempt.create({ data: { assignmentId: a.id, at: at(t.at), byUserId: control.id, channel: t.channel, reached: false, note: t.note } }),
      ),
      ...(s.clientTold
        ? [db.noSignalHandover.create({ data: { assignmentId: a.id, notifiedAt: at(s.clientTold.at), notifiedByUserId: control.id, notifiedContact: s.clientTold.contact } })]
        : []),
    ];
    await db.$transaction(writes);

    if (s.cannotAttend) {
      const live = (await loadLive(a.id))!;
      const off = officerOffWrites(live, "sick", s.cannotAttend.note, { userId: control.id, role: "control" }, at(-15 * MIN));
      if (!off.ok) throw new Error(off.reason);
      await db.$transaction([
        db.chaseUp.create({ data: { assignmentId: a.id, at: at(-15 * MIN), byUserId: control.id, channel: "phone", outcome: "cannot_attend", note: s.cannotAttend.note } }),
        ...off.writes,
      ]);
    }
    console.log(`  ${s.what}: ${s.officer}, ${s.post}`);
  }
  console.log(`\nTen demonstration shifts built around ${now.toISOString()}. Open /duty/chase-ups, /duty/book-ons, /duty/check-calls or the dashboard.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
