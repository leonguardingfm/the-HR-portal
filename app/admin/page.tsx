import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { AdminItemList } from "@/components/admin/AdminItemList";
import { RaiseAdminItem } from "@/components/admin/RaiseAdminItem";
import { adminPerms } from "@/lib/actions/admin-perms";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import {
  ADMIN_CATEGORIES,
  ADMIN_DEDUPLICATION,
  ADMIN_REMINDER_RULES,
  DEFAULT_THRESHOLDS,
  PRIORITIES,
  PRIORITY_ORDER,
  ESCALATION_STEPS,
  formatPence,
} from "@/lib/core/admin";
import { getAdminDashboard, getAdminItems, getAdminKpis } from "@/lib/db/admin-queries";
import { ROLE_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

const CATEGORY_HREF: Record<string, string> = {
  payments: "/admin/payments",
  premises: "/admin/premises",
  people_admin: "/admin/people",
  decisions: "/admin/decisions",
  uniform: "/admin/uniform",
  accreditations: "/admin/accreditations",
};

/**
 * The Admin department's own front page.
 *
 * Urgent first, then what is waiting on somebody, then the money and the
 * stock. The KPIs are at the bottom rather than the top on purpose: a
 * department's front page should open on the work, not on its own scorecard.
 */
export default async function AdminPage() {
  const session = await requireSession();
  const [dash, items, kpis] = await Promise.all([
    getAdminDashboard(),
    getAdminItems({ openOnly: true, limit: 12 }),
    getAdminKpis(),
  ]);
  const perms = adminPerms(session.activeRole);

  const urgent = items.filter(
    (i) => i.priority === "P1" || i.priority === "P2" || i.escalation.stage > 0,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin"
        description="Payments, premises, people admin, penalties, uniform stock and accreditations. One workflow over six categories, with an approval chain where a decision costs money or affects a person."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Urgent open"
          value={dash.urgent}
          detail="P1 and P2 items not yet closed"
          severity={dash.urgent > 0 ? "warning" : "good"}
        />
        <StatTile
          label="Overdue"
          value={dash.overdue}
          detail="Past their priority target"
          severity={dash.overdue > 3 ? "critical" : dash.overdue > 0 ? "serious" : "good"}
          hero={dash.overdue > 0}
        />
        <StatTile
          label="Awaiting approval"
          value={dash.awaitingApproval}
          detail="Nothing auto-approves"
          severity={dash.awaitingApproval > 0 ? "warning" : "good"}
          href="/admin/requests"
        />
        <StatTile
          label="Payments due, 14 days"
          value={formatPence(dash.paymentsDuePence)}
          detail={`${dash.paymentsDueCount} instalment${dash.paymentsDueCount === 1 ? "" : "s"}`}
          href="/admin/payments"
        />
        <StatTile
          label="Services due"
          value={dash.servicesDue}
          detail="Assets due a service or inspection"
          severity={dash.servicesDue > 0 ? "warning" : "good"}
          href="/admin/premises"
        />
        <StatTile
          label="Stock at reorder"
          value={dash.lowStockCount}
          detail="Lines at or under their reorder level"
          severity={dash.lowStockCount > 0 ? "warning" : "good"}
          href="/admin/uniform"
        />
      </div>

      <Card
        title="Needs attention now"
        subtitle="Urgent by priority, or past target and escalated. Everything else is in its category."
      >
        <AdminItemList
          items={urgent}
          perms={perms}
          empty="Nothing urgent and nothing past target."
        />
      </Card>

      <Card
        title="Raise something"
        subtitle="A task needs doing; a request needs deciding first. Anyone can raise either — an Admin request that has to be asked for through Admin gets asked for by WhatsApp instead."
      >
        <RaiseAdminItem denied={deniedReason(session.activeRole, "admin_item.raise")} />
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card
          title="The six categories"
          subtitle="Each owns facts nothing else in the platform writes, and reads the rest. Where a row's 'reads' column names something, Admin does not keep its own copy."
        >
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {ADMIN_CATEGORIES.map((c) => (
              <li key={c.id} className="py-2.5">
                <Link
                  href={CATEGORY_HREF[c.id]}
                  className="text-[13px] font-medium underline-offset-2 hover:underline"
                >
                  {c.label}
                </Link>
                <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {c.purpose}
                </p>
                <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Owns {c.owns.length} fact{c.owns.length === 1 ? "" : "s"}; reads {c.reads.length} from elsewhere.
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Priorities and escalation"
          subtitle="Escalation is a multiple of the item's own target, not a fixed clock, so one rule covers a four-hour job and a ten-day one. Nothing here reassigns the work — it puts a second name on it."
        >
          <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[22rem] border-collapse text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-left">
                <th className="pb-2 font-medium">Priority</th>
                <th className="pb-2 font-medium">Target</th>
                <th className="pb-2 font-medium">When to use it</th>
              </tr>
            </thead>
            <tbody>
              {PRIORITY_ORDER.map((p) => (
                <tr key={p} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
                  <td className="py-2 font-medium">{p}</td>
                  <td className="py-2 whitespace-nowrap">
                    {PRIORITIES[p].targetHours < 24
                      ? `${PRIORITIES[p].targetHours} hours`
                      : `${PRIORITIES[p].targetHours / 24} days`}
                  </td>
                  <td className="py-2" style={{ color: "var(--text-secondary)" }}>
                    {PRIORITIES[p].test}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <ol className="mt-4 space-y-1.5">
            {ESCALATION_STEPS.map((s) => (
              <li key={s.atMultiple} className="text-[12px]">
                <span style={{ color: "var(--text-muted)" }}>
                  {s.atMultiple}× target →{" "}
                </span>
                <span className="font-medium">{ROLE_LABELS[s.to]}</span>
                <span style={{ color: "var(--text-secondary)" }}> — {s.note}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card
        title="The Admin department board"
        subtitle="Every figure is a query over the items and the event log — no counter is kept anywhere, which is why no two screens can disagree. Two measures have no watch band at all: they are either fine or not."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {kpis.map(({ kpi, value, verdict, basis }) => (
            <div
              key={kpi.id}
              className="rounded border p-3"
              style={{ borderColor: "var(--hairline)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-[12px] font-medium">{kpi.label}</p>
                <StatusPill severity={verdict} />
              </div>
              <p className="mt-1.5 text-[19px] font-semibold">
                {value === null
                  ? "—"
                  : kpi.unit === "percent"
                    ? `${value}%`
                    : kpi.unit === "pence"
                      ? formatPence(value)
                      : kpi.unit === "ratio"
                        ? `${value}×`
                        : String(value)}
              </p>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                Target{" "}
                {kpi.direction === "higher_is_better" ? "≥" : "≤"}{" "}
                {kpi.unit === "percent"
                  ? `${kpi.target}%`
                  : kpi.unit === "pence"
                    ? formatPence(kpi.target)
                    : kpi.unit === "ratio"
                      ? `${kpi.target}×`
                      : kpi.target}
                {kpi.tolerance === 0 ? " · no tolerance, deliberately" : ` · watch band ${kpi.tolerance}`}
              </p>
              <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                {basis}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card
          title="Automated reminders"
          subtitle="Ten rules, every one of them self-cancelling. The cancel condition is the important column: a reminder that keeps arriving after the thing was done is how people learn to ignore reminders."
        >
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {ADMIN_REMINDER_RULES.map((r) => (
              <li key={r.key} className="py-2.5">
                <p className="text-[12px] font-medium">{r.label}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span style={{ color: "var(--text-secondary)" }}>
                    {r.offsets
                      .map((o) => (o < 0 ? `${Math.abs(o)}d before` : o === 0 ? "on the day" : `${o}d after`))
                      .join(", ")}
                  </span>
                  {r.escalatesTo && <Tag>escalates to {ROLE_LABELS[r.escalatesTo]}</Tag>}
                </p>
                <p className="mt-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Cancels when: {r.cancelsWhen}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Where Admin avoids typing something twice"
          subtitle="Rendered here rather than promised in a document, so the claim can be checked. If a row stops being true, this screen is where it shows."
        >
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {ADMIN_DEDUPLICATION.map((d) => (
              <li key={d.instead} className="py-2.5">
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Instead of: {d.instead}
                </p>
                <p className="mt-0.5 text-[12px] font-medium">{d.the}</p>
                <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                  {d.because}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title="The approval ladder"
        subtitle="A role is a job, not a rank. The Finance Officer sits inside higher management, so the ladder is written in terms of roles — otherwise its top two rungs would be the same person and the second signature would be worth nothing."
      >
        <ul className="space-y-2 text-[12px]">
          <li>
            <span className="font-medium">At or under {formatPence(DEFAULT_THRESHOLDS.lowPence)}</span>{" "}
            — {ROLE_LABELS.admin_manager}, alone.
          </li>
          <li>
            <span className="font-medium">
              Over {formatPence(DEFAULT_THRESHOLDS.lowPence)} to {formatPence(DEFAULT_THRESHOLDS.highPence)}
            </span>{" "}
            — {ROLE_LABELS.finance_officer}.
          </li>
          <li>
            <span className="font-medium">Over {formatPence(DEFAULT_THRESHOLDS.highPence)}</span> —{" "}
            {ROLE_LABELS.finance_officer} <em>plus</em> one other {ROLE_LABELS.top_management} approver.
            Two distinct people, and an approval at this level has to carry its grounds.
          </li>
          <li>
            <span className="font-medium">Anything against an employee</span> — {ROLE_LABELS.recruitment_manager}{" "}
            and {ROLE_LABELS.top_management}, on top of the money rung. They answer different questions.
          </li>
        </ul>
        <p className="mt-3 text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          Three structural rules hold whatever the amount: the requester is never the approver even when
          they hold the role; nobody decides a request about themselves; and one person may satisfy at most
          one rung of a chain. All three are enforced in the database as well as in the application, and
          nothing on the chase ladder ever approves anything — it only puts the request in front of a person.
          The figures above are settings, so changing them is an edit with an event against it rather than a
          release; requests already raised keep the chain they were raised with.
        </p>
      </Card>
    </div>
  );
}
