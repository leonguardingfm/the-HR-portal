import { StatusPill } from "@/components/ui/StatusPill";
import { BarRow } from "./BarRow";

/**
 * Median days in stage, with the agreed service level shown as a marker.
 *
 * One series, so one colour for every bar and no legend — the title names what
 * is plotted. Over-SLA stages are called out with a status pill rather than by
 * recolouring the bar, which would double-encode length as hue.
 */
export function StageSlaChart({
  data,
}: {
  data: { stage: string; actual: number; sla: number }[];
}) {
  const max = Math.max(...data.map((d) => Math.max(d.actual, d.sla))) * 1.1;

  return (
    <div>
      {data.map((d) => {
        const over = d.actual > d.sla;
        const ratio = d.actual / d.sla;
        return (
          <BarRow
            key={d.stage}
            label={d.stage}
            segments={[{ value: d.actual, color: "var(--accent-text)", name: "Median days" }]}
            maxValue={max}
            tipLabel={d.actual.toFixed(1)}
            marker={{ fraction: d.sla / max, label: `Service level ${d.sla} days` }}
            tooltip={`${d.stage}: median ${d.actual.toFixed(1)} days against a ${d.sla}-day service level`}
            trailing={
              over ? (
                <StatusPill
                  severity={ratio >= 2 ? "critical" : "serious"}
                  label={`${ratio.toFixed(1)}× SLA`}
                />
              ) : (
                <span className="w-16" />
              )
            }
          />
        );
      })}
      <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Median days in stage. The vertical tick on each bar is the agreed
        internal service level.
      </p>
    </div>
  );
}
