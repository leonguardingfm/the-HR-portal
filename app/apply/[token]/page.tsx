import type { Metadata } from "next";
import { ApplicationForm } from "@/components/apply/ApplicationForm";
import { WelcomePackForm } from "@/components/apply/WelcomePackForm";
import { REQUESTED_DOCUMENTS, cleanDraft } from "@/lib/core/application";
import { COMPANY } from "@/lib/core/emails";
import { ukDate } from "@/lib/core/rota";
import { db } from "@/lib/db/client";
import { candidateUploads, inviteByToken, yearsFor } from "@/lib/db/application";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: COMPANY, robots: { index: false, follow: false } };

/**
 * A candidate's application — or, after the offer, their welcome pack —
 * through the link emailed to them. No account:
 * the link is the key, checked here and by every action behind the page.
 */
export default async function ApplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await inviteByToken(token, null);
  if (!r.invite) {
    const done = r.problem === "done";
    const pack = "purpose" in r && r.purpose === "welcome_pack";
    return (
      <main className="mx-auto max-w-lg px-5 py-16 text-center">
        <p className="text-[13px] font-semibold tracking-wide uppercase" style={{ color: "var(--accent-text)" }}>
          {COMPANY}
        </p>
        <h1 className="mt-2 text-[22px] font-semibold">{done ? (pack ? "Your welcome pack is signed" : "Your application has been sent") : "This link does not work"}</h1>
        <p className="mt-3 text-[15px]" style={{ color: "var(--text-secondary)" }}>
          {done ? (pack ? "Thank you. We will be in touch about your start and your first shift." : "Thank you. We have your application and documents, and will be in touch about the next step.") : r.problem}
        </p>
      </main>
    );
  }
  const invite = r.invite;
  // Opened: the first visit is noted, so Recruitment can see the link reached them.
  if (!invite.openedAt) await db.candidateInvite.update({ where: { id: invite.id }, data: { openedAt: new Date() } });
  const person = invite.candidacy.person;
  if (invite.purpose === "welcome_pack") {
    return (
      <WelcomePackForm
        token={token}
        company={COMPANY}
        fullName={person.fullName}
        expires={invite.expiresAt.toISOString()}
        documents={person.documents.filter((d) => d.typeId === "welcome_pack" && d.note === "Sent in the welcome pack" && d.storageKey).map((d) => ({ id: d.id, name: d.fileName ?? "Welcome pack document" }))}
        nextOfKin={{ name: person.nextOfKinName ?? "", relation: person.nextOfKinRelation ?? "", phone: person.nextOfKinPhone ?? "" }}
      />
    );
  }
  const draft = cleanDraft(invite.draft ?? {});
  // First time in: start them off with what we already know.
  if (!invite.draft) {
    draft.about = {
      ...draft.about,
      fullName: person.fullName,
      email: person.email ?? "",
      phone: person.phone ?? "",
      dateOfBirth: person.dateOfBirth?.toISOString().slice(0, 10) ?? "",
    };
  }
  const req = invite.candidacy.requirement;
  return (
    <ApplicationForm
      token={token}
      company={COMPANY}
      role={req ? `${req.post} at ${req.client.name}` : null}
      years={yearsFor(invite)}
      today={ukDate(new Date())}
      expires={invite.expiresAt.toISOString()}
      initial={draft}
      uploads={candidateUploads(invite).map((d) => ({
        id: d.id,
        typeId: d.typeId,
        label: REQUESTED_DOCUMENTS.find((x) => x.typeId === d.typeId)?.label ?? d.type.label,
        fileName: d.fileName ?? "file",
        checked: d.verification !== "supplied",
      }))}
    />
  );
}
