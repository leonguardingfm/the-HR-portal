import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/StatusPill";
import { formatTime } from "@/lib/format";
import { recentEvents } from "@/lib/mock/ops";

/**
 * The event log, read forwards.
 *
 * Every entry carries the actor AND the role they were working as, which is
 * what the active role at sign-in is for: "who did what, acting as what" is
 * answerable rather than inferred from a job title. The same log is the audit
 * trail an ACS assessor asks for, filtered differently.
 */
export function ActivityFeed({ limit = 8 }: { limit?: number }) {
  const events = recentEvents(limit);

  return (
    <Card
      title="Recent activity"
      subtitle="One append-only log across every department. The KPIs above are queries over this."
    >
      <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
        {events.map((e) => (
          <li key={e.id} className="py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-medium">{e.subjectName}</p>
              <span className="tnum text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                {formatTime(e.at)}
              </span>
            </div>
            <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
              {e.detail}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Tag>{e.type}</Tag>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {e.actorName} · {e.actorRole}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
