import type { Metadata } from "next";
import { RefereeForm } from "@/components/reference/RefereeForm";
import { COMPANY } from "@/lib/core/emails";
import { KIND_LABELS } from "@/lib/core/history";
import { db } from "@/lib/db/client";
import { hashToken } from "@/lib/db/email";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Reference request — ${COMPANY}`, robots: { index: false, follow: false } };

/** The referee's form, through the link emailed to them. No account: the link is the key. */
export default async function ReferencePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = token.length >= 20 && token.length <= 100
    ? await db.referenceRequest.findUnique({ where: { tokenHash: hashToken(token) }, include: { period: { include: { file: { include: { person: { select: { fullName: true } } } } } } } })
    : null;
  const shell = (title: string, body: string) => (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <p className="text-[13px] font-semibold tracking-wide uppercase" style={{ color: "var(--accent-text)" }}>
        {COMPANY}
      </p>
      <h1 className="mt-2 text-[22px] font-semibold">{title}</h1>
      <p className="mt-3 text-[15px]" style={{ color: "var(--text-secondary)" }}>
        {body}
      </p>
    </main>
  );
  if (!r || r.revokedAt) return shell("This link does not work", "It may have been replaced. Reply to the email we sent you instead.");
  if (r.respondedAt) return shell("Thank you", "Your reference has been received.");
  const p = r.period;
  return (
    <RefereeForm
      token={token}
      company={COMPANY}
      person={p.file.person.fullName}
      kind={KIND_LABELS[p.kind]}
      organisation={p.organisation}
      stated={{ from: p.statedFrom.toISOString().slice(0, 10), to: p.statedTo?.toISOString().slice(0, 10) ?? null, role: p.role }}
      referee={r.refereeName}
    />
  );
}
