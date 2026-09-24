"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { COMPANY } from "@/lib/core/emails";
import { KIND_LABELS, requestProblem, type Period } from "@/lib/core/history";
import { appUrl, hashToken, newLinkToken, sealToken, sendEmail } from "@/lib/db/email";
import { refused, ok, type ActionResult } from "./types";

/**
 * References by email (HR, 25 September 2026). The screening administrator
 * emails the referee a link to a short online form — once the contact has
 * been established independently, never on the individual's word [7.5.2a].
 * The referee answers without an account; the answer lands on the history
 * period for the administrator to verify, and is chased automatically.
 *
 * Two kinds of caller, so two guards: the administrator, by their session and
 * seat on the file; the referee, by the link.
 */
async function guard(action: ActionId | { token: string }) {
  if (typeof action === "object") {
    const t = String(action.token ?? "");
    if (t.length < 20 || t.length > 100) return { session: null, request: null, error: refused("This link is not valid.") };
    const request = await db.referenceRequest.findUnique({
      where: { tokenHash: hashToken(t) },
      include: { period: { include: { file: { include: { person: { select: { fullName: true } } } } } } },
    });
    if (!request || request.revokedAt) return { session: null, request: null, error: refused("This link is not valid.") };
    if (request.respondedAt) return { session: null, request: null, error: refused("Thank you — this reference has already been given.") };
    return { session: null, request, error: null };
  }
  const session = await getSession();
  if (!session) return { session: null, request: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) {
    const spec = ACTIONS[action];
    return { session, request: null, error: refused(`${spec.what} belongs to ${spec.owner}.`) };
  }
  return { session, request: null, error: null };
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export async function emailReferenceRequest(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("screening.check");
  if (error || !session) return error!;
  const p = await db.historyPeriod.findUnique({ where: { id: text(formData, "periodId") }, include: { file: { include: { person: { select: { fullName: true } } } } } });
  if (!p) return refused("That history period no longer exists.");
  if (p.file.administratorUserId !== session.userId) return refused("References are requested by the file's administrator.");
  const refereeName = text(formData, "verifierName");
  const email = text(formData, "verifierEmail");
  const contactVerifiedHow = text(formData, "contactVerifiedHow");
  const problem = requestProblem(p as unknown as Period, contactVerifiedHow);
  if (problem) return refused(problem);
  if (p.firstRequestAt) return refused("The first request has already gone.");
  if (refereeName.length < 2) return refused("Say who it goes to.");
  if (!emailOk(email)) return refused("Give the referee's email address — the one you established independently.");

  const { token, hash } = newLinkToken();
  const link = `${await appUrl()}/reference/${token}`;
  const now = new Date();
  const what = `${p.file.person.fullName}'s ${p.kind === "education" ? "time at" : "employment with"} ${p.organisation ?? "your organisation"}`;
  await db.$transaction(async (tx) => {
    await tx.referenceRequest.create({ data: { periodId: p.id, tokenHash: hash, tokenSealed: sealToken(token), sentTo: email, refereeName, sentById: session.userId } });
    await tx.historyPeriod.update({ where: { id: p.id }, data: { verifierName: refereeName, verifierContact: email, contactVerifiedHow, firstRequestAt: now } });
    await sendEmail(
      {
        to: email,
        subject: `Reference request: ${p.file.person.fullName}`,
        body: [
          `Dear ${refereeName},`,
          "",
          `${p.file.person.fullName} has applied for security work with ${COMPANY}, and has given their consent for us to confirm ${what}. Screening for security work follows British Standard BS 7858, which asks us to confirm every period of the last five years.`,
          "",
          "Please confirm the dates and a few details here — it takes about two minutes, and no account is needed:",
          link,
          "",
          "If you would rather reply by email or phone, reply to this message. Thank you for your help.",
          "",
          `${COMPANY} Screening`,
        ].join("\n"),
        purpose: "reference_request",
        personId: p.file.personId,
        createdById: session.userId,
      },
      tx,
    );
    await tx.event.create({
      data: {
        type: "history.reference_emailed",
        actorUserId: session.userId,
        actorRole: session.activeRole,
        department: "vetting",
        personId: p.file.personId,
        screeningFileId: p.fileId,
        detail: `History: 1st reference request emailed to ${refereeName} (${email}) for ${KIND_LABELS[p.kind]}${p.organisation ? `, ${p.organisation}` : ""}. Contact established: ${contactVerifiedHow}.`,
      },
    });
  });
  revalidatePath(`/vetting/${p.fileId}`);
  return ok("Emailed. The referee answers online; the second request goes by itself after 10 working days if nothing comes back.");
}

/** The referee's answer, through the link. */
export async function answerReference(token: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { request, error } = await guard({ token });
  if (error || !request) return error!;
  const confirms = text(formData, "confirms");
  if (confirms !== "yes" && confirms !== "no") return refused("Say whether you can confirm they were with you.");
  const from = text(formData, "from");
  const to = text(formData, "to");
  const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (confirms === "yes" && (!isDay(from) || (to && !isDay(to)) || (to && to < from))) return refused("Give the dates they were with you.");
  const answer = {
    confirms: confirms === "yes",
    from: from || null,
    to: to || null,
    role: text(formData, "role").slice(0, 120),
    reasonForLeaving: text(formData, "reason").slice(0, 300),
    wouldReemploy: text(formData, "reemploy") || null,
    concerns: text(formData, "concerns").slice(0, 1000),
    refereeName: text(formData, "name").slice(0, 120),
    position: text(formData, "position").slice(0, 120),
    signedName: text(formData, "signed").slice(0, 120),
  };
  if (answer.refereeName.length < 2 || answer.position.length < 2) return refused("Give your name and your position.");
  if (answer.signedName.toLowerCase() !== answer.refereeName.toLowerCase()) return refused("Type your name again to sign.");
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const p = request.period;
  const now = new Date();
  const summary = answer.confirms
    ? `Reference from ${answer.refereeName}, ${answer.position} (${request.sentTo}), ${now.toISOString().slice(0, 10)}: with them ${answer.from} to ${answer.to ?? "now"}${answer.role ? ` as ${answer.role}` : ""}${answer.reasonForLeaving ? `; left: ${answer.reasonForLeaving}` : ""}${answer.wouldReemploy ? `; would re-employ: ${answer.wouldReemploy}` : ""}${answer.concerns ? `; concerns: ${answer.concerns}` : "; no concerns raised"}.`
    : `Reference from ${answer.refereeName}, ${answer.position}, ${now.toISOString().slice(0, 10)}: cannot confirm this period.${answer.concerns ? ` ${answer.concerns}` : ""}`;

  await db.$transaction([
    db.referenceRequest.update({ where: { id: request.id }, data: { respondedAt: now, response: { ...answer, ip } } }),
    db.historyPeriod.update({
      where: { id: p.id },
      data: {
        ...(answer.confirms ? { confirmedFrom: new Date(`${answer.from}T00:00:00Z`), confirmedTo: answer.to ? new Date(`${answer.to}T00:00:00Z`) : null } : {}),
        notes: [p.notes, summary].filter(Boolean).join("\n"),
      },
    }),
    // Verifying is still the administrator's decision, never the form's.
    db.workItem.create({
      data: {
        title: `Reference received for ${p.file.person.fullName} (${p.organisation ?? KIND_LABELS[p.kind]}) — ${answer.confirms ? "check it and verify the period" : "they could not confirm it: follow up"}`,
        screeningFileId: p.fileId,
        ownerUserId: p.file.administratorUserId,
        ownerRole: "vetting_admin",
        dueAt: new Date(now.getTime() + 86_400_000),
        slaDays: 1,
      },
    }),
    db.event.create({
      data: { type: "history.reference_received", actorSystem: "referee-link", department: "vetting", personId: p.file.personId, screeningFileId: p.fileId, detail: summary },
    }),
  ]);
  revalidatePath(`/vetting/${p.fileId}`);
  return ok("Thank you — your reference has been received.");
}
