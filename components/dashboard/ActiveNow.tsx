"use client";

import { Card } from "@/components/ui/Card";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { useSession } from "@/components/layout/SessionContext";
import { ROLE_LABELS } from "@/lib/labels";
import { activeSessions, tasks } from "@/lib/mock/data";
import type { Role, Severity } from "@/lib/types";

/** Idle for a while is worth showing, so "signed in" is not read as "working". */
function presence(lastSeenAt: string, now: number): { severity: Severity; label: string } {
  const minutes = Math.round((now - new Date(lastSeenAt).getTime()) / 60000);
  if (minutes <= 5) return { severity: "good", label: "Active now" };
  if (minutes <= 30) return { severity: "warning", label: `Idle ${minutes} min` };
  return { severity: "neutral", label: `Idle ${Math.round(minutes / 60)} hr` };
}

/**
 * Who is signed in, what role they are working as, and what they are on.
 *
 * This is the point of asking for an active role at sign-in: a job title
 * cannot answer "who is doing the vetting today" when people hold several
 * roles and move between teams, but a chosen active role can.
 *
 * The roster below is demonstration data. A browser cannot see other people's
 * sessions, so real presence needs the Phase 1 backend — but the shape here is
 * what that API will return, and the current viewer's own row is real.
 */
export function ActiveNow() {
  const { session } = useSession();
  const now = Date.now();

  // Your own row reflects the live session, not the stored roster — you may
  // have changed the role you are working as since it was written.
  const rows = activeSessions.map((s) => {
    const isYou = session?.userId === s.userId;
    return {
      ...s,
      isYou,
      activeRole: isYou && session ? session.activeRole : s.activeRole,
      lastSeenAt: isYou ? new Date().toISOString() : s.lastSeenAt,
      openTasks: tasks.filter((t) => t.owner === s.name).length,
    };
  });

  // Someone signed in under a name not in the roster still belongs on it.
  const youListed = rows.some((r) => r.isYou);
  const you = session && !youListed
    ? {
        userId: session.userId ?? "self",
        name: session.name,
        activeRole: session.activeRole,
        signedInAt: session.signedInAt,
        lastSeenAt: new Date().toISOString(),
        isYou: true,
        openTasks: tasks.filter((t) => t.owner === session.name).length,
      }
    : null;

  const all = you ? [you, ...rows] : rows;

  const byRole = all.reduce<Partial<Record<Role, number>>>((acc, r) => {
    acc[r.activeRole] = (acc[r.activeRole] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Card
      title="Who is working on what"
      subtitle="Signed in, and the role each person is working as right now."
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
      <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
        {all.map((row) => {
          const p = presence(row.lastSeenAt, now);
          return (
            <li
              key={`${row.userId}-${row.name}`}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium">
                  {row.name}
                  {row.isYou && (
                    <span className="ml-1.5 font-normal" style={{ color: "var(--text-muted)" }}>
                      (you)
                    </span>
                  )}
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Working as {ROLE_LABELS[row.activeRole]}
                  {row.openTasks > 0 && ` · ${row.openTasks} open task${row.openTasks === 1 ? "" : "s"}`}
                </p>
              </div>
              <StatusPill severity={p.severity} label={p.label} />
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Your own row is live. The rest is demonstration data until the Phase 1
        backend, which is what lets one browser see another person&rsquo;s session.
      </p>
    </Card>
  );
}
