import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { requireSession } from "@/lib/auth/server";
import { isProofCode, mapLink, metres, proofVerdict } from "@/lib/core/proof";
import { dayLabel, ukDate, ukTime } from "@/lib/core/rota";
import { db } from "@/lib/db/client";
import type { Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * What the QR code on an officer's selfie opens: the record the server kept
 * when the photo arrived. The server's own clock, the location the phone sent,
 * how far that was from the site, and the photo — so a picture whose stamp has
 * been edited is caught by comparing the two.
 */
export default async function VerifyProofPage({ params }: { params: Promise<{ code: string }> }) {
  await requireSession();
  const { code } = await params;
  if (!isProofCode(code)) notFound();
  const p = await db.dutyProof.findUnique({
    where: { code },
    include: { assignment: { include: { person: { include: { employment: { select: { pin: true } } } }, post: { include: { site: { include: { client: true } } } } } } },
  });
  if (!p) notFound();
  // Not logged per view: a page that writes to the log as it renders would move
  // every open screen's pulse, which would render it again.

  const site = p.assignment.post.site;
  const verdict = proofVerdict({
    atSite: p.atSite,
    distanceMetres: p.distanceMetres,
    accuracyMetres: p.accuracyMetres,
    liveCamera: p.liveCamera,
    hasLocation: p.latitude != null,
    siteHasLocation: site.latitude != null,
  });
  const at = (d: Date) => `${dayLabel(ukDate(d))} ${d.getUTCFullYear()} ${ukTime(d)}:${String(new Date(d).getUTCSeconds()).padStart(2, "0")} UK time`;
  const skew = p.deviceAt ? Math.round((p.deviceAt.getTime() - p.receivedAt.getTime()) / 60_000) : null;
  const where = p.latitude != null ? mapLink({ lat: Number(p.latitude), lng: Number(p.longitude) }) : null;
  const rows: [string, string, Severity?][] = [
    ["Officer", `${p.assignment.person.fullName}${p.assignment.person.employment?.pin ? ` · PIN ${p.assignment.person.employment.pin}` : ""}`],
    ["For", `${p.kind === "book_on" ? "Book-on" : "Check call"} · ${p.assignment.post.name}, ${site.name} (${site.client.name})`],
    ["Received by the server", at(p.receivedAt)],
    ["Phone's own clock", p.deviceAt ? `${at(p.deviceAt)}${skew && Math.abs(skew) >= 5 ? ` — ${Math.abs(skew)} min ${skew > 0 ? "ahead" : "behind"}` : " — agrees"}` : "Not sent", skew && Math.abs(skew) >= 5 ? "warning" : undefined],
    ["Location sent", p.latitude != null ? `${Number(p.latitude).toFixed(5)}, ${Number(p.longitude).toFixed(5)} · ±${p.accuracyMetres} m` : "None", p.latitude == null ? "warning" : undefined],
    ["Distance from the site", p.distanceMetres != null ? `${metres(p.distanceMetres)} (the site's radius is ${site.radiusMetres} m)` : site.latitude == null ? "The site's location is not set" : "—"],
    ["Camera", p.liveCamera ? "Live camera in the portal" : "A photo from the phone's gallery — weaker evidence", p.liveCamera ? undefined : "warning"],
    ["Photo fingerprint (SHA-256)", p.sha256],
  ];

  return (
    <div className="space-y-5">
      <PageHeader title={`Selfie ${p.code}`} description="The record kept when this photo reached the server. If the details stamped on a copy of the photo differ from these, the copy has been changed." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card title="The photo" subtitle="As it arrived, with the stamp the officer's phone put on it.">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/duty/proof/${p.id}`} alt={`Selfie ${p.code}`} className="w-full rounded-md border" style={{ borderColor: "var(--hairline)" }} />
        </Card>
        <Card title="What the server recorded" action={<StatusPill severity={verdict.severity} label={verdict.label} wrap />}>
          <dl className="divide-y text-[13px]" style={{ borderColor: "var(--hairline)" }}>
            {rows.map(([k, v, sev]) => (
              <div key={k} className="grid grid-cols-[11rem_1fr] gap-3 py-2" style={{ borderColor: "var(--hairline)" }}>
                <dt style={{ color: "var(--text-secondary)" }}>{k}</dt>
                <dd className="min-w-0 break-words" style={{ color: sev === "warning" ? "var(--status-serious)" : undefined }}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          {where && (
            <a href={where} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[12px] underline">
              Where the photo was taken, on a map
            </a>
          )}
        </Card>
      </div>
    </div>
  );
}
