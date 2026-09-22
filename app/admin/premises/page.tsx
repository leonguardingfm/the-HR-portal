import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { ActionForm } from "@/components/admin/ActionForm";
import { AdminItemList } from "@/components/admin/AdminItemList";
import { adminPerms } from "@/lib/actions/admin-perms";
import { recordMaintenance } from "@/lib/actions/admin";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { adminCategory, formatPence } from "@/lib/core/admin";
import { getAdminItems, getAssets } from "@/lib/db/admin-queries";
import { formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Premises and equipment.
 *
 * Office assets, deliberately a different register from the kit officers are
 * issued: a boiler and a pair of gloves need different questions asked of them.
 * Recording a service moves the next-due date on from the interval, which is
 * what cancels the reminder ladder rather than needing a second edit.
 */
export default async function AdminPremisesPage() {
  const session = await requireSession();
  const [assets, items] = await Promise.all([
    getAssets(),
    getAdminItems({ category: "premises", limit: 50 }),
  ]);
  const perms = adminPerms(session.activeRole);
  const maintainDenied = deniedReason(session.activeRole, "asset.maintain");
  const category = adminCategory("premises");

  const dueSoon = assets.filter((a) => a.daysToService !== null && a.daysToService <= 14);
  const overdue = assets.filter((a) => a.daysToService !== null && a.daysToService < 0);
  const faults = assets.filter((a) => a.openFaults > 0);
  const value = assets.reduce((s, a) => s + (a.purchaseCostPence ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Premises & equipment" description={category.purpose} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Assets on the register" value={assets.length} detail={`${formatPence(value)} at purchase`} />
        <StatTile
          label="Service due, 14 days"
          value={dueSoon.length}
          detail="Watched by the shared expiry engine"
          severity={dueSoon.length > 0 ? "warning" : "good"}
        />
        <StatTile
          label="Service overdue"
          value={overdue.length}
          detail="Past their next-due date"
          severity={overdue.length > 0 ? "critical" : "good"}
          hero={overdue.length > 0}
        />
        <StatTile
          label="Open faults"
          value={faults.length}
          detail="Reported and not yet closed"
          severity={faults.length > 0 ? "serious" : "good"}
        />
      </div>

      <Card
        title="The asset register"
        subtitle="Recording a service moves the next-due date on from the interval, so the reminder ladder cancels itself. A repair on an out-of-service asset also puts it back in service."
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-left">
                <th className="px-1 pb-2 font-medium">Asset</th>
                <th className="px-1 pb-2 font-medium">Where</th>
                <th className="px-1 pb-2 font-medium">Next service</th>
                <th className="px-1 pb-2 font-medium">Condition</th>
                <th className="px-1 pb-2 font-medium">Last job</th>
                <th className="px-1 pb-2 font-medium">Record work</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
                  <td className="px-1 py-2.5">
                    <p className="font-medium">{a.label}</p>
                    <p style={{ color: "var(--text-muted)" }}>
                      {a.tag} · {a.category}
                    </p>
                  </td>
                  <td className="px-1 py-2.5">{a.location}</td>
                  <td className="px-1 py-2.5 whitespace-nowrap">
                    {a.nextServiceOn ? (
                      <div className="flex flex-col gap-1">
                        <span>{formatShortDate(a.nextServiceOn)}</span>
                        <StatusPill
                          severity={
                            a.daysToService === null
                              ? "neutral"
                              : a.daysToService < 0
                                ? "critical"
                                : a.daysToService <= 14
                                  ? "warning"
                                  : "good"
                          }
                          label={
                            a.daysToService === null
                              ? "—"
                              : a.daysToService < 0
                                ? `${Math.abs(a.daysToService)}d overdue`
                                : `in ${a.daysToService}d`
                          }
                        />
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>No schedule</span>
                    )}
                  </td>
                  <td className="px-1 py-2.5">
                    <StatusPill
                      severity={
                        a.condition === "in_service"
                          ? "good"
                          : a.condition === "needs_attention"
                            ? "warning"
                            : a.condition === "out_of_service"
                              ? "critical"
                              : "neutral"
                      }
                      label={a.condition.replace(/_/g, " ")}
                    />
                  </td>
                  <td className="px-1 py-2.5">
                    {a.lastJob ? (
                      <div>
                        <p>{a.lastJob.description}</p>
                        <p style={{ color: "var(--text-muted)" }}>
                          {a.lastJob.kind} · {formatShortDate(a.lastJob.at)}
                          {!a.lastJob.done && " · open"}
                        </p>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>Nothing recorded</span>
                    )}
                  </td>
                  <td className="px-1 py-2.5">
                    <ActionForm
                      action={recordMaintenance.bind(null, a.id)}
                      submitLabel="Record"
                      denied={maintainDenied}
                      compact
                      fields={[
                        {
                          name: "kind",
                          label: "Kind",
                          kind: "select",
                          options: [
                            { value: "service", label: "Service" },
                            { value: "repair", label: "Repair" },
                            { value: "inspection", label: "Inspection" },
                            { value: "replacement", label: "Replacement" },
                          ],
                        },
                        { name: "description", label: "What was done", required: true },
                        { name: "costPounds", label: "Cost £", kind: "number" },
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {assets.length === 0 && (
                <tr className="border-t" style={{ borderColor: "var(--hairline)" }}>
                  <td colSpan={6} className="px-1 py-6 text-center" style={{ color: "var(--text-secondary)" }}>
                    Nothing on the asset register yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Premises work" subtitle="Tasks and requests in this category.">
        <AdminItemList items={items} perms={perms} empty="No premises work outstanding." />
      </Card>

      <Card
        title="What this register does not hold"
        subtitle="Kept explicit, because the overlap with officer kit is the obvious place for a duplicate to appear."
      >
        <ul className="space-y-1.5 text-[12px]">
          {category.reads.map((r) => (
            <li key={r} style={{ color: "var(--text-secondary)" }}>
              <Tag>reads</Tag> {r}
            </li>
          ))}
          <li style={{ color: "var(--text-secondary)" }}>
            <Tag>elsewhere</Tag> Uniform, radios, keys and PPE issued to officers — those are
            Uniform &amp; stock, against the person, not the office.
          </li>
        </ul>
      </Card>
    </div>
  );
}
