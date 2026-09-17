import { BarRow } from "./BarRow";

/**
 * Pipeline funnel.
 *
 * Ordered stages, but a single hue: the bar length already carries magnitude
 * and the axis order carries the sequence, so an ordinal ramp would double-
 * encode. (The blue ordinal ramp only validates to five steps on the light
 * surface; this funnel has eight stages, so one hue is also the correct call.)
 *
 * The largest drop-off is the story, so only that transition is labelled.
 */
export function FunnelChart({
  data,
}: {
  data: { stage: string; count: number }[];
}) {
  const max = Math.max(...data.map((d) => d.count));

  // Find the steepest fall between consecutive stages — the one worth naming.
  let worstIndex = -1;
  let worstDrop = 0;
  for (let i = 1; i < data.length; i++) {
    const drop = (data[i - 1].count - data[i].count) / data[i - 1].count;
    if (drop > worstDrop) {
      worstDrop = drop;
      worstIndex = i;
    }
  }

  return (
    <div>
      {data.map((d, i) => {
        const prev = i > 0 ? data[i - 1].count : null;
        const dropPct = prev ? Math.round(((prev - d.count) / prev) * 100) : null;
        return (
          <BarRow
            key={d.stage}
            label={d.stage}
            segments={[{ value: d.count, color: "var(--series-1)", name: d.stage }]}
            maxValue={max}
            tipLabel={String(d.count)}
            tooltip={
              dropPct === null
                ? `${d.stage}: ${d.count}`
                : `${d.stage}: ${d.count} (${dropPct}% fewer than the stage above)`
            }
            trailing={
              i === worstIndex ? (
                <span
                  className="tnum text-[11px] font-medium tabular-nums"
                  style={{ color: "var(--text-secondary)" }}
                >
                  −{dropPct}% ←
                </span>
              ) : (
                <span className="w-16" />
              )
            }
          />
        );
      })}
      <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Last 90 days. The arrow marks the steepest drop-off.
      </p>
    </div>
  );
}
