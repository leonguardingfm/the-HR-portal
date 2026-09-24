import { PlacesBoard, type PlaceClient } from "@/components/places/PlacesBoard";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * Clients, their sites and the posts on them — entered and kept here by
 * Control (25 September 2026). Everything the rota and the duty checks run on
 * starts here: a post's check-call rule, its signal, its phone and its
 * instructions, and the site's location that officers' selfies are checked
 * against.
 */
export default async function ClientsPage() {
  const session = await requireSession();
  const now = new Date();
  const [clients, ahead] = await Promise.all([
    db.client.findMany({
      orderBy: { name: "asc" },
      include: {
        sites: {
          orderBy: { name: "asc" },
          include: {
            posts: { orderBy: { name: "asc" }, include: { regularPerson: { select: { fullName: true } } } },
          },
        },
      },
    }),
    db.assignment.groupBy({ by: ["postId"], where: { state: { not: "cancelled" }, endsAt: { gt: now } }, _count: { _all: true } }),
  ]);
  const aheadOf = new Map(ahead.map((a) => [a.postId, a._count._all]));

  const rows: PlaceClient[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    screeningPeriodYears: c.screeningPeriodYears,
    requiresAdditionalInterview: c.requiresAdditionalInterview,
    regulatedActivity: c.regulatedActivity,
    contractStart: c.contractStart?.toISOString().slice(0, 10) ?? null,
    contractEnd: c.contractEnd?.toISOString().slice(0, 10) ?? null,
    active: c.active,
    sites: c.sites.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      clientRef: s.clientRef,
      checkCallInstruction: s.checkCallInstruction,
      contactName: s.contactName,
      contactPhone: s.contactPhone,
      location: s.latitude == null ? null : { lat: Number(s.latitude), lng: Number(s.longitude) },
      radiusMetres: s.radiusMetres,
      active: s.active,
      posts: s.posts.map((p) => ({
        id: p.id,
        name: p.name,
        pattern: p.pattern,
        requiresSiaLicence: p.requiresSiaLicence,
        screeningPeriodYears: p.screeningPeriodYears,
        checkCalls: p.checkCalls,
        loneWorking: p.loneWorking,
        mobileSignal: p.mobileSignal,
        phone: p.phone,
        instructions: p.instructions,
        active: p.active,
        regular: p.regularPerson?.fullName ?? null,
        shiftsAhead: aheadOf.get(p.id) ?? 0,
      })),
    })),
  }));

  return <PlacesBoard clients={rows} denied={deniedReason(session.activeRole, "place.manage")} />;
}
