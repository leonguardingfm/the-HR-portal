import { Card } from "@/components/ui/Card";
import { SEVERITY_META } from "@/lib/labels";
import { departmentKpis } from "@/lib/mock/ops";
import type { DepartmentId } from "@/lib/core/types";

const DEPARTMENT_LABELS: Record<DepartmentId, string> = {
  control: "Control",
  recruitment: "Recruitment",
  vetting: "Vetting",
  compliance: "Compliance",
  operations: "Operations",
  quality: "Quality",
  account_management: "Account management",
  administration: "Administration",
};

/**
 * KPIs by department.
 *
 * Every figure is a query over the event log, which is why the Insight domain
 * owns no facts of its own and why no two screens can disagree about the same
 * number. The ones marked as asserted are the ones this prototype has no data
 * to compute yet — said out loud, because a figure whose provenance is unclear
 * is worse than no figure.
 */
export function DepartmentKpis() {
  const grouped = Object.entries(
    departmentKpis.reduce<Record<string, typeof departmentKpis>>((acc, k) => {
      (acc[k.department] ??= []).push(k);
      return acc;
    }, {}),
  );

  return (
    <Card
      title="Department KPIs"
      subtitle="Derived from the event log rather than maintained. Management reporting cannot drift from operations if it has no numbers of its own."
    >
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        {grouped.map(([department, kpis]) => (
          <div key={department}>
            <p className="mb-1.5 text-[11px] font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
              {DEPARTMENT_LABELS[department as DepartmentId]}
            </p>
            <ul className="space-y-2.5">
              {kpis.map((k) => {
                const meta = SEVERITY_META[k.severity];
                return (
                  <li key={k.label}>
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className="text-[17px] font-semibold tracking-tight"
                        style={{ color: k.severity === "neutral" ? "var(--text-primary)" : meta.color }}
                      >
                        {k.value}
                      </span>
                      {k.severity !== "neutral" && (
                        <span aria-hidden style={{ color: meta.color, fontSize: "8px" }}>
                          {meta.glyph}
                        </span>
                      )}
                      {!k.derivable && (
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }} title="Asserted in the demonstration data — there is no event history behind it yet">
                          asserted
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] leading-tight">{k.label}</p>
                    <p className="text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                      {k.detail}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
