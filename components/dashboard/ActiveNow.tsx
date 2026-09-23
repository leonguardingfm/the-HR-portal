import { Card } from "@/components/ui/Card";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { ROLE_LABELS } from "@/lib/labels";
import type { Role, Severity } from "@/lib/types";
import type { PresenceRow } from "@/lib/db/queries";

/** Idle for a while is worth showing, so "signed in" is not read as "working". */
function presence(lastSeenAt: string, now: number): { severity: Severity; label: string } {
  const minutes = Math.round((now - new Date(lastSeenAt).getTime()) / 60000);
  if (minutes <= 5) return { severity: "good", label: "Active now" };
  if (minutes <= 30) return { severity: "warning", label: `Idle ${minutes} min` };
  return { severity: "neutral", label: `Idle ${Math.max(1, Math.round(minutes / 60))} hr` };
}

/**
 * Who is signed in, what role they are working as, and what they are on.
 *
 * This is the point of asking for an active role at sign-in: a job title cannot
 * answer "who is doing the vetting today" when people hold several roles and
 * move between teams, but a chosen active role can.
 *
 * These rows are real. Sign-in opens a work session, sign-out closes it, and
 * changing role moves it — so this is a query over what is actually happening
 * rather than a guess. Open the portal in a second browser and the other person
 * appears here.
 */
export function ActiveNow({ rows, youUserId }: { rows: PresenceRow[]; youUserId: string }) {
  const now = Date.now();

  const byRole = rows.reduce<Partial<Record<Role, number>>>((acc, r) => {
    acc[r.activeRole] = (acc[r.activeRole] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Card
      title="Who is working on what"
      subtitle="Signed in right now, and the role each person is working as. Opened at sign-in, closed at sign-out."
      action={
        <div className="flex flex-wrap gap-1">
          {Object.entries(byRole).map(([role, count]) => (
            <Tag key={role}>
              {ROLE_LABELS[role as Role]}: <span className="tnum tabular-nums">{count}</span>
            </Tag>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Nobody else is signed in.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {rows.map((row) => {
            const p = presence(row.lastSeenAt, now);
            const isYou = row.userId === youUserId;
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">
                    {row.name}
                    {isYou && (
                      <span className="ml-1.5 font-normal" style={{ color: "var(--text-muted)" }}>
                        (you)
                      </span>
                    )}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Working as {ROLE_LABELS[row.activeRole]}
                    {row.openTasks > 0 &&
                      ` · ${row.openTasks} open task${row.openTasks === 1 ? "" : "s"}`}
                  </p>
                </div>
                <StatusPill severity={p.severity} label={p.label} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
