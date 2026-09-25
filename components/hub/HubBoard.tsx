"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useLive } from "@/components/live/Live";
import { useFormAction } from "@/components/ui/useFormAction";
import { useNow } from "@/components/ui/useNow";
import { Shortcuts, pressShortcut, type ShortcutKey } from "@/components/ui/Shortcuts";
import { acceptHubTask } from "@/lib/actions/hub";
import { PRIORITIES, departmentLabel, spanWords, type HubDepartment } from "@/lib/core/hub";
import type { HubBoard as Board, HubRow } from "@/lib/db/hub-queries";
import { CategoryChip, ClockBadge, Owner, PriorityBadge, StatusBadge, TONE, ukTimeOf } from "./HubBits";
import { HandOverButton, LogTaskButton, TestEmailButton } from "./HubDrawers";

type Props = {
  board: Board;
  me: { id: string; name: string };
  tab: string;
  q: string;
  priority: string | null;
  can: { work: boolean; test: boolean };
  staff: { id: string; name: string; onShift: boolean }[];
  clients: { id: string; name: string; sites: { id: string; name: string }[] }[];
};

const TABS = [
  { id: "all", label: "All open" },
  { id: "mine", label: "My work" },
  { id: "unassigned", label: "Unassigned" },
  { id: "attention", label: "Attention" },
  { id: "waiting", label: "Waiting" },
  { id: "closed", label: "Closed today" },
] as const;

const KEYS: ShortcutKey[] = [
  { keys: "j ↓", what: "Next task" },
  { keys: "k ↑", what: "Previous task" },
  { keys: "Enter o", what: "Open the task" },
  { keys: "a", what: "Accept the task" },
  { keys: "/", what: "Search" },
  { keys: "n", what: "Log a manual task" },
  { keys: "1 – 6", what: "All · Mine · Unassigned · Attention · Waiting · Closed" },
  { keys: "?", what: "This list" },
];

function greeting(now: Date | null) {
  const h = Number((now ?? new Date()).toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function AcceptButton({ id }: { id: string }) {
  const f = useFormAction(acceptHubTask.bind(null, id));
  return (
    <form {...f.form} onClick={(e) => e.stopPropagation()}>
      <button type="submit" data-accept disabled={f.pending} className="h-8 rounded-md px-3 text-[12px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--brand-royal)" }}>
        {f.pending ? "…" : "Accept"}
      </button>
      {f.state && !f.state.ok && (
        <p role="alert" className="mt-1 max-w-[10rem] text-[11px] leading-tight" style={{ color: "var(--critical-text)" }}>
          {f.state.message}
        </p>
      )}
    </form>
  );
}

function Tile({ label, value, detail, tone, href }: { label: string; value: number | string; detail: string; tone?: "red" | "gold"; href?: string }) {
  const body = (
    <div
      className="h-full rounded-lg border px-4 py-3.5 transition-colors hover:bg-[var(--wash)]"
      style={{ background: "var(--surface-1)", borderColor: "var(--hairline)", borderTop: tone === "red" ? "3px solid var(--status-critical)" : tone === "gold" ? "3px solid var(--brand-gold)" : undefined }}
    >
      <p className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
      <p className="tnum mt-1 text-[28px] leading-none font-semibold" style={{ color: tone === "red" ? "var(--critical-text)" : "var(--text-primary)" }}>
        {value}
      </p>
      <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
        {detail}
      </p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function HubBoard({ board, me, tab, q, priority, can, staff, clients }: Props) {
  const now = useNow(1000);
  const router = useRouter();
  const sp = useSearchParams();
  const { stale, updatedAt } = useLive();
  const t = board.tiles;
  const a = board.attentionWhy;
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) if (v) p.set(k, v);
      else p.delete(k);
    const s = p.toString();
    return s ? `/hub?${s}` : "/hub";
  };
  const why = [
    a.criticalUnassigned && `${a.criticalUnassigned} urgent email${a.criticalUnassigned === 1 ? "" : "s"} with no owner`,
    a.overdue && `${a.overdue} over time`,
    a.escalated && `${a.escalated} escalated`,
    a.handover && `${a.handover} needing handover`,
    a.review && `${a.review} to check the sorting`,
  ].filter(Boolean) as string[];
  const testMode = board.mailboxes.some((m) => m.mode === "test");
  const liveMailboxes = board.mailboxes.filter((m) => m.mode === "live");
  const mine = board.rows.filter((r) => r.ownerIsMe);
  const dueSoonText = t.myDueSoon ? `${t.myDueSoon} due now or soon` : "Nothing due yet";

  // The row the keyboard is on. Kept on the same task when the list refreshes.
  const [sel, setSel] = useState<string | null>(null);
  const at = sel ? board.rows.findIndex((r) => r.id === sel) : -1;
  const move = (d: number) => {
    if (!board.rows.length) return;
    const i = at < 0 ? (d > 0 ? 0 : board.rows.length - 1) : Math.min(board.rows.length - 1, Math.max(0, at + d));
    setSel(board.rows[i].id);
  };
  useEffect(() => {
    if (sel) document.querySelector<HTMLElement>(`[data-row="${sel}"]:not([hidden])`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);
  const tabKeys = Object.fromEntries(TABS.map((x, i) => [String(i + 1), () => router.push(href({ tab: x.id === "all" ? null : x.id }))]));
  const handlers: Record<string, () => void> = {
    ...tabKeys,
    j: () => move(1),
    ArrowDown: () => move(1),
    k: () => move(-1),
    ArrowUp: () => move(-1),
    Enter: () => sel && at >= 0 && router.push(`/hub/${sel}`),
    o: () => sel && at >= 0 && router.push(`/hub/${sel}`),
    a: () => {
      const row = sel ? [...document.querySelectorAll<HTMLElement>(`[data-row="${sel}"]`)].find((x) => x.offsetParent) : undefined;
      row?.querySelector<HTMLButtonElement>("[data-accept]:not(:disabled)")?.click();
    },
    "/": () => pressShortcut("/"),
    n: () => pressShortcut("n"),
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: "var(--gold-text)" }}>
            Performance hub
          </p>
          <h1 className="text-[24px] font-semibold tracking-tight">
            {greeting(now)}, {me.name.split(" ")[0]}
          </h1>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            {board.departments.map(departmentLabel).join(" · ")} · {staff.filter((s) => s.onShift).length} on shift now
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {testMode && (
            <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "var(--brand-gold-wash)", color: "var(--text-primary)" }} title="Emails here come from the test inbox, not a real mailbox">
              ⚑ Test inbox
            </span>
          )}
          {liveMailboxes.length > 0 && (
            <span className="rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: "var(--hairline)" }}>
              Outlook · {liveMailboxes.length} mailbox{liveMailboxes.length === 1 ? "" : "es"}
            </span>
          )}
          <Shortcuts list={can.work ? KEYS : KEYS.filter((k) => k.keys !== "a" && k.keys !== "n")} handlers={handlers} />
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: "var(--hairline)", background: "var(--surface-1)" }}>
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: stale ? "var(--status-critical)" : "var(--status-good)" }} />
            {stale ? "Reconnecting…" : "Live"} · {now ? now.toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
            <span className="sr-only">{updatedAt ? `, updated ${updatedAt.toLocaleTimeString()}` : ""}</span>
          </span>
        </div>
      </header>

      {why.length > 0 && (
        <Link
          href={href({ tab: "attention" })}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-[13px]"
          style={{ background: "var(--wash-critical)", borderColor: "var(--status-critical)", borderLeftWidth: 4 }}
        >
          <span>
            <strong>
              <span aria-hidden>‼ </span>
              {board.counts.attention} item{board.counts.attention === 1 ? "" : "s"} need{board.counts.attention === 1 ? "s" : ""} attention
            </strong>
            <span style={{ color: "var(--text-secondary)" }}> · {why.join(" · ")}</span>
          </span>
          <span className="font-semibold" style={{ color: "var(--critical-text)" }}>
            Review now →
          </span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Unassigned" value={t.unassigned} detail={t.oldestUnassignedAt && now ? `Oldest waiting ${spanWords(now.getTime() - new Date(t.oldestUnassignedAt).getTime())}` : "Nothing waiting for an owner"} tone={t.unassigned ? "gold" : undefined} href={href({ tab: "unassigned" })} />
        <Tile label="My open work" value={t.myOpen} detail={dueSoonText} href={href({ tab: "mine" })} />
        <Tile label="SLA breached today" value={t.breachedToday} detail={t.escalated ? `${t.escalated} escalated` : "Tasks that went over a clock"} tone={t.breachedToday ? "red" : undefined} href={href({ tab: "attention" })} />
        <Tile label="Completed today" value={t.completedToday} detail={t.withinSlaPct === null ? "None closed yet today" : `${t.withinSlaPct}% within SLA`} href={href({ tab: "closed" })} />
      </div>

      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}>
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            <h2 className="text-[15px] font-semibold">Shared mailbox activity</h2>
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Each email has one visible owner and a timed next action. Most urgent first.
            </p>
          </div>
          {can.work && (
            <div className="flex flex-wrap items-center gap-2">
              <HandOverButton mine={mine.map((r) => ({ id: r.id, ref: r.ref, subject: r.subject }))} staff={staff} meId={me.id} />
              {can.test && <TestEmailButton mailboxes={board.mailboxes} />}
              <LogTaskButton departments={board.departments} clients={clients} />
            </div>
          )}
          {!can.work && can.test && <TestEmailButton mailboxes={board.mailboxes} />}
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 border-y px-3 py-2" style={{ borderColor: "var(--hairline)", background: "var(--wash)" }}>
          <nav aria-label="Views" className="-mx-1 overflow-x-auto">
            <ul className="flex min-w-max gap-1 px-1">
              {TABS.map((x) => {
                const on = tab === x.id;
                const n = board.counts[x.id];
                return (
                  <li key={x.id}>
                    <Link
                      href={href({ tab: x.id === "all" ? null : x.id })}
                      aria-current={on ? "page" : undefined}
                      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
                      style={{ background: on ? "var(--surface-1)" : "transparent", color: on ? "var(--accent-text)" : "var(--text-secondary)", boxShadow: on ? "0 0 0 1px var(--hairline)" : undefined }}
                    >
                      {x.label}
                      <span className="tnum rounded-full px-1.5 text-[10px]" style={{ background: x.id === "attention" && n ? "var(--status-critical)" : "var(--wash-neutral)", color: x.id === "attention" && n ? "#fff" : "var(--text-secondary)" }}>
                        {n}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            {board.departments.length > 1 && (
              <select aria-label="Department" value={board.department ?? ""} onChange={(e) => router.push(href({ department: e.target.value || null }))} className="h-8 rounded-md border px-2 text-[12px]" style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}>
                <option value="">All departments</option>
                {board.departments.map((d) => (
                  <option key={d} value={d}>
                    {departmentLabel(d)}
                  </option>
                ))}
              </select>
            )}
            <select aria-label="Priority" value={priority ?? ""} onChange={(e) => router.push(href({ priority: e.target.value || null }))} className="h-8 rounded-md border px-2 text-[12px]" style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}>
              <option value="">All priorities</option>
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <form action="/hub" className="flex">
              {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
              {board.department && <input type="hidden" name="department" value={board.department} />}
              {priority && <input type="hidden" name="priority" value={priority} />}
              <input type="search" name="q" data-shortcut="/" defaultValue={q} placeholder="Search subject, sender, ref, site" aria-label="Search" className="h-8 w-56 max-w-full rounded-md border px-2.5 text-[12px]" style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }} />
            </form>
          </div>
        </div>

        {board.rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            {tab === "attention" ? "Nothing needs attention. Well done." : tab === "unassigned" ? "Every email has an owner." : q ? "Nothing matches." : "Nothing here."}
          </p>
        ) : (
          <>
            {/* Desktop: the table. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] text-left text-[12px]">
                <thead>
                  <tr className="text-[10px] tracking-wider uppercase" style={{ color: "var(--text-muted)" }}>
                    {["Received", "Email / task", "Category", "Priority", "Owner", "Status", "SLA", ""].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((r) => (
                    <Row key={r.id} r={r} now={now} board={board} canWork={can.work} selected={r.id === sel} onOpen={() => router.push(`/hub/${r.id}`)} />
                  ))}
                </tbody>
              </table>
            </div>
            {/* Phone: one card each. */}
            <ul className="divide-y md:hidden" style={{ borderColor: "var(--hairline)" }}>
              {board.rows.map((r) => (
                <MobileRow key={r.id} r={r} now={now} board={board} canWork={can.work} selected={r.id === sel} />
              ))}
            </ul>
          </>
        )}
        {(board.capped.open || (tab === "closed" && board.capped.closed)) && (
          <p role="status" className="border-t px-5 py-2.5 text-[12px]" style={{ borderColor: "var(--hairline)", background: "var(--wash-warning)" }}>
            {tab === "closed" && board.capped.closed
              ? `Showing the latest ${board.capped.closed.shown} of ${board.capped.closed.total} closed today — search or filter to find the others.`
              : `Showing the newest ${board.capped.open!.shown} of ${board.capped.open!.total} open tasks — the counts above include them all; search or filter to find the others.`}
          </p>
        )}
        {board.portalTasks > 0 && (
          <p className="border-t px-5 py-2.5 text-[12px]" style={{ borderColor: "var(--hairline)", color: "var(--text-secondary)" }}>
            Also waiting in the portal: {board.portalTasks} {board.departments.length === 1 ? departmentLabel(board.departments[0] as HubDepartment) : ""} task{board.portalTasks === 1 ? "" : "s"} —{" "}
            <Link href="/tasks" className="underline underline-offset-2" style={{ color: "var(--accent-text)" }}>
              My tasks
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}

const breachedNow = (r: HubRow, now: Date | null, board: Board) => {
  if (!now) return false;
  const due = r.status === "unassigned" ? r.ackDueAt : !r.firstActionAt ? r.actionDueAt : r.updateDueAt;
  return !!due && ["completed", "unsuccessful", "cancelled"].indexOf(r.status) === -1 && new Date(due) <= now && !(board && ["awaiting_information", "awaiting_client", "awaiting_officer"].includes(r.status) && r.followUpAt && new Date(r.followUpAt) > now);
};

function Row({ r, now, board, canWork, selected, onOpen }: { r: HubRow; now: Date | null; board: Board; canWork: boolean; selected: boolean; onOpen: () => void }) {
  const late = breachedNow(r, now, board);
  const critical = r.priority === "critical" && r.status === "unassigned";
  const edge = late || critical ? "var(--status-critical)" : r.status === "unassigned" ? "var(--brand-gold)" : "transparent";
  return (
    <tr
      data-row={r.id}
      aria-selected={selected || undefined}
      onClick={onOpen}
      className="cursor-pointer border-t align-top hover:bg-[var(--wash)]"
      style={{ borderColor: "var(--hairline)", background: late || critical ? "var(--wash-critical)" : undefined, boxShadow: `inset 3px 0 0 ${edge}${selected ? ", inset 0 0 0 2px var(--brand-royal)" : ""}` }}
    >
      <td className="px-4 py-3">
        <p className="tnum text-[13px] font-semibold">{ukTimeOf(r.receivedAt)}</p>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {r.ref}
        </p>
      </td>
      <td className="max-w-[26rem] px-4 py-3">
        <Link href={`/hub/${r.id}`} onClick={(e) => e.stopPropagation()} className="block text-[13px] font-semibold hover:underline">
          {r.subject}
        </Link>
        <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-secondary)" }}>
          {r.sender ?? "—"} · {departmentLabel(r.department)}
          {r.site ? ` · ${r.site}` : r.client ? ` · ${r.client}` : ""}
          {r.test ? " · test" : ""}
        </p>
        {r.nextAction && r.status !== "unassigned" && (
          <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
            Next: {r.nextAction}
            {r.nextActionAt ? ` · ${ukTimeOf(r.nextActionAt)}` : ""}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <CategoryChip category={r.category} note={r.categoryNote} review={r.needsReview} />
      </td>
      <td className="px-4 py-3">
        <PriorityBadge priority={r.priority} />
      </td>
      <td className="px-4 py-3">
        <Owner name={r.owner?.name ?? null} me={r.ownerIsMe} />
        {!r.owner && r.suggestedOwner && (
          <p className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
            Suggested: {r.suggestedOwner}
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={r.status} outcome={r.outcome} withinSla={r.withinSla} />
          {late && <span className="text-[10px] font-bold" style={{ color: TONE.red.fg }}>⏰ OVERDUE</span>}
          {r.handoverNeededAt && <span className="text-[10px] font-bold" style={{ color: TONE.amber.fg }}>⇄ NEEDS HANDOVER</span>}
        </div>
      </td>
      <td className="px-4 py-3">{now && <ClockBadge t={r} now={now} office={r.officeHours} policy={board.policy} />}</td>
      <td className="px-4 py-3 text-right">
        {r.status === "unassigned" && canWork ? (
          <AcceptButton id={r.id} />
        ) : (
          <Link href={`/hub/${r.id}`} onClick={(e) => e.stopPropagation()} className="text-[12px] font-semibold" style={{ color: "var(--accent-text)" }}>
            Open →
          </Link>
        )}
      </td>
    </tr>
  );
}

function MobileRow({ r, now, board, canWork, selected }: { r: HubRow; now: Date | null; board: Board; canWork: boolean; selected: boolean }) {
  const late = breachedNow(r, now, board);
  const critical = r.priority === "critical" && r.status === "unassigned";
  return (
    <li data-row={r.id} className="px-4 py-3" style={{ borderColor: "var(--hairline)", background: late || critical ? "var(--wash-critical)" : undefined, boxShadow: [late || critical ? "inset 3px 0 0 var(--status-critical)" : "", selected ? "inset 0 0 0 2px var(--brand-royal)" : ""].filter(Boolean).join(", ") || undefined }}>
      <div className="flex items-start justify-between gap-3">
        <Link href={`/hub/${r.id}`} className="min-w-0">
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {ukTimeOf(r.receivedAt)} · {r.ref}
          </p>
          <p className="text-[14px] font-semibold">{r.subject}</p>
          <p className="truncate text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {r.sender ?? "—"}
            {r.site ? ` · ${r.site}` : ""}
          </p>
        </Link>
        {now && <ClockBadge t={r} now={now} office={r.officeHours} policy={board.policy} />}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={r.priority} />
        <CategoryChip category={r.category} note={r.categoryNote} review={r.needsReview} />
        <StatusBadge status={r.status} outcome={r.outcome} withinSla={r.withinSla} />
        {late && <span className="text-[10px] font-bold" style={{ color: TONE.red.fg }}>⏰ OVERDUE</span>}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Owner name={r.owner?.name ?? null} me={r.ownerIsMe} />
        {r.status === "unassigned" && canWork && <AcceptButton id={r.id} />}
      </div>
    </li>
  );
}
