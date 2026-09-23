import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { ActionForm } from "@/components/admin/ActionForm";
import { AdminItemList } from "@/components/admin/AdminItemList";
import { adminPerms } from "@/lib/actions/admin-perms";
import { moveStock } from "@/lib/actions/admin";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { adminCategory } from "@/lib/core/admin";
import { getAdminItems, getOutstandingReturns, getStock } from "@/lib/db/admin-queries";
import { formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Uniform and stock.
 *
 * There is no stored quantity anywhere. On hand is the sum of the movements,
 * which is the same rule that keeps every KPI honest: a total that is stored is
 * a total that can drift from what it claims to summarise.
 *
 * Outstanding returns come from the equipment records and the leaver date on
 * the person — not from a list Admin keeps. The whole point is that this cannot
 * be out of date.
 */
export default async function AdminUniformPage() {
  const session = await requireSession();
  const [stock, returns, items] = await Promise.all([
    getStock(),
    getOutstandingReturns(),
    getAdminItems({ category: "uniform", limit: 50 }),
  ]);
  const perms = adminPerms(session.activeRole);
  const moveDenied = deniedReason(session.activeRole, "stock.move");
  const category = adminCategory("uniform");

  const low = stock.filter((s) => s.belowReorder);
  const totalOnHand = stock.reduce((s, r) => s + r.onHand, 0);
  const chased = returns.filter((r) => (r.daysSinceLeaving ?? 0) > 30);

  return (
    <div className="space-y-5">
      <PageHeader title="Uniform & stock" description={category.purpose} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Items on hand" value={totalOnHand} detail={`Across ${stock.length} lines`} />
        <StatTile
          label="At or under reorder"
          value={low.length}
          detail="Lines to order"
          severity={low.length > 0 ? "warning" : "good"}
          hero={low.length > 0}
        />
        <StatTile
          label="Outstanding from leavers"
          value={returns.length}
          detail="Returnable kit not back or written off"
          severity={returns.length > 5 ? "serious" : returns.length > 0 ? "warning" : "good"}
        />
        <StatTile
          label="Over 30 days out"
          value={chased.length}
          detail="Past the point the chaser ladder ends"
          severity={chased.length > 0 ? "critical" : "good"}
        />
      </div>

      <Card
        title="Stock on hand"
        subtitle="The sign on a movement is derived from its kind, never typed, and the database checks it again — a return that reduced stock would be silently wrong."
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-left">
                <th className="px-1 pb-2 font-medium">Item</th>
                <th className="px-1 pb-2 font-medium">Size</th>
                <th className="px-1 pb-2 font-medium">On hand</th>
                <th className="px-1 pb-2 font-medium">Reorder at</th>
                <th className="px-1 pb-2 font-medium">Move stock</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.id} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
                  <td className="px-1 py-2.5">
                    <p className="font-medium">{s.label}</p>
                    {s.location && <p style={{ color: "var(--text-muted)" }}>{s.location}</p>}
                  </td>
                  <td className="px-1 py-2.5">{s.size ?? "—"}</td>
                  <td className="px-1 py-2.5">
                    <StatusPill
                      severity={s.onHand === 0 ? "critical" : s.belowReorder ? "warning" : "good"}
                      label={String(s.onHand)}
                    />
                  </td>
                  <td className="px-1 py-2.5">{s.reorderLevel}</td>
                  <td className="px-1 py-2.5">
                    <ActionForm
                      action={moveStock.bind(null, s.id)}
                      submitLabel="Record"
                      denied={moveDenied}
                      compact
                      fields={[
                        {
                          name: "kind",
                          label: "Kind",
                          kind: "select",
                          options: [
                            { value: "received", label: "Received" },
                            { value: "issued", label: "Issued" },
                            { value: "returned", label: "Returned" },
                            { value: "written_off", label: "Written off" },
                            { value: "adjustment", label: "Adjustment" },
                          ],
                        },
                        { name: "quantity", label: "How many", kind: "number", required: true },
                        { name: "note", label: "Note" },
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {stock.length === 0 && (
                <tr className="border-t" style={{ borderColor: "var(--hairline)" }}>
                  <td colSpan={5} className="px-1 py-6 text-center" style={{ color: "var(--text-secondary)" }}>
                    No stock lines set up yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Outstanding from leavers"
        subtitle="Derived from the equipment records and the leaver date, so it cannot be a stale list. An outstanding return on a leaver is a site problem before it is an HR one."
      >
        <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {returns.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{r.personName}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  <span>
                    {r.quantity} × {r.itemLabel}
                    {r.size ? ` (${r.size})` : ""}
                  </span>
                  <Tag>issued {formatShortDate(r.issuedAt)}</Tag>
                  {r.leftOn && <Tag>left {formatShortDate(r.leftOn)}</Tag>}
                </p>
              </div>
              <StatusPill
                severity={
                  (r.daysSinceLeaving ?? 0) > 30
                    ? "critical"
                    : (r.daysSinceLeaving ?? 0) > 14
                      ? "serious"
                      : "warning"
                }
                label={`${r.daysSinceLeaving ?? 0}d since leaving`}
              />
            </li>
          ))}
          {returns.length === 0 && (
            <li className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Nothing outstanding from anyone who has left.
            </li>
          )}
        </ul>
      </Card>

      <Card title="Uniform work" subtitle="Tasks and requests in this category.">
        <AdminItemList items={items} perms={perms} empty="No uniform work outstanding." />
      </Card>

      <Card
        title="What this screen does not own"
        subtitle="Stock is Admin's. Who holds what was already modelled against the person, and stays there."
      >
        <ul className="space-y-1.5 text-[12px]">
          {category.reads.map((r) => (
            <li key={r} style={{ color: "var(--text-secondary)" }}>
              <Tag>reads</Tag> {r}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
