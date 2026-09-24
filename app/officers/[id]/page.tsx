import { notFound } from "next/navigation";
import { OfficerProfileView } from "@/components/officers/OfficerProfileView";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { db } from "@/lib/db/client";
import { getOfficerProfile } from "@/lib/db/officer-profile";

export const dynamic = "force-dynamic";

/** One officer, for Control. The person record behind them is HR's. */
export default async function OfficerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const [profile, sites] = await Promise.all([
    getOfficerProfile(id),
    db.site.findMany({ where: { active: true, client: { active: true } }, orderBy: [{ client: { name: "asc" } }, { name: "asc" }], select: { id: true, name: true, client: { select: { name: true } } } }),
  ]);
  if (!profile) notFound();
  return (
    <OfficerProfileView
      p={profile}
      sites={sites.map((s) => ({ id: s.id, name: `${s.name}, ${s.client.name}` }))}
      excludeDenied={deniedReason(session.activeRole, "officer.exclude")}
      hoursDenied={deniedReason(session.activeRole, "officer.hours")}
    />
  );
}
