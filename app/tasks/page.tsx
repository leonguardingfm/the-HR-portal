import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { TaskDigest } from "@/components/dashboard/TaskDigest";
import { requireSession } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * One work queue, filtered.
 *
 * "Control Room tasks", "HR tasks" and "Admin tasks" all arrive here with a
 * `?department=`. They are not three screens: a second task list is a second
 * thing to forget to open, and two lists that both claim to hold everything
 * will disagree within a week.
 */
const DEPARTMENTS = [
  { id: "", label: "Everything" },
  { id: "control", label: "Control Room" },
  { id: "recruitment", label: "HR" },
  { id: "vetting", label: "Vetting" },
  { id: "administration", label: "Admin" },
] as const;

/**
 * Which roles a department's work sits with. Kept here rather than on the work
 * item so that reassigning a department's roles does not mean rewriting rows.
 */
const DEPARTMENT_ROLES: Record<string, string[]> = {
  control: ["control", "operations_manager"],
  recruitment: ["recruitment", "recruitment_manager"],
  vetting: ["vetting_admin", "vetting_controller"],
  administration: ["admin_officer", "admin_manager", "finance_officer"],
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string }>;
}) {
  await requireSession();
  const { department } = await searchParams;
  const active = department && DEPARTMENT_ROLES[department] ? department : "";

  const items = await db.workItem.findMany({
    where: {
      state: { in: ["open", "blocked"] },
      ...(active
        ? {
            OR: [
              { ownerRole: { in: DEPARTMENT_ROLES[active] as never } },
              ...(active === "administration"
                ? [{ adminItemId: { not: null } }]
                : []),
            ],
          }
        : {}),
    },
    include: { owner: true, adminItem: true },
    orderBy: { dueAt: "asc" },
    take: 100,
  });

  const now = new Date();
  const overdue = items.filter((i) => i.dueAt < now);
  const blocked = items.filter((i) => i.state === "blocked");

  const label = DEPARTMENTS.find((d) => d.id === active)?.label ?? "Everything";

  return (
    <div className="space-y-5">
      <PageHeader
        title={active ? `${label} tasks` : "My tasks"}
        description="A flat work queue: what is mine, what is overdue, what is due today, and what is blocked waiting on someone else. One queue for the whole platform — the departmental views below are filters on it, not lists of their own."
      />

      <Card
        title={`${items.length} open item${items.length === 1 ? "" : "s"}`}
        subtitle={`${overdue.length} past its service level, ${blocked.length} blocked waiting on someone else. Blocked is not overdue — showing it as overdue trains people to ignore red.`}
        action={
          <nav aria-label="Department" className="flex flex-wrap gap-1">
            {DEPARTMENTS.map((d) => (
              <Link
                key={d.id}
                href={d.id ? `/tasks?department=${d.id}` : "/tasks"}
                aria-current={d.id === active ? "true" : undefined}
                className="rounded px-2 py-1 text-[11px]"
                style={{
                  background: d.id === active ? "var(--wash)" : "transparent",
                  color: d.id === active ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: d.id === active ? 600 : 400,
                }}
              >
                {d.label}
              </Link>
            ))}
          </nav>
        }
      >
        <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {items.map((i) => {
            const late = i.dueAt < now;
            return (
              <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{i.title}</p>
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    {i.owner ? i.owner.displayName : i.ownerRole ? `unassigned — ${i.ownerRole.replace(/_/g, " ")}` : "unassigned"}
                    {" · due "}
                    {formatDate(i.dueAt.toISOString())}
                    {i.adminItem ? ` · ${i.adminItem.reference}` : ""}
                  </p>
                  {i.blockedReason && (
                    <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Blocked: {i.blockedReason}
                    </p>
                  )}
                </div>
                <StatusPill
                  severity={i.state === "blocked" ? "neutral" : late ? "serious" : "good"}
                  label={i.state === "blocked" ? "blocked" : late ? "overdue" : "on track"}
                />
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Nothing open{active ? ` for ${label}` : ""}.
            </li>
          )}
        </ul>
      </Card>

      <TaskDigest />

      <ModuleOutline
        note="The escalation rule is deliberately uniform rather than per-stage: amber at 80% of the service level, red once past it, escalated to the manager at twice it. One consistent rule is easier to trust than a dozen special cases. Admin items are the exception and say so — their escalation is a multiple of their own priority target, because a four-hour job and a ten-day one cannot share a clock."
        items={[
          {
            label: "One-click actions",
            detail: "Send the chaser, record the check, upload the evidence — from the queue, without opening three screens first.",
            phase: 1,
          },
          {
            label: "Filter to mine, my team, or everything",
            detail: "Managers need the team view for balancing work; everyone else needs their own list first. The departmental filters above are the first half of this.",
            phase: 1,
          },
          {
            label: "Blocked-and-waiting state",
            detail: "A task waiting on a third party — a DWP written request, a disclosure application — is not overdue work, and showing it as overdue trains people to ignore red.",
            phase: 1,
          },
          {
            label: "Daily morning digest",
            detail: "Each owner gets their own overdue and due-today items by email, so the queue does not depend on anyone remembering to open the portal.",
            phase: 2,
          },
        ]}
      />
    </div>
  );
}
