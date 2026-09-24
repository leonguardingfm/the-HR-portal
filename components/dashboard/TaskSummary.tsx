import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { Severity } from "@/lib/types";

export interface TaskSummaryRow {
  id: string;
  title: string;
  severity: Severity;
  label: string;
  href: string;
  owner: string | null;
}

/**
 * The top of the work queue for this person's department: alerts first, then
 * overdue. The queue itself is where tasks are taken and closed.
 */
export function TaskSummary({ rows, total, department }: { rows: TaskSummaryRow[]; total: number; department: string }) {
  return (
    <Card
      title={`Tasks · ${total}`}
      subtitle={`Yours, and ${department}'s that nobody has taken. Alerts first.`}
      action={
        <Link href="/tasks" className="text-[12px] underline" style={{ color: "var(--text-secondary)" }}>
          All tasks
        </Link>
      }
    >
      {rows.length === 0 ? (
        <p className="py-3 text-[13px]" style={{ color: "var(--status-good)" }}>
          ✓ Nothing open.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2" style={{ borderColor: "var(--hairline)" }}>
              <div className="min-w-0 flex-1">
                <p className="text-[13px]">{r.title}</p>
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  {r.owner ? `${r.owner} has it` : "Nobody has taken it yet"}
                </p>
              </div>
              <StatusPill severity={r.severity} label={r.label} />
              <Link href={r.href} className="inline-flex h-7 items-center rounded-md border px-2.5 text-[12px] font-medium" style={{ borderColor: "var(--hairline)" }}>
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > rows.length && (
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
          And {total - rows.length} more in the task list.
        </p>
      )}
    </Card>
  );
}
