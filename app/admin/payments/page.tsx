import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { ActionForm } from "@/components/admin/ActionForm";
import { AdminItemList } from "@/components/admin/AdminItemList";
import { adminPerms } from "@/lib/actions/admin-perms";
import { recordPayment } from "@/lib/actions/admin";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { adminCategory, formatPence } from "@/lib/core/admin";
import { getAdminItems, getPaymentSchedule, getSupplierContracts } from "@/lib/db/admin-queries";
import { formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Payments and contracts.
 *
 * The screen is built around the one control that matters here: a payment is
 * approved once, with the contract, and only a variance from the agreed figure
 * asks again. Approving an unchanged rent figure twelve times a year teaches
 * people to approve without looking.
 */
export default async function AdminPaymentsPage() {
  const session = await requireSession();
  const [schedule, contracts, items] = await Promise.all([
    getPaymentSchedule(),
    getSupplierContracts(),
    getAdminItems({ category: "payments", limit: 50 }),
  ]);
  const perms = adminPerms(session.activeRole);
  const payDenied = deniedReason(session.activeRole, "payment.record");
  const category = adminCategory("payments");

  const unpaid = schedule.filter((r) => !r.paidOn);
  const overdue = unpaid.filter((r) => new Date(r.dueOn) < new Date());
  const variances = schedule.filter((r) => r.variancePence !== null && r.variancePence !== 0);
  const monthlyRunRate = schedule
    .filter((r) => r.frequency === "monthly")
    .reduce((s, r) => s + r.agreedPence, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments & contracts"
        description={category.purpose}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Unpaid instalments"
          value={unpaid.length}
          detail={formatPence(unpaid.reduce((s, r) => s + r.duePence, 0))}
        />
        <StatTile
          label="Overdue"
          value={overdue.length}
          detail="Past their due date and unpaid"
          severity={overdue.length > 0 ? "critical" : "good"}
          hero={overdue.length > 0}
        />
        <StatTile
          label="Variances"
          value={variances.length}
          detail="Paid differently from the agreed figure"
          severity={variances.length > 0 ? "warning" : "good"}
        />
        <StatTile
          label="Monthly commitment"
          value={formatPence(monthlyRunRate)}
          detail="Agreed monthly recurring figures"
        />
      </div>

      <Card
        title="The payment schedule"
        subtitle="Recording a payment that differs from the agreed figure raises a variance request automatically. That is the control: nobody has to notice."
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-left">
                <th className="px-1 pb-2 font-medium">What</th>
                <th className="px-1 pb-2 font-medium">Supplier</th>
                <th className="px-1 pb-2 font-medium">Due</th>
                <th className="px-1 pb-2 font-medium">Agreed</th>
                <th className="px-1 pb-2 font-medium">Status</th>
                <th className="px-1 pb-2 font-medium">Record</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((r) => {
                const late = !r.paidOn && new Date(r.dueOn) < new Date();
                return (
                  <tr
                    key={r.instanceId}
                    className="border-t align-top"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    <td className="px-1 py-2.5">
                      <p className="font-medium">{r.label}</p>
                      <p style={{ color: "var(--text-muted)" }}>{r.frequency}</p>
                    </td>
                    <td className="px-1 py-2.5">{r.supplierName}</td>
                    <td className="px-1 py-2.5 whitespace-nowrap">{formatShortDate(r.dueOn)}</td>
                    <td className="px-1 py-2.5 whitespace-nowrap">{formatPence(r.agreedPence)}</td>
                    <td className="px-1 py-2.5">
                      {r.paidOn ? (
                        <div className="flex flex-col gap-1">
                          <StatusPill
                            severity={r.variancePence === 0 ? "good" : "warning"}
                            label={`Paid ${formatPence(r.paidPence ?? 0)}`}
                          />
                          {r.variancePence !== 0 && (
                            <span style={{ color: "var(--text-secondary)" }}>
                              {r.variancePence! > 0 ? "+" : "−"}
                              {formatPence(Math.abs(r.variancePence!))} against agreed
                            </span>
                          )}
                        </div>
                      ) : (
                        <StatusPill
                          severity={late ? "critical" : "warning"}
                          label={late ? "Overdue" : "Due"}
                        />
                      )}
                    </td>
                    <td className="px-1 py-2.5">
                      {!r.paidOn && r.instanceId && (
                        <ActionForm
                          action={recordPayment.bind(null, r.instanceId)}
                          submitLabel="Record paid"
                          denied={payDenied}
                          compact
                          fields={[
                            {
                              name: "amountPounds",
                              label: "Paid £",
                              kind: "number",
                              placeholder: String(r.duePence / 100),
                            },
                            { name: "reference", label: "Ref", placeholder: "Optional" },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
              {schedule.length === 0 && (
                <tr className="border-t" style={{ borderColor: "var(--hairline)" }}>
                  <td colSpan={6} className="px-1 py-6 text-center" style={{ color: "var(--text-secondary)" }}>
                    No recurring payments set up yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Supplier contracts"
        subtitle="Notice periods, not just end dates. A contract that rolls on because nobody gave notice in time costs the same as one nobody read."
      >
        <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {contracts.map((c) => (
            <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium">
                  {c.supplierName} <span style={{ color: "var(--text-muted)" }}>{c.reference}</span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  <span>
                    {formatShortDate(c.startsOn)} — {c.endsOn ? formatShortDate(c.endsOn) : "open-ended"}
                  </span>
                  {c.agreedAmountPence && <Tag>{formatPence(c.agreedAmountPence)}</Tag>}
                  <Tag>{c.noticePeriodDays}d notice</Tag>
                </p>
                {c.noticeByDays !== null && (
                  <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {c.noticeByDays > 0
                      ? `Notice must be given within ${c.noticeByDays} days, or it rolls on.`
                      : `The notice window has passed — this one rolls on unless it is renegotiated.`}
                  </p>
                )}
              </div>
              {c.daysToEnd !== null && (
                <StatusPill
                  severity={
                    c.noticeByDays !== null && c.noticeByDays <= 0
                      ? "critical"
                      : c.daysToEnd <= 60
                        ? "warning"
                        : "good"
                  }
                  label={c.daysToEnd < 0 ? "Ended" : `${c.daysToEnd}d to end`}
                />
              )}
            </li>
          ))}
          {contracts.length === 0 && (
            <li className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
              No supplier contracts recorded.
            </li>
          )}
        </ul>
      </Card>

      <Card title="Payment work" subtitle="Tasks and requests in this category.">
        <AdminItemList items={items} perms={perms} empty="No payment work outstanding." />
      </Card>
    </div>
  );
}
