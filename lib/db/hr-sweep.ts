/**
 * HR's clock, run by the server's worker (HR, 25 September 2026):
 *
 *   - candidates who have not finished their application, or signed their
 *     welcome pack, are reminded two days and five days after the link went;
 *   - candidates are reminded of their interview the day before;
 *   - referees who have not answered get the second request after ten working
 *     days, and the file's administrator is told to go documentary after
 *     another ten [7.7];
 *   - a leaver's portal access ends after their last working day.
 *
 * Every email sent here is kept, like any other. Looked at every ten minutes,
 * not every sweep: none of this is urgent to the minute.
 */

import { INVITE_RULES } from "@/lib/core/application";
import { applicationEmail, COMPANY, welcomePackEmail } from "@/lib/core/emails";
import { workingDaysBetween } from "@/lib/core/history";
import { dayLabel, ukDate, ukTime } from "@/lib/core/rota";
import { INTERVIEW_STAGE_LABELS } from "@/lib/labels";
import { db } from "./client";
import { appUrl, sendEmail, unsealToken } from "./email";

const EVERY_MS = 10 * 60_000;
const clock = globalThis as unknown as { __hrSweepAt?: number };

export async function sweepHr(now = new Date()) {
  if (clock.__hrSweepAt && now.getTime() - clock.__hrSweepAt < EVERY_MS) return { reminders: 0, interviews: 0, references: 0, leavers: 0 };
  clock.__hrSweepAt = now.getTime();
  const base = await appUrl();
  return {
    reminders: await remindApplications(now, base),
    interviews: await remindInterviews(now),
    references: await chaseReferences(now, base),
    leavers: await endLeaverAccess(now),
  };
}

async function remindApplications(now: Date, base: string) {
  const open = await db.candidateInvite.findMany({
    where: { submittedAt: null, revokedAt: null, expiresAt: { gt: now }, reminders: { lt: INVITE_RULES.reminderAfterDays.length } },
    include: { candidacy: { include: { person: true, requirement: { include: { client: true } } } } },
  });
  let sent = 0;
  for (const i of open) {
    const dueAfter = INVITE_RULES.reminderAfterDays[i.reminders] * 86_400_000;
    if (now.getTime() - i.createdAt.getTime() < dueAfter) continue;
    const token = unsealToken(i.tokenSealed);
    if (!token) continue;
    const link = `${base}/apply/${token}`;
    const mail =
      i.purpose === "welcome_pack"
        ? welcomePackEmail({ name: i.candidacy.person.fullName, link, expiresAt: i.expiresAt, reminder: true })
        : applicationEmail({ name: i.candidacy.person.fullName, link, expiresAt: i.expiresAt, years: i.candidacy.requirement?.client.screeningPeriodYears === 10 ? 10 : 5, reminder: true });
    await db.$transaction(async (tx) => {
      await tx.candidateInvite.update({ where: { id: i.id }, data: { reminders: { increment: 1 }, lastReminderAt: now } });
      await sendEmail({ to: i.sentTo, ...mail, purpose: `${i.purpose}_reminder`, personId: i.candidacy.personId, candidacyId: i.candidacyId }, tx);
    });
    sent++;
  }
  return sent;
}

async function remindInterviews(now: Date) {
  const due = await db.interviewBooking.findMany({
    where: { status: "booked", reminderSentAt: null, startsAt: { gt: new Date(now.getTime() + 2 * 3_600_000), lt: new Date(now.getTime() + 26 * 3_600_000) } },
    include: { candidacy: { include: { person: true } } },
  });
  let sent = 0;
  for (const b of due) {
    const p = b.candidacy.person;
    await db.$transaction(async (tx) => {
      await tx.interviewBooking.update({ where: { id: b.id }, data: { reminderSentAt: now } });
      if (p.email) {
        await sendEmail(
          {
            to: p.email,
            subject: `Reminder: your interview with ${COMPANY} tomorrow`,
            body: `Hello ${p.fullName.split(" ")[0]},\n\nA reminder of your ${INTERVIEW_STAGE_LABELS[b.stage].toLowerCase()} with ${COMPANY}: ${dayLabel(ukDate(b.startsAt))} at ${ukTime(b.startsAt)}, ${b.place}.\n\nPlease bring your passport or photo driving licence. If you cannot make it, reply to this email.\n\n${COMPANY} Recruitment`,
            purpose: "interview_reminder",
            personId: p.id,
            candidacyId: b.candidacyId,
          },
          tx,
        );
      }
    });
    sent++;
  }
  return sent;
}

async function chaseReferences(now: Date, base: string) {
  const open = await db.referenceRequest.findMany({
    where: { respondedAt: null, revokedAt: null },
    include: { period: { include: { file: { include: { person: { select: { fullName: true } } } } } } },
  });
  let n = 0;
  for (const r of open) {
    const since = r.lastChasedAt ?? r.sentAt;
    if (workingDaysBetween(since, now) < 10) continue;
    if (r.chases === 0) {
      const token = unsealToken(r.tokenSealed);
      if (!token) continue;
      await db.$transaction(async (tx) => {
        await tx.referenceRequest.update({ where: { id: r.id }, data: { chases: 1, lastChasedAt: now } });
        await tx.historyPeriod.update({ where: { id: r.periodId }, data: { secondRequestAt: r.period.secondRequestAt ?? now } });
        await sendEmail(
          {
            to: r.sentTo,
            subject: `Second request: reference for ${r.period.file.person.fullName}`,
            body: `Dear ${r.refereeName},\n\nWe wrote ten working days ago asking you to confirm ${r.period.file.person.fullName}'s time with ${r.period.organisation ?? "your organisation"}. We have not had an answer yet, and it holds up their screening for security work.\n\nIt takes about two minutes:\n${base}/reference/${token}\n\nThank you.\n${COMPANY} Screening`,
            purpose: "reference_second_request",
            personId: r.period.file.personId,
          },
          tx,
        );
        await tx.event.create({
          data: { type: "history.reference_chased", actorSystem: "hr-sweep", department: "vetting", personId: r.period.file.personId, screeningFileId: r.period.fileId, detail: `Second reference request emailed to ${r.refereeName} for ${r.period.organisation ?? "a history period"}.` },
        });
      });
      n++;
    } else if (r.chases === 1) {
      // Twenty working days and nothing: the documentary route [SV].
      await db.$transaction([
        db.referenceRequest.update({ where: { id: r.id }, data: { chases: 2, lastChasedAt: now } }),
        db.workItem.create({
          data: {
            title: `No reference from ${r.refereeName} (${r.period.organisation ?? "history period"}) after two requests — go to documentary evidence for ${r.period.file.person.fullName}`,
            screeningFileId: r.period.fileId,
            ownerUserId: r.period.file.administratorUserId,
            ownerRole: "vetting_admin",
            dueAt: new Date(now.getTime() + 2 * 86_400_000),
            slaDays: 2,
          },
        }),
      ]);
      n++;
    }
  }
  return n;
}

async function endLeaverAccess(now: Date) {
  const today = new Date(`${ukDate(now)}T00:00:00Z`);
  const leavers = await db.employment.findMany({
    where: { state: "ended", lastWorkingDay: { lt: today }, person: { user: { active: true } } },
    include: { person: { select: { fullName: true, user: { select: { id: true } } } } },
  });
  for (const e of leavers) {
    const userId = e.person.user!.id;
    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { active: false } }),
      db.workSession.updateMany({ where: { userId, signedOutAt: null }, data: { signedOutAt: now } }),
      db.event.create({ data: { type: "employee.access_ended", actorSystem: "hr-sweep", department: "recruitment", personId: e.personId, detail: `${e.person.fullName}'s portal access ended after their last working day.` } }),
    ]);
  }
  return leavers.length;
}
