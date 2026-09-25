import { Card } from "@/components/ui/Card";
import { CappedNotice } from "@/components/ui/Pager";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { ActionForm } from "@/components/admin/ActionForm";
import { AdminItemList } from "@/components/admin/AdminItemList";
import { adminPerms } from "@/lib/actions/admin-perms";
import { decideHoliday } from "@/lib/actions/admin";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { adminCategory } from "@/lib/core/admin";
import {
  getAdminItems,
  getAuthorityMatters,
  getHolidayRequests,
  getSuspensions,
  adminListTotals,
} from "@/lib/db/admin-queries";
import { formatShortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const BODY_LABELS: Record<string, string> = {
  dwp: "DWP",
  hmrc: "HMRC",
  home_office: "Home Office",
  tribunal: "Tribunal",
  local_authority: "Local authority",
  sia: "SIA",
  other: "Other",
};

/**
 * People admin.
 *
 * Holiday, external authority matters and suspensions. Two things here are
 * worth knowing:
 *
 *  - Entitlement is in HOURS. A shift is eight hours or twelve depending on the
 *    post, so a day of leave is not a fixed quantity, and holding days and
 *    converting later is how a balance ends up wrong by a shift and a half.
 *  - The cover check is a query against the rota, not a phone call to Control,
 *    and the count is stored on the decision as the evidence that cover was
 *    considered.
 *
 * The Finance Officer cannot reach this screen at all. Approving spend does not
 * come with access to somebody's leave or their suspension file.
 */
export default async function AdminPeoplePage() {
  const session = await requireSession();
  const [holidays, matters, suspensions, items, totals] = await Promise.all([
    getHolidayRequests(),
    getAuthorityMatters(),
    getSuspensions(),
    getAdminItems({ category: "people_admin", limit: 50 }),
    adminListTotals(),
  ]);
  const perms = adminPerms(session.activeRole);
  const holidayDenied = deniedReason(session.activeRole, "holiday.decide");
  const category = adminCategory("people_admin");

  const pending = holidays.filter((h) => h.decision === "pending");
  const stale = pending.filter((h) => h.daysWaiting > 5);
  const openMatters = matters.filter((m) => m.state !== "closed");
  const openEnded = suspensions.filter((s) => s.openEnded);

  return (
    <div className="space-y-5">
      <PageHeader title="People admin" description={category.purpose} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Holiday awaiting a decision"
          value={pending.length}
          detail={`${stale.length} waiting over five days`}
          severity={stale.length > 0 ? "serious" : pending.length > 0 ? "warning" : "good"}
          hero={stale.length > 0}
        />
        <StatTile
          label="Authority matters open"
          value={openMatters.length}
          detail="Correspondence not yet closed"
          severity={openMatters.some((m) => (m.daysToDue ?? 99) < 0) ? "critical" : openMatters.length > 0 ? "warning" : "good"}
        />
        <StatTile
          label="Suspensions live"
          value={suspensions.filter((s) => !s.liftedOn).length}
          detail="A suspended officer cannot be rostered"
        />
        <StatTile
          label="Open-ended suspensions"
          value={openEnded.length}
          detail="No end date and not lifted — the ones that get forgotten"
          severity={openEnded.length > 0 ? "serious" : "good"}
        />
      </div>

      <Card
        title="Holiday requests"
        subtitle="Officers ask from their portal. While a request waits, the rota warns anyone putting them on those days; approving takes them off any shifts they were already on — those go on Control's cover list — and tells the officer. The shift count is stored with the decision as the evidence that cover was considered."
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-left">
                <th className="px-1 pb-2 font-medium">Who</th>
                <th className="px-1 pb-2 font-medium">Dates</th>
                <th className="px-1 pb-2 font-medium">Hours</th>
                <th className="px-1 pb-2 font-medium">Balance</th>
                <th className="px-1 pb-2 font-medium">Cover</th>
                <th className="px-1 pb-2 font-medium">Decision</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
                  <td className="px-1 py-2.5">
                    <p className="font-medium">{h.personName}</p>
                    {h.decision === "pending" && (
                      <p style={{ color: h.daysWaiting > 5 ? "var(--status-serious)" : "var(--text-muted)" }}>
                        waiting {h.daysWaiting}d
                      </p>
                    )}
                  </td>
                  <td className="px-1 py-2.5 whitespace-nowrap">
                    {formatShortDate(h.startsOn)} — {formatShortDate(h.lastDay)}
                  </td>
                  <td className="px-1 py-2.5 whitespace-nowrap">{h.hoursRequested}h</td>
                  <td className="px-1 py-2.5 whitespace-nowrap">
                    {h.entitlementHours === null ? (
                      <span style={{ color: "var(--text-muted)" }}>No entitlement set</span>
                    ) : (
                      <>
                        {h.entitlementHours - (h.takenHours ?? 0)}h of {h.entitlementHours}h
                        <p style={{ color: "var(--text-muted)" }}>
                          {h.takenHours ?? 0}h approved so far
                        </p>
                      </>
                    )}
                  </td>
                  <td className="px-1 py-2.5">
                    {h.shiftsAffected === null ? (
                      <span style={{ color: "var(--text-muted)" }}>Checked on decision</span>
                    ) : h.shiftsAffected === 0 ? (
                      <StatusPill severity="good" label="No shifts" />
                    ) : (
                      <StatusPill severity="warning" label={`${h.shiftsAffected} rostered`} />
                    )}
                  </td>
                  <td className="px-1 py-2.5">
                    {h.decision === "pending" ? (
                      <ActionForm
                        action={decideHoliday.bind(null, h.id)}
                        submitLabel="Decide"
                        denied={holidayDenied}
                        compact
                        fields={[
                          {
                            name: "verdict",
                            label: "Verdict",
                            kind: "select",
                            options: [
                              { value: "approved", label: "Approve" },
                              { value: "rejected", label: "Reject" },
                            ],
                          },
                          { name: "note", label: "Note", placeholder: "Required if refused" },
                        ]}
                      />
                    ) : (
                      <div className="flex flex-col gap-1">
                        <StatusPill
                          severity={h.decision === "approved" ? "good" : h.decision === "cancelled" ? "neutral" : "critical"}
                          label={h.decision}
                        />
                        {h.note && (
                          <span style={{ color: "var(--text-secondary)" }}>{h.note}</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {holidays.length === 0 && (
                <tr className="border-t" style={{ borderColor: "var(--hairline)" }}>
                  <td colSpan={6} className="px-1 py-6 text-center" style={{ color: "var(--text-secondary)" }}>
                    No holiday requests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <CappedNotice shown={holidays.length} total={totals.holidays} hint="The oldest decided requests are not listed; every one is in the audit log." />
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card
          title="External authority matters"
          subtitle="DWP, HMRC, Home Office, tribunals. The body is a fixed list; the kind of enquiry is free text, so an enquiry we have not seen before is data rather than a migration."
        >
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {matters.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">
                    {BODY_LABELS[m.body] ?? m.body} — {m.matterType}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    <span>{m.reference}</span>
                    {m.personName && <Tag>{m.personName}</Tag>}
                    <span>received {formatShortDate(m.receivedOn)}</span>
                    {m.dueOn && <span>due {formatShortDate(m.dueOn)}</span>}
                  </p>
                  <p className="mt-1 text-[12px] leading-snug">{m.summary}</p>
                </div>
                <StatusPill
                  severity={
                    m.state === "closed"
                      ? "neutral"
                      : m.daysToDue !== null && m.daysToDue < 0
                        ? "critical"
                        : m.daysToDue !== null && m.daysToDue <= 7
                          ? "warning"
                          : "good"
                  }
                  label={
                    m.state === "closed"
                      ? "closed"
                      : m.daysToDue === null
                        ? m.state.replace(/_/g, " ")
                        : m.daysToDue < 0
                          ? `${Math.abs(m.daysToDue)}d overdue`
                          : `${m.daysToDue}d left`
                  }
                />
              </li>
            ))}
            {matters.length === 0 && (
              <li className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
                No authority matters recorded.
              </li>
            )}
          </ul>
          <CappedNotice shown={matters.length} total={totals.matters} hint="The oldest closed matters are not listed; every one is in the audit log." />
          <p className="mt-3 text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            Correspondence leaving the company is a request, not a task: it is signed off by the HR
            Manager or higher management before it is sent, and the Finance Officer holds no part in it.
          </p>
        </Card>

        <Card
          title="Suspensions"
          subtitle="A live suspension blocks the officer from being published to the rota — the rota reads this, it does not keep its own copy."
        >
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {suspensions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{s.personName}</p>
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    From {formatShortDate(s.startsOn)}
                    {s.endsOn ? ` to ${formatShortDate(s.endsOn)}` : " — open-ended"}
                    {s.liftedOn ? `, lifted ${formatShortDate(s.liftedOn)}` : ""} ·{" "}
                    {s.paid ? "paid" : "unpaid"}
                  </p>
                  <p className="mt-1 text-[12px]">{s.reason}</p>
                </div>
                <StatusPill
                  severity={s.liftedOn ? "neutral" : s.openEnded ? "serious" : "warning"}
                  label={s.liftedOn ? "lifted" : s.openEnded ? "open-ended" : "live"}
                />
              </li>
            ))}
            {suspensions.length === 0 && (
              <li className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
                No suspensions recorded.
              </li>
            )}
          </ul>
          <CappedNotice shown={suspensions.length} total={totals.suspensions} hint="The oldest suspensions are not listed; every one is in the audit log." />
        </Card>
      </div>

      <Card title="People admin work" subtitle="Tasks and requests in this category.">
        <AdminItemList items={items} perms={perms} empty="No people admin work outstanding." />
      </Card>
    </div>
  );
}
