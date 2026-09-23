import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { formatDays } from "@/lib/format";
import { tasks } from "@/lib/mock/data";
import { taskSeverity } from "@/lib/sla";

/**
 * The work queue. Most overdue first, with what to do stated as an action
 * rather than a status — so nobody has to work out what "in progress" means.
 */
export function TaskDigest({ limit }: { limit?: number }) {
  const now = new Date();
  const rows = [...tasks]
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, limit);

  return (
    <Card
      title="Outstanding work"
      subtitle="Most overdue first. A chaser sequence cancels itself the moment the item arrives."
      action={
        <Link href="/tasks" className="text-[12px] underline" style={{ color: "var(--text-secondary)" }}>
          My Tasks
        </Link>
      }
    >
      <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
        {rows.map((task) => {
          const daysLeft = Math.ceil(
            (new Date(task.dueAt).getTime() - now.getTime()) / 86_400_000,
          );
          return (
            <li key={task.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px]">
                  <Link href={task.subjectHref} className="font-medium hover:underline">
                    {task.subjectName}
                  </Link>
                  <span style={{ color: "var(--text-secondary)" }}> — {task.title}</span>
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {task.owner}
                  {task.blocked && task.blockedReason && ` · Blocked: ${task.blockedReason}`}
                </p>
              </div>
              <StatusPill
                severity={task.blocked ? "neutral" : taskSeverity(task.dueAt, task.slaDays, now)}
                label={task.blocked ? "Waiting on a third party" : formatDays(daysLeft)}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
