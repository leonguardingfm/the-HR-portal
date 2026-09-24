import Link from "next/link";
import { notFound } from "next/navigation";
import { EmployeeRecord } from "@/components/people/EmployeeRecord";
import { canAccessPath } from "@/components/layout/nav";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { ukDate } from "@/lib/core/rota";
import { getEmployee } from "@/lib/db/employees";

export const dynamic = "force-dynamic";

/**
 * One employee's record. Pay and the payroll reference are sent to the page
 * only for the roles that handle them — hidden is not enough.
 */
export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const e = await getEmployee(id);
  if (!e) notFound();
  const payrollDenied = deniedReason(session.activeRole, "employee.payroll");
  const shown = payrollDenied
    ? { ...e, person: { ...e.person, payrollRef: null, nationalInsurance: null }, employment: { ...e.employment, payRatePence: null } }
    : e;
  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        <Link href="/people" className="underline underline-offset-2">
          Employees
        </Link>{" "}
        / {e.person.fullName}
      </nav>
      <EmployeeRecord
        e={shown}
        today={ukDate(new Date())}
        editDenied={deniedReason(session.activeRole, "employee.edit")}
        payrollDenied={payrollDenied}
        leaverDenied={deniedReason(session.activeRole, "employee.leaver")}
        officerHref={canAccessPath(session.activeRole, "/officers") ? `/officers/${e.person.id}` : null}
      />
    </div>
  );
}
