import Link from "next/link";
import { ApproveAccount } from "@/components/admin/ApproveAccount";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { ActionButton } from "@/components/ui/ActionButton";
import {
  ACCOUNT_STATUS_LABELS,
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  departmentSpec,
  type AccountDepartment,
  type AccountStatus,
} from "@/lib/accounts";
import { reactivateAccount, rejectAccount, suspendAccount } from "@/lib/actions/accounts";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { db } from "@/lib/db/client";
import { formatDate } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/labels";
import { isScreeningRole } from "@/lib/roles";
import type { Role, Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_SEVERITY: Record<AccountStatus, Severity> = {
  active: "good",
  pending: "warning",
  suspended: "critical",
  rejected: "neutral",
};

const STATUSES = Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatus[];

/**
 * Users and registrations.
 *
 * Everyone who can sign in, how many are in each department, and the
 * registrations waiting for a decision. Pending comes first because it is the
 * only part of this page that is somebody's work.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string; status?: string; q?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const deptFilter = departmentSpec(sp.department ?? "")?.id;
  const statusFilter = STATUSES.includes(sp.status as AccountStatus)
    ? (sp.status as AccountStatus)
    : undefined;
  const q = (sp.q ?? "").trim();

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { roles: { where: { revokedAt: null } } },
  });
  const denied = deniedReason(session.activeRole, "account.review");

  const counts = {
    total: users.length,
    active: users.filter((u) => u.status === "active").length,
    pending: users.filter((u) => u.status === "pending").length,
    suspended: users.filter((u) => u.status === "suspended").length,
  };
  const byDept = DEPARTMENTS.map((d) => ({
    ...d,
    count: users.filter((u) => u.department === d.id).length,
    active: users.filter((u) => u.department === d.id && u.status === "active").length,
  }));
  const noDept = users.filter((u) => !u.department).length;
  const maxDept = Math.max(1, ...byDept.map((d) => d.count), noDept);

  const pending = users.filter((u) => u.status === "pending");
  const needle = q.toLowerCase();
  const listed = users.filter(
    (u) =>
      (!deptFilter || u.department === deptFilter) &&
      (!statusFilter || u.status === statusFilter) &&
      (!needle ||
        u.displayName.toLowerCase().includes(needle) ||
        (u.username ?? "").includes(needle) ||
        (u.email ?? "").includes(needle)),
  );

  const filterHref = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { department: deptFilter, status: statusFilter, q: q || undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `/admin/users?${s}` : "/admin/users";
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users & registrations"
        description="Every registered account, how many are in each department, and the registrations waiting for a decision. Administration and HR – Vetting registrations wait here until approved."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Registered users" value={counts.total} detail="Every account, any status" />
        <StatTile
          label="Active"
          value={counts.active}
          detail="Can sign in now"
          href={filterHref({ status: "active" })}
        />
        <StatTile
          label="Pending approval"
          value={counts.pending}
          detail="Waiting for a decision"
          severity={counts.pending > 0 ? "warning" : "good"}
          hero={counts.pending > 0}
          href={filterHref({ status: "pending" })}
        />
        <StatTile
          label="Suspended"
          value={counts.suspended}
          detail="Cannot sign in"
          href={filterHref({ status: "suspended" })}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card title="By department" subtitle="Accounts registered to each department. Select one to filter the list.">
          <ul className="space-y-2.5">
            {byDept.map((d) => (
              <li key={d.id}>
                <Link
                  href={filterHref({ department: deptFilter === d.id ? undefined : d.id })}
                  className="group block rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-[var(--wash)]"
                  aria-current={deptFilter === d.id ? "true" : undefined}
                  style={deptFilter === d.id ? { background: "var(--wash)" } : undefined}
                >
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="font-medium">{d.label}</span>
                    <span className="tnum" style={{ color: "var(--text-secondary)" }}>
                      {d.count} {d.count === 1 ? "user" : "users"}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full"
                    style={{ background: "var(--gridline)" }}
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(d.count / maxDept) * 100}%`, background: "var(--series-1)" }}
                    />
                  </div>
                  <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {d.active} active · signs in as {ROLE_LABELS[d.role]}
                  </p>
                </Link>
              </li>
            ))}
            {noDept > 0 && (
              <li className="pt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                {noDept} {noDept === 1 ? "account was" : "accounts were"} set up before
                registration existed and {noDept === 1 ? "has" : "have"} no department.
              </li>
            )}
          </ul>
        </Card>

        <Card
          title="Pending approval"
          subtitle={
            pending.length === 0
              ? "Nothing waiting."
              : `${pending.length} registration${pending.length === 1 ? "" : "s"} waiting for a decision, newest first.`
          }
        >
          {pending.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              New Administration and HR – Vetting registrations appear here.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
              {pending.map((u) => {
                const dept = u.department ? departmentSpec(u.department) : undefined;
                return (
                  <li key={u.id} className="flex flex-col gap-3 py-3 first:pt-0 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">{u.displayName}</p>
                      <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                        {u.username} · {u.email}
                      </p>
                      <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {dept?.label ?? "No department"} · registered {formatDate(u.createdAt)}
                      </p>
                      {dept?.needsApproval && (
                        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {dept.needsApproval}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-start gap-2 sm:max-w-[16rem] sm:flex-col sm:items-end">
                      <ApproveAccount
                        userId={u.id}
                        screening={dept ? isScreeningRole(dept.role) : false}
                        denied={denied}
                      />
                      <ActionButton action={rejectAccount} label="Reject" fields={{ userId: u.id }} denied={denied} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="All users"
        subtitle={`${listed.length} of ${users.length} shown${deptFilter ? ` · ${DEPARTMENT_LABELS[deptFilter]}` : ""}${statusFilter ? ` · ${ACCOUNT_STATUS_LABELS[statusFilter]}` : ""}`}
        action={
          <form className="flex flex-wrap items-center gap-2" action="/admin/users">
            {deptFilter && <input type="hidden" name="department" value={deptFilter} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search name, username, email"
              aria-label="Search users"
              className="h-8 w-56 max-w-full rounded-md border px-2.5 text-[12px]"
              style={{ background: "var(--page)", color: "var(--text-primary)" }}
            />
            <select
              name="status"
              defaultValue={statusFilter ?? ""}
              aria-label="Status"
              className="h-8 rounded-md border px-2 text-[12px]"
              style={{ background: "var(--page)", color: "var(--text-primary)" }}
            >
              <option value="">Any status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ACCOUNT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-8 rounded-md border px-3 text-[12px] font-medium"
              style={{ background: "var(--surface-1)" }}
            >
              Filter
            </button>
            {(deptFilter || statusFilter || q) && (
              <Link href="/admin/users" className="text-[12px]" style={{ color: "var(--accent-text)" }}>
                Clear
              </Link>
            )}
          </form>
        }
      >
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                {["Name", "Username / email", "Department", "Role", "Registered", "Status", ""].map((h) => (
                  <th key={h} className="border-b px-5 py-2 font-medium first:pl-5" style={{ borderColor: "var(--hairline)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listed.map((u) => {
                const status = u.status as AccountStatus;
                return (
                  <tr key={u.id} className="align-top">
                    <td className="border-b px-5 py-2.5 font-medium" style={{ borderColor: "var(--hairline)" }}>
                      {u.displayName}
                      {u.id === session.userId && (
                        <span className="ml-1.5 text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>
                          (you)
                        </span>
                      )}
                    </td>
                    <td className="border-b px-5 py-2.5" style={{ borderColor: "var(--hairline)" }}>
                      <code>{u.username ?? "—"}</code>
                      <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {u.email ?? "No email"}
                      </p>
                    </td>
                    <td className="border-b px-5 py-2.5" style={{ borderColor: "var(--hairline)" }}>
                      {u.department ? DEPARTMENT_LABELS[u.department as AccountDepartment] : "—"}
                    </td>
                    <td className="border-b px-5 py-2.5" style={{ borderColor: "var(--hairline)" }}>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? (
                          <span style={{ color: "var(--text-muted)" }}>None yet</span>
                        ) : (
                          u.roles.map((r) => <Tag key={r.id}>{ROLE_LABELS[r.role as Role]}</Tag>)
                        )}
                      </div>
                    </td>
                    <td className="tnum border-b px-5 py-2.5 whitespace-nowrap" style={{ borderColor: "var(--hairline)" }}>
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="border-b px-5 py-2.5" style={{ borderColor: "var(--hairline)" }}>
                      <StatusPill severity={STATUS_SEVERITY[status]} label={ACCOUNT_STATUS_LABELS[status]} />
                    </td>
                    <td className="border-b px-5 py-2.5 text-right" style={{ borderColor: "var(--hairline)" }}>
                      {status === "active" && u.id !== session.userId && (
                        <ActionButton action={suspendAccount} label="Suspend" fields={{ userId: u.id }} denied={denied} />
                      )}
                      {status === "suspended" && (
                        <ActionButton action={reactivateAccount} label="Reactivate" fields={{ userId: u.id }} denied={denied} />
                      )}
                    </td>
                  </tr>
                );
              })}
              {listed.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center" style={{ color: "var(--text-muted)" }}>
                    No accounts match these filters.
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
