import { INTERVIEW_STAGE_LABELS } from "@/lib/labels";
import type { InterviewStage } from "@/lib/types";

const GLYPH = { progress: "✓", hold: "…", reject: "✕" } as const;

/**
 * One chip per interview the candidate needs: passed, on hold, rejected, or
 * not yet held. Glyph and text together, never colour alone.
 */
export function InterviewChips({
  required,
  held,
}: {
  required: InterviewStage[];
  held: { stage: InterviewStage; outcome: "progress" | "hold" | "reject" }[];
}) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {required.map((stage) => {
        // The best outcome wins: a pass after an earlier hold is a pass.
        const outcomes = held.filter((h) => h.stage === stage).map((h) => h.outcome);
        const outcome = outcomes.includes("progress")
          ? "progress"
          : outcomes.includes("reject")
            ? "reject"
            : outcomes.includes("hold")
              ? "hold"
              : null;
        const style =
          outcome === "progress"
            ? { background: "var(--wash-good)", color: "var(--text-primary)" }
            : outcome === "reject"
              ? { background: "var(--wash-critical)", color: "var(--text-primary)" }
              : outcome === "hold"
                ? { background: "var(--wash-warning)", color: "var(--text-primary)" }
                : { background: "var(--wash-neutral)", color: "var(--text-muted)" };
        const state = outcome === "progress" ? "passed" : outcome === "reject" ? "rejected" : outcome === "hold" ? "on hold" : "not held";
        return (
          <span
            key={stage}
            title={`${INTERVIEW_STAGE_LABELS[stage]} interview: ${state}`}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap"
            style={style}
          >
            <span aria-hidden>{outcome ? GLYPH[outcome] : "○"}</span>
            {INTERVIEW_STAGE_LABELS[stage]}
            <span className="sr-only">: {state}</span>
          </span>
        );
      })}
    </span>
  );
}
