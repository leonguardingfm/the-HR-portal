import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { Tag } from "@/components/ui/StatusPill";
import { requireSession } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Requirements still being worked, as opposed to filled or cancelled. */
const OPEN = ["received", "pool_check", "covered_internally", "released_to_sourcing", "allocated"] as const;

/**
 * The Sales front page.
 *
 * Read-only by design: Sales sees the client book and what each client has
 * asked us to cover, and changes none of it. The requirement itself belongs to
 * Control, who raised it.
 */
export default async function SalesPage() {
  await requireSession();
  const now = new Date();
  const soon = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const clients = await db.client.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { sites: true } },
      requirements: {
        where: { status: { in: [...OPEN] } },
        select: { headcountRequired: true, startDate: true },
      },
    },
  });

  const active = clients.filter((c) => c.active);
  const openReqs = clients.reduce((n, c) => n + c.requirements.length, 0);
  const headcount = clients.reduce(
    (n, c) => n + c.requirements.reduce((m, r) => m + r.headcountRequired, 0),
    0,
  );
  const renewing = active.filter((c) => c.contractEnd && c.contractEnd <= soon).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sales overview"
        description="Every client, their sites, and the cover they have asked for that is not yet filled. Read-only: requirements are raised and worked by Control."
        action={
          <Link
            href="/requirements"
            className="rounded-md border px-3 py-1.5 text-[12px] font-medium"
            style={{ background: "var(--surface-1)" }}
          >
            All requirements
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active clients" value={active.length} detail={`${clients.length} on record`} />
        <StatTile label="Open requirements" value={openReqs} detail="Received, not yet filled" />
        <StatTile label="Officers requested" value={headcount} detail="Across open requirements" />
        <StatTile
          label="Contracts ending"
          value={renewing}
          detail="Within 90 days"
          severity={renewing > 0 ? "warning" : "neutral"}
        />
      </div>

      <Card title="Clients" subtitle="Sorted by name.">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                {["Client", "Sites", "Open requirements", "Next start", "Contract ends", ""].map((h) => (
                  <th key={h} className="border-b px-5 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const next = c.requirements
                  .map((r) => r.startDate)
                  .sort((a, b) => a.getTime() - b.getTime())[0];
                return (
                  <tr key={c.id}>
                    <td className="border-b px-5 py-2.5 font-medium">{c.name}</td>
                    <td className="tnum border-b px-5 py-2.5">{c._count.sites}</td>
                    <td className="tnum border-b px-5 py-2.5">{c.requirements.length}</td>
                    <td className="tnum border-b px-5 py-2.5">{next ? formatDate(next) : "—"}</td>
                    <td className="tnum border-b px-5 py-2.5">
                      {c.contractEnd ? formatDate(c.contractEnd) : "—"}
                    </td>
                    <td className="border-b px-5 py-2.5 text-right">
                      <span className="inline-flex gap-1">
                        {!c.active && <Tag>Inactive</Tag>}
                        {c.regulatedActivity && <Tag>Regulated activity</Tag>}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center" style={{ color: "var(--text-muted)" }}>
                    No clients on record yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
