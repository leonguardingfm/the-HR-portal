"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { INVITE_RULES } from "@/lib/core/application";
import { dayLabel, ukDate, ukInstant, ukTime } from "@/lib/core/rota";
import { applicationEmail, welcomePackEmail } from "@/lib/core/emails";
import { ALLOWED_KINDS, sniffMime } from "@/lib/core/screening-documents";
import { deleteObject, putObject } from "@/lib/storage";
import { createHash, randomBytes } from "node:crypto";
import { COMPANY, appUrl, newLinkToken, sealToken, sendEmail } from "@/lib/db/email";
import { rewriteIdentityKeys } from "@/lib/db/people";
import { INTERVIEW_STAGE_LABELS } from "@/lib/labels";
import { refused, ok, type ActionResult } from "./types";

/**
 * Recruitment's self-service tools (HR, 25 September 2026): sending a
 * candidate the link to fill in their own application and upload their own
 * documents, withdrawing it, correcting their details, and booking their
 * interviews with an emailed invitation.
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { session: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) {
    const spec = ACTIONS[action];
    return {
      session,
      error: refused(`${spec.what} belongs to ${spec.owner}. You are working as ${session.activeRole.replace(/_/g, " ")}, so the platform refuses it.`),
    };
  }
  return { session, error: null };
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const refresh = (id: string) => {
  revalidatePath(`/candidates/${id}`);
  revalidatePath("/candidates");
  revalidatePath("/");
};

export async function sendApplicationForm(candidacyId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("candidate.invite");
  if (error || !session) return error!;
  const c = await db.candidacy.findUnique({ where: { id: String(candidacyId) }, include: { person: true, requirement: { include: { client: true } } } });
  if (!c) return refused("That candidate no longer exists.");
  if (c.stage === "withdrawn") return refused("That candidate has been withdrawn.");
  if (c.applicationSubmittedAt) return refused("They have already sent their application in.");
  if (!c.person.email) return refused("Add their email address first — the form is sent to it.");

  const now = new Date();
  const { token, hash } = newLinkToken();
  const expiresAt = new Date(now.getTime() + INVITE_RULES.validDays * 86_400_000);
  const link = `${await appUrl()}/apply/${token}`;
  const years = c.requirement?.client.screeningPeriodYears === 10 ? 10 : 5;
  const mail = applicationEmail({ name: c.person.fullName, link, expiresAt, years });

  const sent = await db.$transaction(async (tx) => {
    // A new link replaces the old one; the old stops working.
    await tx.candidateInvite.updateMany({ where: { candidacyId: c.id, purpose: "application", revokedAt: null, submittedAt: null }, data: { revokedAt: now } });
    await tx.candidateInvite.create({
      data: { candidacyId: c.id, purpose: "application", tokenHash: hash, tokenSealed: sealToken(token), sentTo: c.person.email!, createdById: session.userId, expiresAt },
    });
    // Invited is a stage of its own; a candidate further on stays where they are.
    if (c.stage === "sourcing" || c.stage === "shortlisted") {
      await tx.candidacy.update({ where: { id: c.id }, data: { stage: "invited", stageSince: now } });
    }
    const email = await sendEmail({ to: c.person.email!, ...mail, purpose: "application_invite", personId: c.personId, candidacyId: c.id, createdById: session.userId }, tx);
    await tx.event.create({
      data: {
        type: "candidate.application_sent",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "recruitment",
        personId: c.personId,
        detail: `Application form ${email.status === "sent" ? "emailed" : "prepared"} for ${c.person.fullName} (${c.person.email}); the link works until ${expiresAt.toISOString().slice(0, 10)}.`,
      },
    });
    return email;
  });
  refresh(c.id);
  return sent.status === "sent"
    ? ok(`Sent to ${c.person.email}. They will be reminded after ${INVITE_RULES.reminderAfterDays.join(" and ")} days if it is not finished.`)
    : ok(`Email is not set up on this server yet, so it was not sent. Copy the link from “Emails” below and send it yourself: ${link}`);
}

export async function withdrawApplicationLink(candidacyId: string, _prev: ActionResult | null, _formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("candidate.invite");
  if (error || !session) return error!;
  const purpose = _formData.get("purpose") === "welcome_pack" ? "welcome_pack" : "application";
  const n = await db.candidateInvite.updateMany({ where: { candidacyId: String(candidacyId), purpose, revokedAt: null, submittedAt: null }, data: { revokedAt: new Date() } });
  if (n.count === 0) return refused("There is no live link to withdraw.");
  await db.event.create({
    data: { type: `candidate.${purpose}_link_withdrawn`, actorUserId: session.userId, actorRole: session.activeRole, department: "recruitment", detail: `${purpose === "welcome_pack" ? "Welcome pack" : "Application"} link withdrawn; it no longer opens.` },
  });
  refresh(String(candidacyId));
  return ok("Withdrawn. The link no longer opens.");
}

/**
 * The welcome pack, by email link, once the conditional offer has gone. The
 * candidate reads and signs it online; their personalised contract and any
 * other pack documents can go with it. Sending it completes "Welcome pack
 * sent" on the onboarding checklist.
 */
export async function sendWelcomePack(candidacyId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("candidate.invite");
  if (error || !session) return error!;
  const c = await db.candidacy.findUnique({ where: { id: String(candidacyId) }, include: { person: true, onboardingSteps: { select: { step: true } } } });
  if (!c) return refused("That candidate no longer exists.");
  if (!["conditional_offer", "welcome_pack"].includes(c.stage)) return refused("The welcome pack goes after the conditional offer.");
  if (!c.onboardingSteps.some((x) => x.step === "offer_issued")) return refused("Tick “Conditional offer issued” on the onboarding checklist first.");
  if (!c.person.email) return refused("Add their email address first — the pack is sent to it.");
  const signed = await db.candidateInvite.findFirst({ where: { candidacyId: c.id, purpose: "welcome_pack", submittedAt: { not: null } } });
  if (signed) return refused("They have already signed their welcome pack.");

  // The documents to read, uploaded here and shown to them through the link.
  const files = formData.getAll("attachment").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 6);
  const stored: { key: string; data: Parameters<typeof db.documentRecord.create>[0]["data"] }[] = [];
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) return refused(`${f.name} is over 10 MB.`);
    const bytes = new Uint8Array(await f.arrayBuffer());
    const mime = sniffMime(bytes);
    if (!mime) return refused(`${f.name} is not a PDF, JPEG or PNG.`);
    stored.push({
      key: `people/${c.personId}/${randomBytes(12).toString("hex")}.${ALLOWED_KINDS[mime]}`,
      data: { typeId: "welcome_pack", personId: c.personId, verification: "verified", fileName: f.name.slice(0, 200), mimeType: mime, sizeBytes: f.size, sha256: createHash("sha256").update(bytes).digest("hex"), suppliedAt: new Date(), verifiedAt: new Date(), verifiedById: session.userId, uploadedById: session.userId, note: "Sent in the welcome pack" },
    });
    await putObject(stored[stored.length - 1].key, bytes);
  }

  const now = new Date();
  const { token, hash } = newLinkToken();
  const expiresAt = new Date(now.getTime() + INVITE_RULES.validDays * 86_400_000);
  const link = `${await appUrl()}/apply/${token}`;
  const mail = welcomePackEmail({ name: c.person.fullName, link, expiresAt });
  let sent;
  try {
    sent = await db.$transaction(async (tx) => {
      await tx.candidateInvite.updateMany({ where: { candidacyId: c.id, purpose: "welcome_pack", revokedAt: null, submittedAt: null }, data: { revokedAt: now } });
      await tx.candidateInvite.create({ data: { candidacyId: c.id, purpose: "welcome_pack", tokenHash: hash, tokenSealed: sealToken(token), sentTo: c.person.email!, createdById: session.userId, expiresAt } });
      for (const d of stored) await tx.documentRecord.create({ data: { ...d.data, storageKey: d.key } });
      if (!c.onboardingSteps.some((x) => x.step === "pack_issued")) {
        await tx.onboardingStep.create({ data: { candidacyId: c.id, step: "pack_issued", doneById: session.userId, note: `Sent by email link to ${c.person.email}` } });
      }
      const email = await sendEmail({ to: c.person.email!, ...mail, purpose: "welcome_pack", personId: c.personId, candidacyId: c.id, createdById: session.userId }, tx);
      await tx.event.create({
        data: {
          type: "candidate.welcome_pack_sent",
          actorUserId: session.userId,
          actorRole: session.activeRole,
          department: "recruitment",
          personId: c.personId,
          detail: `Welcome pack ${email.status === "sent" ? "emailed" : "prepared"} for ${c.person.fullName} (${c.person.email})${stored.length ? ` with ${stored.length} document${stored.length === 1 ? "" : "s"}` : ""}; the link works until ${expiresAt.toISOString().slice(0, 10)}.`,
        },
      });
      return email;
    });
  } catch (e) {
    for (const d of stored) await deleteObject(d.key).catch(() => {});
    throw e;
  }
  refresh(c.id);
  revalidatePath("/onboarding");
  return sent.status === "sent"
    ? ok(`Sent to ${c.person.email}. They sign online; each part they accept ticks itself off the onboarding checklist.`)
    : ok(`Email is not set up on this server yet, so it was not sent. Copy the link from “Emails” and send it yourself: ${link}`);
}

/** Correct a candidate's details — the duplicate-check keys follow the correction. */
export async function updateCandidateDetails(candidacyId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("candidacy.edit");
  if (error || !session) return error!;
  const c = await db.candidacy.findUnique({ where: { id: String(candidacyId) }, include: { person: true } });
  if (!c) return refused("That candidate no longer exists.");
  const next = {
    fullName: text(formData, "fullName").replace(/\s+/g, " "),
    email: text(formData, "email") || null,
    phone: text(formData, "phone") || null,
    dob: text(formData, "dateOfBirth"),
    nationalInsurance: text(formData, "nationalInsurance").toUpperCase() || null,
    address: text(formData, "address") || null,
    postcode: text(formData, "postcode").toUpperCase() || null,
  };
  if (next.fullName.length < 2) return refused("Give their full name.");
  if (!next.email && !next.phone) return refused("Keep an email or a phone number, so they can be contacted.");
  if (next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) return refused("That is not a valid email address.");
  if (next.phone && next.phone.replace(/\D/g, "").length < 10) return refused("That phone number looks too short.");
  const dateOfBirth = next.dob ? new Date(`${next.dob}T00:00:00Z`) : null;
  if (dateOfBirth && Number.isNaN(dateOfBirth.getTime())) return refused("Check the date of birth.");
  if (next.nationalInsurance && !/^[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]$/.test(next.nationalInsurance)) return refused("That does not look like a National Insurance number.");

  const before = c.person;
  const changed = [
    before.fullName !== next.fullName && `name: ${before.fullName} → ${next.fullName}`,
    (before.email ?? null) !== next.email && "email",
    (before.phone ?? null) !== next.phone && "phone",
    (before.dateOfBirth?.toISOString().slice(0, 10) ?? "") !== next.dob && "date of birth",
    (before.nationalInsurance ?? null) !== next.nationalInsurance && "National Insurance number",
    (before.address ?? null) !== next.address && "address",
    (before.postcode ?? null) !== next.postcode && "postcode",
  ].filter(Boolean) as string[];
  if (changed.length === 0) return refused("Nothing has changed.");

  try {
    const clash = await db.$transaction(async (tx) => {
      const problem = await rewriteIdentityKeys(tx, c.personId, { fullName: next.fullName, dateOfBirth, email: next.email, phone: next.phone, nationalInsurance: next.nationalInsurance });
      if (problem) return problem;
      await tx.person.update({
        where: { id: c.personId },
        data: { fullName: next.fullName, email: next.email, phone: next.phone, dateOfBirth, nationalInsurance: next.nationalInsurance, address: next.address, postcode: next.postcode },
      });
      await tx.event.create({
        data: { type: "candidate.details_corrected", actorUserId: session.userId, actorRole: session.activeRole, department: "recruitment", personId: c.personId, detail: `${next.fullName}'s details corrected — ${changed.join("; ")}.` },
      });
      return null;
    });
    if (clash) return refused(clash);
  } catch (e) {
    if (String(e).includes("nationalInsurance")) return refused("That National Insurance number already belongs to someone else.");
    throw e;
  }
  refresh(c.id);
  return ok(`Saved: ${changed.join(", ")}.`);
}

export async function bookInterview(candidacyId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("interview.book");
  if (error || !session) return error!;
  const c = await db.candidacy.findUnique({ where: { id: String(candidacyId) }, include: { person: true } });
  if (!c) return refused("That candidate no longer exists.");
  const stage = text(formData, "stage") as "first" | "second" | "additional";
  if (!["first", "second", "additional"].includes(stage)) return refused("Choose which interview this is.");
  const date = text(formData, "date");
  const time = text(formData, "time");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return refused("Give the date and time.");
  const startsAt = ukInstant(date, time);
  if (startsAt.getTime() < Date.now() + 15 * 60_000) return refused("That time has passed, or is too soon to tell them.");
  const minutes = Number(text(formData, "minutes") || "30");
  const place = text(formData, "place");
  if (place.length < 3) return refused("Say where: the address, “Phone”, or the video link.");
  const interviewerUserId = text(formData, "interviewerUserId") || null;
  const interviewer = interviewerUserId ? await db.user.findUnique({ where: { id: interviewerUserId }, select: { displayName: true } }) : null;
  const when = `${dayLabel(date)} ${startsAt.getUTCFullYear()} at ${ukTime(startsAt)}`;

  try {
    await db.$transaction(async (tx) => {
      await tx.interviewBooking.create({ data: { candidacyId: c.id, stage, startsAt, minutes, place, interviewerUserId, createdById: session.userId } });
      if (c.person.email) {
        await sendEmail(
          {
            to: c.person.email,
            subject: `Your interview with ${COMPANY} — ${when}`,
            body: [
              `Hello ${c.person.fullName.split(" ")[0]},`,
              "",
              `Your ${INTERVIEW_STAGE_LABELS[stage].toLowerCase()} with ${COMPANY} is booked:`,
              "",
              `When: ${when} (about ${minutes} minutes)`,
              `Where: ${place}`,
              interviewer ? `With: ${interviewer.displayName}` : "",
              "",
              "Please bring your passport or photo driving licence. If you cannot make it, reply to this email and we will find another time.",
              "",
              `${COMPANY} Recruitment`,
            ]
              .filter((l) => l !== "")
              .join("\n"),
            purpose: "interview_invite",
            personId: c.personId,
            candidacyId: c.id,
            createdById: session.userId,
          },
          tx,
        );
      }
      await tx.event.create({
        data: { type: "interview.booked", actorUserId: session.userId, actorRole: session.activeRole, department: "recruitment", personId: c.personId, detail: `${INTERVIEW_STAGE_LABELS[stage]} booked for ${c.person.fullName}: ${when}, ${place}${interviewer ? `, with ${interviewer.displayName}` : ""}.` },
      });
    });
  } catch (e) {
    if (String(e).includes("interview_booking_one_per_stage")) return refused("That interview is already booked. Cancel it first to move it.");
    throw e;
  }
  refresh(c.id);
  return ok(`Booked for ${when}.${c.person.email ? " The invitation has gone to them, and a reminder goes the day before." : " They have no email address — tell them yourself."}`);
}

export async function cancelInterview(bookingId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("interview.book");
  if (error || !session) return error!;
  const b = await db.interviewBooking.findUnique({ where: { id: String(bookingId) }, include: { candidacy: { include: { person: true } } } });
  if (!b || b.status !== "booked") return refused("That interview is not booked any more.");
  const reason = text(formData, "reason");
  const noShow = text(formData, "noShow") === "1";
  if (!noShow && reason.length < 3) return refused("Say why it is cancelled.");
  await db.$transaction([
    db.interviewBooking.update({ where: { id: b.id }, data: noShow ? { status: "no_show" } : { status: "cancelled", cancelledReason: reason } }),
    db.event.create({
      data: {
        type: noShow ? "interview.no_show" : "interview.cancelled",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "recruitment",
        personId: b.candidacy.personId,
        detail: noShow ? `${b.candidacy.person.fullName} did not come to their interview.` : `Interview for ${b.candidacy.person.fullName} cancelled: ${reason}`,
      },
    }),
  ]);
  refresh(b.candidacyId);
  return ok(noShow ? "Recorded as a no-show." : "Cancelled.");
}
