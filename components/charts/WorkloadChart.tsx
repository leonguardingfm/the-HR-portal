import { Legend } from "./Legend";
import { BarRow } from "./BarRow";

/**
 * Open work per owner, split by whether it is inside its service level.
 *
 * Two series, so a legend is always present. "Overdue" genuinely means a bad
 * state, so it takes a reserved status colour — and it carries a text label in
 * the legend and the tooltip so the colour is never the only channel.
 */
export function WorkloadChart({
  data,
}: {
  data: { owner: string; onTrack: number; overdue: number }[];
}) {
  const max = Math.max(...data.map((d) => d.onTrack + d.overdue));

  return (
    <div>
      <div className="mb-3">
        <Legend
          items={[
            { label: "Within service level", color: "var(--accent-text)" },
            { label: "Overdue", color: "var(--critical-text)" },
          ]}
        />
      </div>
      {data.map((d) => (
        <BarRow
          key={d.owner}
          label={d.owner}
          segments={[
            { value: d.onTrack, color: "var(--accent-text)", name: "Within service level" },
            ...(d.overdue > 0
              ? [{ value: d.overdue, color: "var(--critical-text)", name: "Overdue" }]
              : []),
          ]}
          maxValue={max}
          tipLabel={String(d.onTrack + d.overdue)}
          tooltip={`${d.owner}: ${d.onTrack} within service level, ${d.overdue} overdue`}
        />
      ))}
      <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Open tasks and files per owner. For balancing work, not for measuring
        people.
      </p>
    </div>
  );
}
