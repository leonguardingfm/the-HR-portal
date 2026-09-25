import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { requireSession } from "@/lib/auth/server";
import { contractLabel } from "@/lib/core/employees";
import { EMPLOYEES_PAGE, getEmployees } from "@/lib/db/employees";
import { Pager, pageFrom } from "@/components/ui/Pager";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Employees (HR, 25 September 2026). Everyone employed, one row each; open a
 * name for the record — contact details, next of kin, contract, payroll,
 * training, leave, documents, and the leaver process.
 */
export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string; page?: string }> }) {
  await requireSession();
  const sp = await searchParams;
  const leavers = sp.show === "leavers";
  const { rows, total, page } = await getEmployees({ leavers, q: sp.q, page: pageFrom(sp.page) });
  const tab = (on: boolean) => ({
    background: on ? "var(--wash)" : "transparent",
    borderColor: on ? "var(--series-1)" : "var(--hairline)",
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Employees"
        description="Everyone employed, with their record in one place. Officers ask for leave from their portal; it comes to Administration, and the rota knows at once."
      />
      <Card
        title={leavers ? "Leavers" : "Current"}
        subtitle={`${total} ${leavers ? "leaver" : "employee"}${total === 1 ? "" : "s"}${sp.q ? " matching" : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <form action="/people" className="flex items-center gap-2">
              {leavers && <input type="hidden" name="show" value="leavers" />}
              <input
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Name, PIN or job"
                aria-label="Search employees"
                className="h-8 w-40 rounded-md border px-2.5 text-[12px] sm:w-52"
                style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}
              />
            </form>
            <Link href="/people" className="rounded-md border px-2.5 py-1 text-[12px]" style={tab(!leavers)}>
              Current
            </Link>
            <Link href="/people?show=leavers" className="rounded-md border px-2.5 py-1 text-[12px]" style={tab(leavers)}>
              Leavers
            </Link>
          </div>
        }
      >
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {sp.q ? "Nobody matches that." : leavers ? "No leavers." : "Nobody is employed yet."}
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {rows.map((e) => (
              <li key={e.personId} style={{ borderColor: "var(--hairline)" }}>
                <Link href={`/people/${e.personId}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 hover:bg-[var(--wash)]">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium">{e.name}</p>
                    <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      PIN {e.pin}
                      {e.jobTitle ? ` · ${e.jobTitle}` : ""}
                      {e.contractType ? ` · ${contractLabel(e.contractType)}` : ""}
                      {leavers && e.lastWorkingDay ? ` · left ${formatDate(e.lastWorkingDay)}` : ` · since ${formatDate(e.startedAt)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {e.state === "conditional" && <StatusPill severity="warning" label="Conditional" />}
                    {e.state === "suspended" && <StatusPill severity="critical" label="Suspended" />}
                    {e.leavePending > 0 && <StatusPill severity="neutral" label={`Leave asked ×${e.leavePending}`} />}
                    {e.expiringSoon > 0 && <StatusPill severity="warning" label={`${e.expiringSoon} expiring`} />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pager page={page} pageSize={EMPLOYEES_PAGE} total={total} href={(p) => `/people?${new URLSearchParams({ ...(leavers ? { show: "leavers" } : {}), ...(sp.q ? { q: sp.q } : {}), page: String(p) }).toString()}`} />
      </Card>
    </div>
  );
}
