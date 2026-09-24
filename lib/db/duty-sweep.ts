/**
 * The duty-check sweep: the alerts that must not wait for someone to look.
 *
 * Officers do their own book-ons and check calls, and Control monitors
 * (Control, 24 September 2026). When one is missed, BOTH ends are told:
 *
 *   - Control, as a task on its list, an alarm on every Control screen and a
 *     push to every Control desk that has turned alerts on;
 *   - the officer, as an alert in their portal and a push to their phone,
 *     repeated every five minutes until they act (three times at most).
 *
 * What raises one:
 *
 *   - a chase-up not confirmed with under an hour to go;
 *   - no book-on once the shift is late — fifteen minutes in, not waiting for
 *     the no-show at thirty;
 *   - a check call missed (or, with no signal at the post, the client saying
 *     they cannot reach the officer);
 *   - a shift nobody is on that starts within a day — an open shift never
 *     filled, or one an officer came off (Control, 25 September 2026);
 *   - an SIA licence within 90, 60 or 30 days of expiry, told to the officer,
 *     Control and HR at each step.
 *
 * The pages work every state out live, so the alert is on screen the moment it
 * is true; this makes it durable, pushes it, and closes it on both ends once
 * put right. Idempotent: one open alert per subject, per kind, per end.
 *
 * Run every 30 seconds by the server's own worker (instrumentation.ts), so it
 * runs whether or not anybody is signed in; after every duty action, so an
 * alert clears the moment it is dealt with; and by `npm run sweep:duty` where
 * an outside scheduler is used instead.
 */

import { ALERT_KIND_SPECS, UNCOVERED_ALERT_HOURS, alertKind, isAlarm, openHref, pushDue } from "@/lib/core/alerts";
import { dutyStatus } from "@/lib/core/duty";
import { dayLabel, mondayOf, ukDate, ukTime } from "@/lib/core/rota";
import { db } from "./client";
import { pushToUsers, usersHolding } from "./push";
import { getLiveRows } from "./queries";

/** Each alert's title starts with its kind, which is how an open one is found again. */
export const ALERT_KINDS = {
  chase: { control: ALERT_KIND_SPECS.chase.prefix, officer: ALERT_KIND_SPECS.officer_confirm.prefix },
  bookOn: { control: ALERT_KIND_SPECS.no_book_on.prefix, officer: ALERT_KIND_SPECS.officer_book_on.prefix },
  missed: { control: ALERT_KIND_SPECS.missed.prefix, officer: ALERT_KIND_SPECS.officer_missed.prefix },
} as const;
type Kind = keyof typeof ALERT_KINDS;

export interface SweepResult {
  checked: number;
  raised: number;
  closed: number;
  pushed: number;
}

// One sweep at a time in this process, and a request made while one runs gets
// another straight after it — so an action's own write is always seen. Kept on
// globalThis because the worker and the pages load this module separately.
const lock = globalThis as unknown as { __dutySweep?: Promise<SweepResult> | null; __dutySweepAgain?: Promise<SweepResult> | null };

export function sweepDutyChecks(now?: Date): Promise<SweepResult> {
  if (lock.__dutySweep) {
    lock.__dutySweepAgain ??= lock.__dutySweep.catch(() => null).then(() => {
      lock.__dutySweepAgain = null;
      return sweepDutyChecks();
    });
    return lock.__dutySweepAgain;
  }
  lock.__dutySweep = runSweep(now ?? new Date()).finally(() => {
    lock.__dutySweep = null;
  });
  return lock.__dutySweep;
}

async function runSweep(now: Date): Promise<SweepResult> {
  const duty = await sweepDuty(now);
  const uncovered = await sweepUncovered(now);
  const licences = await sweepLicences(now);
  // News for the officer — "Control has put you on…" — is news for half a day.
  await db.workItem.updateMany({
    where: { state: "open", ownerRole: null, title: { startsWith: ALERT_KIND_SPECS.officer_decision.prefix }, createdAt: { lt: new Date(now.getTime() - 12 * 3_600_000) } },
    data: { state: "done", doneAt: now },
  });
  const pushed = await deliverAlerts(now);
  return {
    checked: duty.checked,
    raised: duty.raised + uncovered.raised + licences.raised,
    closed: duty.closed + uncovered.closed + licences.closed,
    pushed,
  };
}

// ---------------------------------------------------------------------------
// Chase-ups, book-ons and check calls
// ---------------------------------------------------------------------------

async function sweepDuty(now: Date) {
  const rows = await getLiveRows(2, now);
  const liveIds = new Set(rows.map((r) => r.assignment.id));
  const open = await db.workItem.findMany({
    where: { assignmentId: { not: null }, state: "open" },
    select: { id: true, title: true, assignmentId: true, ownerUserId: true, ownerRole: true },
  });
  const find = (id: string, kind: Kind, end: "control" | "officer", userId: string | null) =>
    open.find(
      (w) =>
        w.assignmentId === id &&
        w.title.startsWith(ALERT_KINDS[kind][end]) &&
        (end === "control" ? w.ownerRole === "control" : w.ownerUserId === userId),
    );

  let raised = 0;
  let closed = 0;
  for (const r of rows) {
    const s = dutyStatus(r, now);
    const start = new Date(r.assignment.startsAt);
    const shift = `${r.post.name} at ${r.siteName}, ${dayLabel(ukDate(start))} ${ukTime(start)}`;
    const who = `${r.personName}, ${shift}`;
    const due = s.schedule?.slots.find((x) => x.kind === "missed")?.dueAt;
    const late = r.runningLate ? ` — said they would be ${r.runningLate.minutes} min late` : "";
    const wanted: Record<Kind, { control: string; officer: string } | null> = {
      chase:
        s.chase.state === "urgent"
          ? { control: `${ALERT_KINDS.chase.control}: ${who} — starts in ${s.chase.minutesToStart} min`, officer: `${ALERT_KINDS.chase.officer}: ${shift} starts in ${s.chase.minutesToStart} min` }
          : null,
      bookOn:
        s.stage === "late" || s.stage === "no_show"
          ? {
              control: `${ALERT_KINDS.bookOn.control}: ${who} — ${s.attendance.minutesLate} min${s.stage === "no_show" ? ", no-show: find cover" : ""}${late}`,
              officer: `${ALERT_KINDS.bookOn.officer}: your shift at ${r.siteName} started at ${ukTime(start)}. Book on now, or ring Control`,
            }
          : null,
      missed:
        s.stage === "alert"
          ? {
              control: `${ALERT_KINDS.missed.control}: ${who} — ${s.call.label}`,
              officer: `${ALERT_KINDS.missed.officer}${due ? ` — it was due at ${ukTime(due)}` : ""}. Make your check call now, or ring Control`,
            }
          : null,
    };

    for (const kind of Object.keys(wanted) as Kind[]) {
      const w = wanted[kind];
      for (const end of ["control", "officer"] as const) {
        // An officer with no portal account is told by phone, by Control.
        if (end === "officer" && !r.officerUserId) continue;
        const existing = find(r.assignment.id, kind, end, r.officerUserId);
        if (w && !existing) {
          await db.$transaction([
            db.workItem.create({
              data:
                end === "control"
                  ? { title: w.control, assignmentId: r.assignment.id, ownerRole: "control", dueAt: now, slaDays: 0 }
                  : { title: w.officer, assignmentId: r.assignment.id, ownerUserId: r.officerUserId, dueAt: now, slaDays: 0 },
            }),
            db.event.create({
              data: {
                type: `duty.alert.${kind}.${end}`,
                actorSystem: "duty-sweep",
                department: "control",
                assignmentId: r.assignment.id,
                personId: r.assignment.personId,
                detail: end === "control" ? w.control : `Told ${r.personName} in their portal: ${w.officer}`,
              },
            }),
          ]);
          raised++;
        } else if (!w && existing) {
          await db.workItem.update({ where: { id: existing.id }, data: { state: "done", doneAt: now } });
          closed++;
        }
      }
    }

    // "Running late" is news until they arrive.
    if (r.bookOn) {
      const lateItems = open.filter((w) => w.assignmentId === r.assignment.id && alertKind(w.title) === "running_late");
      for (const w of lateItems) await db.workItem.update({ where: { id: w.id }, data: { state: "done", doneAt: now } });
      closed += lateItems.length;
    }
  }

  // Shifts that have left the live window: finished, cancelled, or taken off.
  // Their chase-up and book-on alerts, and anything addressed to the officer,
  // are over. A missed check call is not — nobody reached the officer, and a
  // person closes that one when they have.
  const gone = open.filter((w) => w.assignmentId && !liveIds.has(w.assignmentId));
  if (gone.length) {
    const shifts = await db.assignment.findMany({
      where: { id: { in: [...new Set(gone.map((w) => w.assignmentId!))] } },
      select: { id: true, state: true, endsAt: true, startsAt: true },
    });
    const shiftOf = new Map(shifts.map((a) => [a.id, a]));
    const over = gone.filter((w) => {
      const a = shiftOf.get(w.assignmentId!);
      if (!a) return false;
      // Not started yet and still on — out of the two-hour window, not over.
      if (a.state !== "cancelled" && a.startsAt > now) return false;
      const kind = alertKind(w.title);
      if (kind === "missed" && a.state !== "cancelled") return false;
      return ALERT_KIND_SPECS[kind].selfClosing || kind === "running_late";
    });
    if (over.length) {
      await db.workItem.updateMany({ where: { id: { in: over.map((w) => w.id) } }, data: { state: "cancelled", doneAt: now } });
      closed += over.length;
    }
  }

  return { checked: rows.length, raised, closed };
}

// ---------------------------------------------------------------------------
// Shifts nobody is on
// ---------------------------------------------------------------------------

async function sweepUncovered(now: Date) {
  const horizon = new Date(now.getTime() + UNCOVERED_ALERT_HOURS * 3_600_000);
  const [needs, gaps, open] = await Promise.all([
    db.coverNeed.findMany({
      where: { coverAssignmentId: null, closedAt: null, endsAt: { gt: now }, startsAt: { lt: horizon } },
      include: { post: { include: { site: true } }, from: { select: { person: { select: { fullName: true } } } } },
    }),
    db.openShift.findMany({
      where: { assignmentId: null, cancelledAt: null, endsAt: { gt: now }, startsAt: { lt: horizon }, post: { active: true, site: { active: true } } },
      include: { post: { include: { site: true } } },
    }),
    db.workItem.findMany({
      where: { state: "open", OR: [{ coverNeedId: { not: null } }, { openShiftId: { not: null } }], title: { startsWith: ALERT_KIND_SPECS.uncovered.prefix } },
      select: { id: true, coverNeedId: true, openShiftId: true },
    }),
  ]);
  const label = (x: { startsAt: Date; endsAt: Date; post: { name: string; site: { name: string } } }) =>
    `${x.post.name} at ${x.post.site.name}, ${dayLabel(ukDate(x.startsAt))} ${ukTime(x.startsAt)}–${ukTime(x.endsAt)}`;

  const wantNeed = new Set(needs.map((n) => n.id));
  const wantGap = new Set(gaps.map((g) => g.id));
  let raised = 0;
  for (const n of needs) {
    if (open.some((w) => w.coverNeedId === n.id)) continue;
    const title = `${ALERT_KIND_SPECS.uncovered.prefix}: ${label(n)} — ${n.from.person.fullName} came off. Find cover`;
    await db.$transaction([
      db.workItem.create({ data: { title, coverNeedId: n.id, ownerRole: "control", dueAt: now, slaDays: 0 } }),
      db.event.create({ data: { type: "duty.alert.uncovered.control", actorSystem: "duty-sweep", department: "control", siteId: n.post.siteId, detail: title } }),
    ]);
    raised++;
  }
  for (const g of gaps) {
    if (open.some((w) => w.openShiftId === g.id)) continue;
    const title = `${ALERT_KIND_SPECS.uncovered.prefix}: ${label(g)} — nobody is on it yet`;
    await db.$transaction([
      db.workItem.create({ data: { title, openShiftId: g.id, ownerRole: "control", dueAt: now, slaDays: 0 } }),
      db.event.create({ data: { type: "duty.alert.uncovered.control", actorSystem: "duty-sweep", department: "control", siteId: g.post.siteId, detail: title } }),
    ]);
    raised++;
  }
  // Filled, cancelled, left uncovered on purpose, or over: the alert is done.
  const settled = open.filter((w) => (w.coverNeedId ? !wantNeed.has(w.coverNeedId) : !wantGap.has(w.openShiftId!)));
  if (settled.length) await db.workItem.updateMany({ where: { id: { in: settled.map((w) => w.id) } }, data: { state: "done", doneAt: now } });

  // An offer to work a shift that is no longer open has been answered by events.
  const offers = await db.workItem.findMany({
    where: { state: "open", openShiftId: { not: null }, title: { startsWith: ALERT_KIND_SPECS.volunteer.prefix } },
    select: { id: true, openShift: { select: { assignmentId: true, cancelledAt: true, endsAt: true } } },
  });
  const stale = offers.filter((w) => !w.openShift || w.openShift.assignmentId || w.openShift.cancelledAt || w.openShift.endsAt <= now);
  if (stale.length) await db.workItem.updateMany({ where: { id: { in: stale.map((w) => w.id) } }, data: { state: "done", doneAt: now } });

  return { raised, closed: settled.length + stale.length };
}

// ---------------------------------------------------------------------------
// SIA licences running out
// ---------------------------------------------------------------------------

const LICENCE_STEPS = [30, 60, 90] as const;
/** Licences change slowly: looked at every half an hour, not every sweep. */
const LICENCE_EVERY_MS = 30 * 60_000;
const licenceClock = globalThis as unknown as { __licenceSweepAt?: number };

async function sweepLicences(now: Date) {
  if (licenceClock.__licenceSweepAt && now.getTime() - licenceClock.__licenceSweepAt < LICENCE_EVERY_MS) return { raised: 0, closed: 0 };
  licenceClock.__licenceSweepAt = now.getTime();

  const horizon = new Date(now.getTime() + LICENCE_STEPS[LICENCE_STEPS.length - 1] * 86_400_000);
  const [licences, open] = await Promise.all([
    db.licence.findMany({
      where: { person: { employment: { state: { in: ["conditional", "confirmed"] } } } },
      include: { person: { select: { id: true, fullName: true, user: { select: { id: true } } } } },
      orderBy: { expiresAt: "desc" },
    }),
    db.workItem.findMany({
      where: {
        state: "open",
        personId: { not: null },
        OR: [{ title: { startsWith: ALERT_KIND_SPECS.licence.prefix } }, { title: { startsWith: ALERT_KIND_SPECS.officer_licence.prefix } }],
      },
      select: { id: true, title: true, personId: true, ownerRole: true, ownerUserId: true },
    }),
  ]);
  // The licence that counts is each officer's latest of each kind: a renewed
  // one supersedes the card it replaced.
  const latest = new Map<string, (typeof licences)[number]>();
  for (const l of licences) if (!latest.has(`${l.personId}|${l.kind}`)) latest.set(`${l.personId}|${l.kind}`, l);

  const wanted = new Map<string, { title: string; personId: string; ownerRole?: "control" | "recruitment"; ownerUserId?: string }>();
  for (const l of latest.values()) {
    if (l.expiresAt > horizon) continue;
    const days = Math.ceil((l.expiresAt.getTime() - now.getTime()) / 86_400_000);
    const when = `${dayLabel(ukDate(l.expiresAt))} ${l.expiresAt.getUTCFullYear()}`;
    const step = days <= 0 ? "expired" : `within ${LICENCE_STEPS.find((s) => days <= s)} days`;
    const staff = days <= 0 ? `${ALERT_KIND_SPECS.licence.prefix}ed on ${when}: ${l.person.fullName} (${l.number}) — cannot be deployed` : `${ALERT_KIND_SPECS.licence.prefix}es ${step}: ${l.person.fullName} (${l.number}), on ${when}`;
    for (const role of ["control", "recruitment"] as const) wanted.set(`${role}|${l.personId}|${l.number}`, { title: staff, personId: l.personId, ownerRole: role });
    if (l.person.user) {
      wanted.set(`officer|${l.personId}|${l.number}`, {
        title: days <= 0 ? `${ALERT_KIND_SPECS.officer_licence.prefix}ed on ${when}. You cannot work until it is renewed — contact HR` : `${ALERT_KIND_SPECS.officer_licence.prefix}es ${step}, on ${when}. Renew it with the SIA and send HR the new card`,
        personId: l.personId,
        ownerUserId: l.person.user.id,
      });
    }
  }

  const keyOf = (w: (typeof open)[number]) => {
    const number = w.title.match(/\(([^)]+)\)/)?.[1];
    const end = w.ownerUserId && !w.ownerRole ? "officer" : w.ownerRole;
    return number ? `${end}|${w.personId}|${number}` : null;
  };
  let raised = 0;
  let closed = 0;
  const kept = new Set<string>();
  for (const w of open) {
    // The officer's own title carries no number, so it is matched by person.
    const k = w.ownerUserId && !w.ownerRole ? [...wanted.keys()].find((key) => key.startsWith(`officer|${w.personId}|`)) : keyOf(w);
    const want = k ? wanted.get(k) : undefined;
    if (want && want.title === w.title) kept.add(k!);
    else {
      await db.workItem.update({ where: { id: w.id }, data: { state: "done", doneAt: now } });
      closed++;
    }
  }
  for (const [k, w] of wanted) {
    if (kept.has(k)) continue;
    await db.$transaction([
      db.workItem.create({
        data: { title: w.title, personId: w.personId, ownerRole: w.ownerRole ?? null, ownerUserId: w.ownerUserId ?? null, dueAt: now, slaDays: w.ownerUserId ? 0 : 3 },
      }),
      ...(w.ownerRole === "control"
        ? [db.event.create({ data: { type: "licence.expiry_warning", actorSystem: "duty-sweep", department: "compliance", personId: w.personId, detail: w.title } })]
        : []),
    ]);
    raised++;
  }
  return { raised, closed };
}

// ---------------------------------------------------------------------------
// Pushing the alerts
// ---------------------------------------------------------------------------

/**
 * Push every open alert that is due a push: new ones at once, an officer's
 * again every five minutes while it stands (three times at most). Control
 * desks get each alert once; their screens keep sounding until acknowledged.
 */
export async function deliverAlerts(now = new Date()): Promise<number> {
  const items = await db.workItem.findMany({
    where: { state: "open", slaDays: 0, createdAt: { gt: new Date(now.getTime() - 24 * 3_600_000) } },
    select: {
      id: true, title: true, slaDays: true, ownerRole: true, ownerUserId: true,
      personId: true, assignmentId: true, coverNeedId: true, openShiftId: true, incidentId: true,
      coverNeed: { select: { startsAt: true, postId: true } },
      openShift: { select: { startsAt: true, postId: true } },
      deliveries: { select: { at: true } },
    },
  });
  const alarms = items.filter((w) => isAlarm(w) && (w.ownerRole === "control" || (w.ownerUserId && !w.ownerRole)));
  if (alarms.length === 0) return 0;

  let control: string[] | null = null;
  let pushed = 0;
  for (const w of alarms) {
    const officer = !w.ownerRole;
    // An officer is reminded about what they must do; news is told once.
    const nags = officer && ALERT_KIND_SPECS[alertKind(w.title)].severity !== "neutral";
    if (!pushDue({ sent: w.deliveries.map((d) => d.at), now, officer: nags })) continue;
    const [head, ...rest] = w.title.split(": ");
    const shift = w.coverNeed ?? w.openShift;
    const url = officer
      ? "/me"
      : openHref(w, { rotaHref: shift ? `/scheduling?week=${mondayOf(ukDate(shift.startsAt))}&post=${shift.postId}&day=${ukDate(shift.startsAt)}` : null });
    const message = {
      title: officer ? head : `Control: ${head}`,
      body: rest.join(": ") || head,
      url,
      tag: `alert-${w.id}`,
      urgent: ALERT_KIND_SPECS[alertKind(w.title)].severity === "critical",
    };
    const targets = officer ? [w.ownerUserId!] : (control ??= await usersHolding(["control", "operations_manager"]));
    const r = await pushToUsers(targets, message, w.id);
    pushed += r.delivered;
  }
  return pushed;
}
