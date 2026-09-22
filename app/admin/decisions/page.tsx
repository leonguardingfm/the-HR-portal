import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { AdminItemList } from "@/components/admin/AdminItemList";
import { adminPerms } from "@/lib/actions/admin-perms";
import { requireSession } from "@/lib/auth/server";
import { adminCategory, formatPence } from "@/lib/core/admin";
import { getAdminItems, getPenalties, getVouchers } from "@/lib/db/admin-queries";
import { ROLE_LABELS } from "@/lib/labels";
import { formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Penalties and decisions.
 *
 * The category where the approval rules matter most, so they are stated on the
 * screen rather than buried in the workflow: anything charged to a member of
 * staff takes the HR Manager and higher management, plus the money rung on top
 * where there is a value. They are answering different questions, which is why
 * it is two chains and not one.
 */
export default async function AdminDecisionsPage() {
  const session = await requireSession();
  const [penalties, vouchers, items] = await Promise.all([
    getPenalties(),
    getVouchers(),
    getAdminItems({ category: "decisions", limit: 50 }),
  ]);
  const perms = adminPerms(session.activeRole);
  const category = adminCategory("decisions");

  const outstanding = penalties.filter((p) => ["raised", "approved"].includes(p.state));
  const liveVouchers = vouchers.filter((v) => v.state === "issued");
  const expiringVouchers = liveVouchers.filter((v) => v.daysToExpiry <= 30);
  const totalOutstanding =
    outstanding.reduce((s, p) => s + p.amountPence, 0) +
    liveVouchers.reduce((s, v) => s + v.valuePence, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Penalties & decisions" description={category.purpose} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Outstanding value"
          value={formatPence(totalOutstanding)}
          detail="Penalties unrecovered plus vouchers unredeemed"
          severity={totalOutstanding > 100_000 ? "serious" : totalOutstanding > 50_000 ? "warning" : "good"}
          hero={totalOutstanding > 50_000}
        />
        <StatTile label="Penalties open" value={outstanding.length} detail="Raised or approved, not recovered" />
        <StatTile label="Vouchers live" value={liveVouchers.length} detail="Issued and not yet redeemed" />
        <StatTile
          label="Vouchers expiring"
          value={expiringVouchers.length}
          detail="Inside 30 days"
          severity={expiringVouchers.length > 0 ? "warning" : "good"}
        />
      </div>

      <Card
        title="How a decision against an employee is approved"
        subtitle="Stated here because this is where people will look for it."
      >
        <ul className="space-y-1.5 text-[12px]">
          <li>
            <span className="font-medium">Two people, always</span> — {ROLE_LABELS.recruitment_manager} and{" "}
            {ROLE_LABELS.top_management}. The money rung sits on top of that where there is an amount.
          </li>
          <li>
            <span className="font-medium">Never the subject</span> — nobody decides a penalty against
            themselves, refused by the database and not only by the screen.
          </li>
          <li>
            <span className="font-medium">Never the requester</span> — whoever raised it cannot sign it,
            whatever role they hold.
          </li>
          <li>
            <span className="font-medium">A write-off says why</span> — "written off" with no reason is
            the row that turns up in an audit and cannot be explained by anyone still working here.
          </li>
        </ul>
      </Card>

      <Card
        title="Fines and penalties"
        subtitle="What, how much, on what grounds, and whether it was recovered."
      >
        <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {penalties.map((p) => (
            <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                  <span style={{ color: "var(--text-muted)" }}>{p.reference}</span>
                  {p.personName}
                  <Tag>{formatPence(p.amountPence)}</Tag>
                  <Tag>{p.kind}</Tag>
                </p>
                <p className="mt-1 text-[12px] leading-snug">{p.grounds}</p>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Raised {formatShortDate(p.raisedAt)}
                  {p.writtenOffReason ? ` · written off: ${p.writtenOffReason}` : ""}
                </p>
              </div>
              <StatusPill
                severity={
                  p.state === "recovered"
                    ? "good"
                    : p.state === "rejected"
                      ? "neutral"
                      : p.state === "written_off"
                        ? "warning"
                        : "serious"
                }
                label={p.state.replace(/_/g, " ")}
              />
            </li>
          ))}
          {penalties.length === 0 && (
            <li className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
              No penalties recorded.
            </li>
          )}
        </ul>
      </Card>

      <Card
        title="Vouchers"
        subtitle="The same decision record with a value and a redemption date. An unredeemed voucher is a liability, so it counts towards the outstanding figure above."
      >
        <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {vouchers.map((v) => (
            <li key={v.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                  <span style={{ color: "var(--text-muted)" }}>{v.reference}</span>
                  {v.personName ?? "External recipient"}
                  <Tag>{formatPence(v.valuePence)}</Tag>
                </p>
                <p className="mt-0.5 text-[12px]">{v.purpose}</p>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Issued {formatShortDate(v.issuedOn)} · expires {formatShortDate(v.expiresOn)}
                </p>
              </div>
              <StatusPill
                severity={
                  v.state === "redeemed"
                    ? "good"
                    : v.state === "cancelled"
                      ? "neutral"
                      : v.state === "expired"
                        ? "serious"
                        : v.daysToExpiry <= 30
                          ? "warning"
                          : "good"
                }
                label={
                  v.state === "issued"
                    ? v.daysToExpiry < 0
                      ? "past expiry"
                      : `${v.daysToExpiry}d to expiry`
                    : v.state
                }
              />
            </li>
          ))}
          {vouchers.length === 0 && (
            <li className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
              No vouchers issued.
            </li>
          )}
        </ul>
      </Card>

      <Card title="Decision work" subtitle="Tasks and requests in this category.">
        <AdminItemList items={items} perms={perms} empty="No decision work outstanding." />
      </Card>
    </div>
  );
}
