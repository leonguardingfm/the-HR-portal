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

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ChaseUpOutcome, ContactChannel, AskChannel } from "@prisma/client";
import { DEV_SEED_PASSWORD } from "../lib/accounts";
import { hashPassword } from "../lib/auth/password";
import { judgeLocation, newProofCode } from "../lib/core/proof";
import { addDays, ukDate, ukTime } from "../lib/core/rota";
import { db } from "../lib/db/client";
import { loadLive, officerOffWrites } from "../lib/db/cover";
import { putObject } from "../lib/storage";

/** One generic picture stands in for every demonstration selfie. */
const DEMO_SELFIE = readFileSync(new URL("./demo-selfie.jpg", import.meta.url));
const DEMO_SHA = createHash("sha256").update(DEMO_SELFIE).digest("hex");

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
  /** The last check call's selfie was taken this far (metres, roughly north) from the site. */
  awayOnLastCall?: number;
  runningLate?: { at: number; minutes: number; note: string };
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
      calls: [-3 * H - 2 * MIN, -2 * H - 5 * MIN, -1 * H - 40 * MIN], awayOnLastCall: 2300,
      attempts: [{ at: -25 * MIN, channel: "phone", note: "Rang out, no voicemail" }] },
    { what: "No signal at the post — client holding contact", portal: true, post: "Perimeter, nights", officer: "Grace Mbeki", from: -2 * H, to: 10 * H,
      chase: [{ at: -4 * H, outcome: "confirmed", channel: "phone" }], bookOn: { at: -2 * H - 10 * MIN, channel: "phone" },
      clientTold: { at: -1 * H - 55 * MIN, contact: "Halton gatehouse — Sam Price" } },
    { what: "Booked on late, now in contact — no portal account, Control records for him", post: "Concourse, second officer", officer: "Rashid Karim", from: -2 * H, to: 6 * H,
      chase: [{ at: -4 * H, outcome: "confirmed", channel: "sms" }], bookOn: { at: -1 * H - 38 * MIN, channel: "phone" },
      calls: [-43 * MIN] },
    { what: "Due on site now, confirmed in the portal", portal: true, post: "Day patrol", officer: "Shanice Bennett", from: -10 * MIN, to: 1 * H + 30 * MIN,
      chase: [{ at: -2 * H, outcome: "confirmed" }] },
    { what: "No show — two unanswered chase-ups, then said he is running late", portal: true, post: "Vehicle gate, relief", officer: "Callum Reid", from: -40 * MIN, to: 11 * H + 20 * MIN,
      chase: [{ at: -2 * H - 40 * MIN, outcome: "no_answer", channel: "phone" }, { at: -1 * H - 40 * MIN, outcome: "no_answer", channel: "phone" }],
      runningLate: { at: -35 * MIN, minutes: 75, note: "Car broken down on the M6" } },
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
    const post = posts.find((p) => p.name === s.post)!;
    const place = post.site.latitude == null ? null : { lat: Number(post.site.latitude), lng: Number(post.site.longitude), radiusMetres: post.site.radiusMetres };
    // A selfie as an officer's portal would send it: near the site, or this far off it.
    const selfie = async (link: { bookOnId: string } | { checkCallId: string }, at: Date, away = 0) => {
      if (!place) return null;
      const fix = { lat: place.lat + (away || 25 + Math.random() * 40) / 111_320, lng: place.lng, accuracy: 12 + Math.round(Math.random() * 20) };
      const code = newProofCode((n) => randomBytes(n));
      const key = `proofs/demo/${code}.jpg`;
      await putObject(key, DEMO_SELFIE);
      const judged = judgeLocation(fix, place);
      // The row's data only: it is written after the book-on or call it proves.
      return {
        code, assignmentId: a.id, kind: ("bookOnId" in link ? "book_on" : "check_call") as "book_on" | "check_call", receivedAt: at, deviceAt: at,
        latitude: fix.lat, longitude: fix.lng, accuracyMetres: fix.accuracy, distanceMetres: judged.distance, atSite: judged.atSite,
        liveCamera: true, storageKey: key, mimeType: "image/jpeg", bytes: DEMO_SELFIE.length, sha256: DEMO_SHA, ...link,
      };
    };
    const selfBookOn = s.bookOn && s.portal && s.officer !== "Grace Mbeki";
    const selfCall = (i: number) => s.portal && !(s.officer === "Liam Corrigan" && i === 1);
    const proofs = [
      ...(selfBookOn ? [await selfie({ bookOnId: `demo-bo-${a.id}` }, at(s.bookOn!.at))] : []),
      ...(await Promise.all((s.calls ?? []).map((c, i) => (selfCall(i) ? selfie({ checkCallId: `demo-cc-${a.id}-${i}` }, at(c), i === s.calls!.length - 1 ? s.awayOnLastCall : 0) : null)))),
    ].filter((x): x is NonNullable<typeof x> => x !== null);
    const writes = [
      db.event.create({ data: { type: "demo.duty_shift", actorSystem: "demo", department: "control", assignmentId: a.id, detail: `Demonstration: ${s.what}.` } }),
      ...(s.chase ?? []).map((c) =>
        db.chaseUp.create({ data: { assignmentId: a.id, at: at(c.at), byUserId: c.channel ? control.id : null, channel: c.channel ?? null, outcome: c.outcome, note: c.note ?? (c.channel ? null : "Confirmed by the officer in their portal") } }),
      ),
      ...(s.bookOn
        ? [
            db.bookOn.create({
              data: selfBookOn
                ? { id: `demo-bo-${a.id}`, assignmentId: a.id, at: at(s.bookOn.at), channel: "app", locationVerified: !!place }
                : { assignmentId: a.id, at: at(s.bookOn.at), channel: s.bookOn.channel, recordedByUserId: control.id },
            }),
          ]
        : []),
      ...(s.calls ?? []).map((c, i) =>
        db.checkCall.create({
          // Officers with a portal make their own; one of Liam's came in by phone.
          data: selfCall(i)
            ? { id: `demo-cc-${a.id}-${i}`, assignmentId: a.id, at: at(c), channel: "app", allWell: true }
            : { assignmentId: a.id, at: at(c), channel: "phone", allWell: true, takenByUserId: control.id },
        }),
      ),
      ...(s.attempts ?? []).map((t) =>
        db.contactAttempt.create({ data: { assignmentId: a.id, at: at(t.at), byUserId: control.id, channel: t.channel, reached: false, note: t.note } }),
      ),
      ...(s.clientTold
        ? [db.noSignalHandover.create({ data: { assignmentId: a.id, notifiedAt: at(s.clientTold.at), notifiedByUserId: control.id, notifiedContact: s.clientTold.contact } })]
        : []),
      ...(s.runningLate
        ? [
            db.runningLate.create({ data: { assignmentId: a.id, at: at(s.runningLate.at), minutes: s.runningLate.minutes, note: s.runningLate.note } }),
            db.workItem.create({
              data: { title: `Running late: ${s.officer}, ${s.post} — expects to arrive about ${ukTime(new Date(T + s.from + s.runningLate.minutes * MIN))} (${s.runningLate.minutes} min late) — “${s.runningLate.note}”`, assignmentId: a.id, ownerRole: "control", dueAt: at(s.runningLate.at), slaDays: 0 },
            }),
          ]
        : []),
    ];
    // The book-ons and calls first, then the selfies that prove them.
    await db.$transaction(writes);
    if (proofs.length) await db.dutyProof.createMany({ data: proofs });
    if (s.awayOnLastCall && s.calls?.length) {
      await db.workItem.create({
        data: { title: `Selfie away from the site: ${s.officer}'s check call was taken ${(s.awayOnLastCall / 1000).toFixed(1)} km from ${post.site.name} — ${s.post}. Ring them`, assignmentId: a.id, ownerRole: "control", dueAt: at(s.calls[s.calls.length - 1]), slaDays: 0 },
      });
    }

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
  // 5. Ahead: what two officers said about their days, and an offer for an open shift.
  const today = ukDate(now);
  const say = async (name: string, days: number[], kind: "available" | "unavailable", note: string | null) => {
    for (const d of days) {
      const date = new Date(`${addDays(today, d)}T00:00:00Z`);
      await db.availability.upsert({ where: { personId_date: { personId: personId(name), date } }, create: { personId: personId(name), date, kind, note }, update: { kind, note } });
    }
  };
  await say("Wesley Anand", [1, 2, 3, 5, 6], "available", null);
  await say("Marta Kowalczyk", [1, 2], "unavailable", "Recovering — back on the 27th");
  await say("Elena Petrova", [2, 4], "available", "Nights preferred");
  const gap = await db.openShift.findFirst({ where: { assignmentId: null, cancelledAt: null, startsAt: { gt: new Date(T + 20 * H) } }, orderBy: { startsAt: "asc" }, include: { post: { include: { site: true } } } });
  if (gap && !(await db.shiftVolunteer.findUnique({ where: { openShiftId_personId: { openShiftId: gap.id, personId: personId("Elena Petrova") } } }))) {
    await db.shiftVolunteer.create({ data: { openShiftId: gap.id, personId: personId("Elena Petrova"), at: now, note: "Happy to do nights this week" } });
    await db.workItem.create({ data: { title: `Offered to work: Elena Petrova — ${gap.post.name} at ${gap.post.site.name}. Accept or decline on the rota`, openShiftId: gap.id, ownerRole: "control", dueAt: new Date(T + 86_400_000), slaDays: 1 } });
    console.log(`  Elena Petrova offered for ${gap.post.name}, ${gap.startsAt.toISOString()}`);
  }

  console.log(`\nTen demonstration shifts built around ${now.toISOString()}. Open /duty/chase-ups, /duty/book-ons, /duty/check-calls or the dashboard.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
