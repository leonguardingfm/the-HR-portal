"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { useFormAction } from "@/components/ui/useFormAction";
import { field, inputStyle } from "@/components/scheduling/RotaForms";
import { finishTask, releaseTask, takeTask } from "@/lib/actions/work";
import type { ActionResult } from "@/lib/actions/types";
import { formatDate, formatTime } from "@/lib/format";
import type { Severity } from "@/lib/types";

export interface TaskRow {
  id: string;
  title: string;
  alarm: boolean;
  severity: Severity;
  status: "alert" | "blocked" | "overdue" | "on track";
  href: string;
  department: string;
  createdAt: string;
  dueAt: string;
  reference: string | null;
  blockedReason: string | null;
  owner: string | null;
  ownerIsMe: boolean;
  takenAt: string | null;
  pooled: boolean;
  canTake: boolean;
  canRelease: boolean;
  canFinish: boolean;
  closesItself: boolean;
  needsNote: boolean;
}

const RANK: Record<Severity, number> = { critical: 0, serious: 1, warning: 2, good: 3, neutral: 4 };

/**
 * The queue, worked from the list: open it, take it, hand it back, close it.
 * Alerts first, worst first; then overdue work; then the rest by due date.
 */
export function TaskList({ rows, tabs, active, myDepartment }: { rows: TaskRow[]; tabs: { id: string; label: string; title: string }[]; active: string; myDepartment: string }) {
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [filter, setFilter] = useState<"all" | "free" | "mine">("all");
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          Number(b.alarm) - Number(a.alarm) ||
          (a.alarm && b.alarm ? RANK[a.severity] - RANK[b.severity] : 0) ||
          Number(b.status === "overdue") - Number(a.status === "overdue") ||
          a.dueAt.localeCompare(b.dueAt),
      ),
    [rows],
  );
  const shown = sorted.filter((r) => (filter === "free" ? !r.owner && r.pooled : filter === "mine" ? r.ownerIsMe : true));
  const alarms = rows.filter((r) => r.alarm).length;
  const overdue = rows.filter((r) => r.status === "overdue").length;
  const free = rows.filter((r) => !r.owner && r.pooled).length;

  return (
    <Card
      title={`${rows.length} open`}
      subtitle={`${alarms} alert${alarms === 1 ? "" : "s"} · ${overdue} overdue · ${free} nobody has taken yet`}
      action={
        <nav aria-label="Whose tasks" className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={t.id ? `/tasks?department=${t.id}` : "/tasks"}
              title={t.title}
              aria-current={t.id === active ? "page" : undefined}
              className="rounded px-2 py-1 text-[11px]"
              style={{
                background: t.id === active ? "var(--wash)" : "transparent",
                color: t.id === active ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: t.id === active ? 600 : 400,
              }}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        <span style={{ color: "var(--text-secondary)" }}>Show</span>
        {(
          [
            ["all", "All"],
            ["free", `Nobody on it · ${free}`],
            ["mine", "Mine"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            aria-pressed={filter === id}
            className="h-7 rounded-md border px-2.5"
            style={{ borderColor: filter === id ? "var(--text-primary)" : "var(--hairline)", fontWeight: filter === id ? 600 : 400 }}
          >
            {label}
          </button>
        ))}
      </div>

      {notice && (
        <div role="status" className="mb-3 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-[13px]" style={{ borderColor: notice.ok ? "var(--status-good)" : "var(--status-critical)", background: notice.ok ? "var(--wash-good)" : "var(--wash-critical)" }}>
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" style={{ color: "var(--text-secondary)" }}>
            ✕
          </button>
        </div>
      )}

      <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
        {shown.map((r) => (
          <TaskItem key={r.id} r={r} onResult={setNotice} />
        ))}
        {shown.length === 0 && (
          <li className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {filter === "free" ? "Every task has somebody on it." : filter === "mine" ? "You have not taken anything." : `Nothing open${active ? "" : ` for you or ${myDepartment}`}.`}
          </li>
        )}
      </ul>
    </Card>
  );
}

function TaskItem({ r, onResult }: { r: TaskRow; onResult: (x: ActionResult) => void }) {
  const lift = (action: (prev: ActionResult | null, data: FormData) => Promise<ActionResult>) =>
    async (prev: ActionResult | null, data: FormData) => {
      const res = await action(prev, data);
      onResult(res);
      return res;
    };
  const take = useFormAction(lift(takeTask.bind(null, r.id)));
  const release = useFormAction(lift(releaseTask.bind(null, r.id)));
  const finish = useFormAction(lift(finishTask.bind(null, r.id)));
  const [closing, setClosing] = useState(false);
  const busy = take.pending || release.pending || finish.pending;

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3" style={{ borderColor: "var(--hairline)" }}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium">{r.title}</p>
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
          {r.department}
          {r.reference ? ` · ${r.reference}` : ""} · raised {formatDate(r.createdAt)} {formatTime(r.createdAt)}
          {!r.alarm && ` · due ${formatDate(r.dueAt)}`}
          {" · "}
          {r.owner ? (
            <strong style={{ color: r.ownerIsMe ? "var(--series-1)" : "var(--text-primary)" }}>
              {r.ownerIsMe ? "You have it" : `${r.owner} has it`}
              {r.takenAt ? ` since ${formatTime(r.takenAt)}` : ""}
            </strong>
          ) : r.pooled ? (
            <span style={{ color: r.alarm ? "var(--status-critical)" : undefined }}>nobody has taken it yet</span>
          ) : (
            "unassigned"
          )}
        </p>
        {r.blockedReason && (
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Blocked: {r.blockedReason}
          </p>
        )}
        {closing && (
          <form {...finish.form} className="mt-2 flex flex-wrap items-center gap-2">
            <input
              name="note"
              autoFocus
              required={r.needsNote}
              autoComplete="off"
              placeholder={r.needsNote ? "How was the officer reached, or what was done?" : "Note (optional)"}
              className={`${field} min-w-[16rem] flex-1`}
              style={inputStyle}
            />
            <button type="submit" disabled={busy} className="h-9 rounded-md px-3 text-[12px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--status-good)" }}>
              {finish.pending ? "Closing…" : "Mark done"}
            </button>
            <button type="button" onClick={() => setClosing(false)} className="text-[12px] underline" style={{ color: "var(--text-secondary)" }}>
              Cancel
            </button>
          </form>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <StatusPill severity={r.severity} label={r.status === "alert" ? "Alert" : r.status} />
        <Link href={r.href} className="inline-flex h-7 items-center rounded-md border px-2.5 text-[12px] font-medium" style={{ borderColor: "var(--hairline)" }}>
          Open
        </Link>
        {r.canTake && (
          <form {...take.form}>
            {r.owner && <input type="hidden" name="over" value="1" />}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-semibold disabled:opacity-60"
              style={r.owner ? { border: "1px solid var(--hairline)", color: "var(--text-secondary)" } : { background: "var(--series-1)", color: "#fff" }}
              title={r.owner ? `${r.owner} has it — take it over only if they cannot carry on` : "Take it, so the other desks can see you are on it"}
            >
              {take.pending ? "Taking…" : r.owner ? "Take over" : "I’ll take it"}
            </button>
          </form>
        )}
        {r.canRelease && (
          <form {...release.form}>
            <button type="submit" disabled={busy} className="inline-flex h-7 items-center rounded-md border px-2.5 text-[12px] disabled:opacity-60" style={{ borderColor: "var(--hairline)", color: "var(--text-secondary)" }}>
              Hand back
            </button>
          </form>
        )}
        {r.canFinish && !closing && (
          <button type="button" onClick={() => setClosing(true)} disabled={busy} className="inline-flex h-7 items-center rounded-md border px-2.5 text-[12px] font-medium disabled:opacity-60" style={{ borderColor: "var(--status-good)", color: "var(--status-good)" }}>
            Done
          </button>
        )}
        {r.closesItself && (
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }} title="Closes itself when the thing is put right">
            Closes itself
          </span>
        )}
      </div>
    </li>
  );
}
