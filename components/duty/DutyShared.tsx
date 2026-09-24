"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { StatusPill } from "@/components/ui/StatusPill";
import { useNow } from "@/components/ui/useNow";
import { dutyCounts, dutyStatus, type CallSlot, type DutyStatus } from "@/lib/core/duty";
import type { LiveRow, ProofView } from "@/lib/db/queries";
import { proofVerdict } from "@/lib/core/proof";
import { formatTime } from "@/lib/format";
import type { Severity } from "@/lib/types";

export type DutyRow = LiveRow & { s: DutyStatus };

/**
 * The rows with their duty status, worked out on the browser's clock every
 * thirty seconds — so a chase-up turns red, and a check call goes missed, while
 * the page is open, without anyone reloading it.
 */
export function useDuty(rows: LiveRow[]) {
  const now = useNow(30_000);
  const duty = useMemo(() => (now ? rows.map((r) => ({ ...r, s: dutyStatus(r, now) })) : []), [rows, now]);
  const counts = useMemo(() => (now ? dutyCounts(duty.map((d) => d.s), now) : null), [duty, now]);
  return { now, duty, counts };
}

/** "in 25 min", "40 min ago", "in 3h 10m". */
export function relative(at: Date, now: Date): string {
  const mins = Math.round((at.getTime() - now.getTime()) / 60_000);
  const abs = Math.abs(mins);
  const text = abs < 60 ? `${abs} min` : `${Math.floor(abs / 60)}h${abs % 60 ? ` ${abs % 60}m` : ""}`;
  return mins >= 0 ? `in ${text}` : `${text} ago`;
}

type Step = "confirmed" | "chase" | "bookon" | "calls" | "alerts";

/**
 * The flow, at the top of every duty page and on the dashboard:
 * Duty confirmed → Chase-up → Book-on → Check calls → Alerts. Each step is a
 * link to its page, with what is waiting at it, so the whole picture is one
 * glance and the next job one click.
 */
export function DutyFlow({ counts, current }: { counts: NonNullable<ReturnType<typeof dutyCounts>>; current?: Step }) {
  const alerts = counts.chase.urgent + counts.bookOn.noShow + counts.bookOn.late + counts.calls.missed;
  const steps: { id: Step; n: number; title: string; href: string; lines: string[]; severity: Severity }[] = [
    {
      id: "confirmed",
      n: 1,
      title: "Duty confirmed",
      href: "/scheduling",
      lines: [`${counts.confirmed} shift${counts.confirmed === 1 ? "" : "s"} on the rota`, "next 12 hours"],
      severity: "neutral",
    },
    {
      id: "chase",
      n: 2,
      title: "Chase-up",
      href: "/duty/chase-ups",
      // The headline is the problem when there is one, and the good news when there is not.
      lines: counts.chase.toDo
        ? [`${counts.chase.toDo} to chase${counts.chase.urgent ? `, ${counts.chase.urgent} urgent` : ""}`, `${counts.chase.confirmed} confirmed · ${counts.chase.notDue} not due yet`]
        : [`${counts.chase.confirmed} confirmed`, `${counts.chase.notDue} not due yet`],
      severity: counts.chase.urgent ? "critical" : counts.chase.toDo ? "warning" : "good",
    },
    {
      id: "bookon",
      n: 3,
      title: "Book-on",
      href: "/duty/book-ons",
      lines:
        counts.bookOn.noShow || counts.bookOn.late
          ? [
              [counts.bookOn.noShow && `${counts.bookOn.noShow} no-show`, counts.bookOn.late && `${counts.bookOn.late} late`].filter(Boolean).join(", "),
              `${counts.bookOn.bookedOn} on duty · ${counts.bookOn.awaiting} awaiting`,
            ]
          : [`${counts.bookOn.bookedOn} on duty`, `${counts.bookOn.awaiting} awaiting book-on`],
      severity: counts.bookOn.noShow ? "critical" : counts.bookOn.late ? "serious" : counts.bookOn.awaiting ? "warning" : "good",
    },
    {
      id: "calls",
      n: 4,
      title: "Check calls",
      href: "/duty/check-calls",
      lines: counts.calls.missed
        ? [`${counts.calls.missed} missed`, `${counts.calls.inContact} in contact · ${counts.calls.made} made today`]
        : [`${counts.calls.inContact} in contact`, `${counts.calls.dueNextHour} due in the next hour · ${counts.calls.made} made`],
      severity: counts.calls.missed ? "critical" : "good",
    },
    {
      id: "alerts",
      n: 5,
      title: "Alerts",
      href: counts.calls.missed ? "/duty/check-calls" : counts.bookOn.noShow || counts.bookOn.late ? "/duty/book-ons" : "/duty/chase-ups",
      lines: alerts ? [`${alerts} need action now`, [counts.calls.missed && `${counts.calls.missed} missed call`, counts.bookOn.noShow && `${counts.bookOn.noShow} no-show`, counts.chase.urgent && `${counts.chase.urgent} unconfirmed`].filter(Boolean).join(" · ")] : ["None", "all duties in hand"],
      severity: alerts ? "critical" : "good",
    },
  ];
  const tone = (s: Severity) =>
    s === "critical"
      ? { border: "var(--status-critical)", bg: "var(--wash-critical)", ink: "var(--status-critical)" }
      : s === "serious"
        ? { border: "var(--status-serious)", bg: "var(--wash-serious)", ink: "var(--status-serious)" }
        : s === "warning"
          ? { border: "var(--status-warning)", bg: "var(--wash-warning)", ink: "var(--text-primary)" }
          : s === "good"
            ? { border: "var(--status-good)", bg: "var(--wash-good)", ink: "var(--status-good)" }
            : { border: "var(--hairline)", bg: "var(--surface-1)", ink: "var(--text-secondary)" };
  return (
    <nav aria-label="The duty flow" className="grid grid-cols-1 gap-2 sm:grid-cols-5">
      {steps.map((st, i) => {
        const t = tone(st.severity);
        return (
          <Link
            key={st.id}
            href={st.href}
            aria-current={current === st.id ? "page" : undefined}
            className="relative rounded-lg border-2 px-3 py-2.5 transition hover:brightness-95"
            style={{ borderColor: current === st.id ? "var(--series-1)" : t.border, background: t.bg, boxShadow: current === st.id ? "0 0 0 2px var(--series-1)" : undefined }}
          >
            <p className="flex items-center gap-2 text-[12px] font-semibold">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: current === st.id ? "var(--series-1)" : "var(--text-secondary)" }}>
                {st.n}
              </span>
              {st.title}
              {i < steps.length - 1 && (
                <span aria-hidden="true" className="ml-auto hidden text-[14px] sm:inline" style={{ color: "var(--text-muted)" }}>
                  →
                </span>
              )}
            </p>
            <p className="mt-1 text-[13px] font-semibold" style={{ color: t.ink }}>
              {st.lines[0]}
            </p>
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              {st.lines[1]}
            </p>
          </Link>
        );
      })}
    </nav>
  );
}

/** Who and where, the same on every duty page. The number is a link, because the job is a phone call. */
export function OfficerCell({ r, now }: { r: LiveRow; now: Date }) {
  const start = new Date(r.assignment.startsAt);
  const end = new Date(r.assignment.endsAt);
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-semibold">
        {r.personName}
        {r.pin && (
          <span className="tnum ml-1.5 text-[11px] font-normal tabular-nums" style={{ color: "var(--text-muted)" }}>
            PIN {r.pin}
          </span>
        )}
      </p>
      {r.phone && (
        <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="tnum text-[12px] tabular-nums underline-offset-2 hover:underline" style={{ color: "var(--series-1)" }}>
          {r.phone}
        </a>
      )}
      <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {r.post.name} · {r.siteName}
        {r.post.loneWorking && " · lone working"}
      </p>
      <p className="tnum text-[12px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
        {formatTime(start)}–{formatTime(end)} · {now < start ? `starts ${relative(start, now)}` : now < end ? `ends ${relative(end, now)}` : "finished"}
      </p>
    </div>
  );
}

export function Pill({ severity, label }: { severity: Severity; label: string }) {
  return <StatusPill severity={severity} label={label} wrap />;
}

/** A list section with a count, and a line saying what is in it. */
export function Section({ title, count, meaning, tone, children }: { title: string; count: number; meaning: string; tone?: Severity; children: ReactNode }) {
  const ink = tone === "critical" ? "var(--status-critical)" : tone === "serious" ? "var(--status-serious)" : tone === "good" ? "var(--status-good)" : "var(--text-primary)";
  return (
    <section className="rounded-lg border" style={{ borderColor: tone === "critical" && count ? "var(--status-critical)" : "var(--hairline)", background: "var(--surface-1)" }}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: count ? ink : "var(--text-primary)" }}>
          {title} <span className="tnum tabular-nums">· {count}</span>
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {meaning}
        </p>
      </header>
      {count === 0 ? (
        <p className="px-4 py-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Nothing here.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {children}
        </ul>
      )}
    </section>
  );
}

const SLOT_LOOK: Record<CallSlot["kind"], { bg: string; ink: string; mark: string; border: string }> = {
  done: { bg: "var(--wash-good)", ink: "var(--status-good)", mark: "✓", border: "var(--status-good)" },
  late: { bg: "var(--wash-warning)", ink: "var(--text-primary)", mark: "!", border: "var(--status-warning)" },
  missed: { bg: "var(--status-critical)", ink: "#fff", mark: "✗", border: "var(--status-critical)" },
  upcoming: { bg: "transparent", ink: "var(--text-muted)", mark: "○", border: "var(--hairline)" },
};

/** The shift's hourly calls in a row: made, made late, missed, and still to come. */
export function CallTimeline({ slots, now }: { slots: CallSlot[]; now: Date }) {
  if (slots.length === 0) {
    return (
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        No calls due before the shift ends.
      </p>
    );
  }
  const next = slots.find((s) => s.kind === "upcoming");
  return (
    <ol aria-label="Hourly check calls" className="flex flex-wrap gap-1">
      {slots.map((s, i) => {
        const look = SLOT_LOOK[s.kind];
        const isNext = s === next;
        const text =
          s.kind === "done"
            ? `${formatTime(s.callAt!)}`
            : s.kind === "late"
              ? `${formatTime(s.callAt!)} +${s.minutesLate}m`
              : s.kind === "missed"
                ? `${formatTime(s.dueAt)} missed ${s.minutesLate}m`
                : isNext
                  ? `${formatTime(s.dueAt)} next`
                  : formatTime(s.dueAt);
        const title =
          s.kind === "done"
            ? `Made at ${formatTime(s.callAt!)}, due by ${formatTime(s.dueAt)}`
            : s.kind === "late"
              ? `Due ${formatTime(s.dueAt)}, came in ${s.minutesLate} min late`
              : s.kind === "missed"
                ? `Due ${formatTime(s.dueAt)} — missed, ${s.minutesLate} min so far`
                : `Due ${formatTime(s.dueAt)}${isNext ? ` (${relative(s.dueAt, now)})` : ""}`;
        return (
          <li
            key={i}
            title={title}
            className="tnum inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
            style={{ background: look.bg, color: look.ink, borderColor: isNext ? "var(--series-1)" : look.border, borderStyle: s.kind === "upcoming" && !isNext ? "dashed" : "solid" }}
          >
            <span aria-hidden="true">{look.mark}</span>
            {text}
          </li>
        );
      })}
    </ol>
  );
}

/** The last thing done on this page, kept in view: the row it was done to has often moved on. */
export function Notice({ result, onClear }: { result: { ok: boolean; message: string } | null; onClear: () => void }) {
  if (!result) return null;
  return (
    <div
      role="status"
      className="flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-[13px]"
      style={{ borderColor: result.ok ? "var(--status-good)" : "var(--status-critical)", background: result.ok ? "var(--wash-good)" : "var(--wash-critical)" }}
    >
      <span>{result.message}</span>
      <button type="button" onClick={onClear} aria-label="Dismiss" className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        ✕
      </button>
    </div>
  );
}

/**
 * Control's own buttons, for when the officer rang in instead. Officers with a
 * portal account do their own checks, so these fold away; for one without, they
 * are the way it gets recorded at all, so they stay open.
 */
export function OnTheirBehalf({ hasPortal, children }: { hasPortal: boolean; children: ReactNode }) {
  if (!hasPortal) {
    return (
      <div className="space-y-2">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No portal account — Control records for them.
        </p>
        {children}
      </div>
    );
  }
  return (
    <details className="rounded-md border" style={{ borderColor: "var(--hairline)" }}>
      <summary className="cursor-pointer px-2.5 py-1.5 text-[12px] select-none" style={{ color: "var(--text-secondary)" }}>
        Record for them — they rang in instead
      </summary>
      <div className="space-y-2 border-t px-2.5 py-2" style={{ borderColor: "var(--hairline)" }}>
        {children}
      </div>
    </details>
  );
}

/** Who did it: the officer themselves, or Control on their behalf. */
export function ByWhom({ byOfficer }: { byOfficer?: boolean }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={byOfficer ? { background: "var(--wash-good)", color: "var(--status-good)" } : { background: "var(--wash-neutral)", color: "var(--text-secondary)" }}>
      {byOfficer ? "By the officer" : "By Control"}
    </span>
  );
}

/**
 * The selfie behind a book-on or a check call: a thumbnail that opens its
 * record, and what it shows — at the site, how far away, or why it cannot be
 * told. An officer's own book-on with no selfie says so.
 */
export function ProofBadge({ proof, byOfficer, siteHasLocation }: { proof: ProofView | null | undefined; byOfficer?: boolean; siteHasLocation: boolean }) {
  if (!proof) {
    return byOfficer ? <StatusPill severity="warning" label="No selfie — ring to confirm they are on site" wrap /> : null;
  }
  const v = proofVerdict({ atSite: proof.atSite, distanceMetres: proof.distanceMetres, accuracyMetres: proof.accuracyMetres, liveCamera: proof.liveCamera, hasLocation: proof.hasLocation, siteHasLocation });
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <Link href={`/duty/verify/${proof.code}`} target="_blank" title="Open the selfie and what the server recorded" className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/duty/proof/${proof.id}`} alt={`Selfie ${proof.code}`} loading="lazy" className="h-10 w-10 rounded object-cover" style={{ border: "1px solid var(--hairline)" }} />
      </Link>
      <StatusPill severity={v.severity} label={v.label} wrap />
    </span>
  );
}

/** Who else to ring when the officer does not answer: the post's own phone, and the client's person on site. */
export function WhoElseToRing({ r }: { r: LiveRow }) {
  if (!r.post.phone && !r.site.contactPhone) {
    return (
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        No post phone or on-site contact recorded — add them under Clients, sites &amp; posts.
      </p>
    );
  }
  return (
    <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
      {r.post.phone && (
        <>
          Post phone{" "}
          <a href={`tel:${r.post.phone.replace(/[^\d+]/g, "")}`} className="font-medium underline" style={{ color: "var(--series-1)" }}>
            {r.post.phone}
          </a>
        </>
      )}
      {r.post.phone && r.site.contactPhone && " · "}
      {r.site.contactPhone && (
        <>
          {r.site.contactName ?? "On-site contact"}{" "}
          <a href={`tel:${r.site.contactPhone.replace(/[^\d+]/g, "")}`} className="font-medium underline" style={{ color: "var(--series-1)" }}>
            {r.site.contactPhone}
          </a>
        </>
      )}
    </p>
  );
}
