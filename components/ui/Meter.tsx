import { SEVERITY_META } from "@/lib/labels";
import type { Severity } from "@/lib/types";

/**
 * Meter — the fill carries severity, the unfilled track is a light step of the
 * same family so state reads across the whole bar. Used for the screening clock.
 */
export function Meter({
  fraction,
  severity,
  label,
}: {
  fraction: number;
  severity: Severity;
  label: string;
}) {
  const meta = SEVERITY_META[severity];
  const pct = Math.min(Math.max(fraction, 0), 1) * 100;

  return (
    <div
      className="flex items-center gap-2"
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: meta.wash }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: meta.color }}
        />
      </div>
      <span
        className="tnum shrink-0 text-[11px] tabular-nums"
        style={{ color: "var(--text-secondary)" }}
      >
        {Math.round(pct)}%
      </span>
    </div>
  );
}
