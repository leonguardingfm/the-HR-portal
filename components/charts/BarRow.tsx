import type { ReactNode } from "react";

/**
 * Shared horizontal-bar row.
 *
 * Mark specs: bar capped at 14px so the band keeps its air, 4px rounded
 * data-end with a square baseline, hairline track, and a hover tooltip on every
 * mark. Stacked segments are separated by a 2px gap in the surface colour —
 * never by a stroke around the mark.
 */
export function BarRow({
  label,
  segments,
  maxValue,
  tipLabel,
  trailing,
  tooltip,
  marker,
}: {
  label: string;
  segments: { value: number; color: string; name: string }[];
  maxValue: number;
  tipLabel: string;
  /** Optional right-hand slot, e.g. a status pill for an over-SLA stage. */
  trailing?: ReactNode;
  tooltip: string;
  /** Optional reference marker (the agreed service level) as a fraction 0..1. */
  marker?: { fraction: number; label: string };
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="group relative grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-3 py-1.5">
      <span className="truncate text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>

      <div className="relative h-3.5">
        <div
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
          style={{ background: "var(--gridline)" }}
        />
        <div className="absolute inset-y-0 left-0 flex w-full items-center">
          <div
            className="flex h-3.5 items-stretch"
            style={{ width: `${(total / maxValue) * 100}%` }}
          >
            {segments.map((seg, i) => (
              <div
                key={seg.name}
                style={{
                  flexGrow: seg.value,
                  background: seg.color,
                  /* 2px surface gap separates touching segments */
                  marginLeft: i === 0 ? 0 : 2,
                  /* square at the baseline, 4px rounded at the data end */
                  borderTopRightRadius: i === segments.length - 1 ? 4 : 0,
                  borderBottomRightRadius: i === segments.length - 1 ? 4 : 0,
                }}
              />
            ))}
          </div>
        </div>
        {/* Reference marker. Taller than the bar and carrying a surface ring,
            so it stays legible where it crosses the fill. */}
        {marker && (
          <div
            className="pointer-events-none absolute top-1/2 h-[18px] w-0.5 -translate-y-1/2"
            style={{
              left: `${Math.min(marker.fraction, 1) * 100}%`,
              background: "var(--text-secondary)",
              boxShadow: "0 0 0 1px var(--surface-1)",
            }}
            aria-label={marker.label}
            title={marker.label}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <span
          className="tnum w-12 text-right text-[12px] font-medium tabular-nums"
          style={{ color: "var(--text-primary)" }}
        >
          {tipLabel}
        </span>
        {trailing}
      </div>

      {/* Hover layer: every mark is inspectable. */}
      <div
        role="tooltip"
        className="pointer-events-none absolute left-40 top-0 z-10 hidden -translate-y-full rounded border px-2 py-1 text-[11px] whitespace-nowrap shadow-sm group-hover:block"
        style={{
          background: "var(--surface-1)",
          borderColor: "var(--hairline)",
          color: "var(--text-primary)",
        }}
      >
        {tooltip}
      </div>
    </div>
  );
}
