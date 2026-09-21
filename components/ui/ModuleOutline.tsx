import { Card } from "./Card";
import { ClauseRef } from "./StatusPill";

export interface OutlineItem {
  label: string;
  detail: string;
  /** BS 7858 clause, where the item exists to satisfy the standard. */
  clause?: string;
  /** Delivery phase within the HR programme. */
  phase?: 1 | 2 | 3 | 4;
  /** Platform release, where the item belongs to the wider programme. Wins
   *  over `phase` when both are set — see docs/platform/03. */
  release?: string;
}

/**
 * What a module will hold, and in which delivery phase.
 *
 * Shown on modules whose screens are not built yet, so the navigation is
 * honest about what exists rather than leading to a blank page.
 */
export function ModuleOutline({
  items,
  note,
  subtitle = "From the agreed proposal in docs/proposal. Phase 1 is the spine; phase 2 is the automation; phase 3 the integrations.",
}: {
  items: OutlineItem[];
  note?: string;
  subtitle?: string;
}) {
  return (
    <Card title="Planned contents" subtitle={subtitle}>
      <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
        {items.map((item) => (
          <li key={item.label} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0 max-w-2xl flex-1">
              <p className="text-[13px] font-medium">
                {item.label}
                {item.clause && (
                  <>
                    {" "}
                    <ClauseRef clause={item.clause} />
                  </>
                )}
              </p>
              <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                {item.detail}
              </p>
            </div>
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap"
              style={{ background: "var(--wash-neutral)", color: "var(--text-secondary)" }}
            >
              {item.release ?? `Phase ${item.phase}`}
            </span>
          </li>
        ))}
      </ul>
      {note && (
        <p className="mt-4 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {note}
        </p>
      )}
    </Card>
  );
}
