"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { useNow } from "@/components/ui/useNow";
import { startsIn, uncoveredSeverity } from "@/lib/core/alerts";
import { OFF_REASON_LABELS, dayLabel, ukDate, type OffReason } from "@/lib/core/rota";
import type { UncoveredShift } from "@/lib/db/uncovered";
import { formatTime } from "@/lib/format";

/**
 * Shifts nobody is on, soonest first, each one click from being filled. Red
 * when it has started or starts within two hours; amber today; a watch after.
 */
export function UncoveredPanel({ rows, hours = 48, limit = 8 }: { rows: UncoveredShift[]; hours?: number; limit?: number }) {
  const now = useNow(30_000);
  const soon = now ? rows.filter((r) => uncoveredSeverity(new Date(r.startsAt), now) === "critical").length : 0;
  return (
    <Card
      title={`Uncovered shifts · ${rows.length}`}
      subtitle={`Nobody is on these yet — the next ${hours} hours, soonest first.${soon ? ` ${soon} start${soon === 1 ? "s" : ""} within two hours or ha${soon === 1 ? "s" : "ve"} started.` : ""}`}
      action={
        <Link href="/scheduling" className="text-[12px] underline" style={{ color: "var(--text-secondary)" }}>
          Rota
        </Link>
      }
    >
      {rows.length === 0 ? (
        <p className="py-3 text-[13px]" style={{ color: "var(--good-text)" }}>
          ✓ Every shift in the next {hours} hours has an officer on it.
        </p>
      ) : (
        <ul className="divide-y rounded-md border" style={{ borderColor: "var(--hairline)" }}>
          {rows.slice(0, limit).map((r) => {
            const start = new Date(r.startsAt);
            const severity = now ? uncoveredSeverity(start, now) : "warning";
            return (
              <li
                key={`${r.kind}-${r.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                style={{ borderColor: "var(--hairline)", background: severity === "critical" ? "var(--wash-critical)" : undefined }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold">
                    {r.postName}{" "}
                    <span className="font-normal" style={{ color: "var(--text-secondary)" }}>
                      · {r.siteName}, {r.clientName}
                    </span>
                  </p>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {dayLabel(ukDate(start))} {formatTime(r.startsAt)}–{formatTime(r.endsAt)} ·{" "}
                    {r.from ? (
                      <>
                        {r.from.name} came off ({OFF_REASON_LABELS[r.from.reason as OffReason]?.toLowerCase() ?? r.from.reason}
                        {r.from.note ? ` — “${r.from.note}”` : ""})
                      </>
                    ) : (
                      "open shift, nobody put on it"
                    )}
                    {r.offers > 0 && (
                      <strong style={{ color: "var(--accent-text)" }}>
                        {" "}
                        · {r.offers} officer{r.offers === 1 ? "" : "s"} offered
                      </strong>
                    )}
                    {r.takenBy && ` · ${r.takenBy} is on it`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {now && <StatusPill severity={severity} label={startsIn(start, now)} wrap />}
                  <Link
                    href={r.href}
                    className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-semibold text-white"
                    style={{ background: severity === "critical" ? "var(--status-critical)" : "var(--series-1)" }}
                  >
                    {r.kind === "cover" ? "Find cover" : "Fill"}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > limit && (
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
          And {rows.length - limit} more on the rota.
        </p>
      )}
    </Card>
  );
}
