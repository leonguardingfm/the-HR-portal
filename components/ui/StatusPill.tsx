import { SEVERITY_META } from "@/lib/labels";
import type { Severity } from "@/lib/types";

/**
 * A status colour never carries meaning alone — every pill ships the reserved
 * status colour together with a glyph and a text label.
 */
export function StatusPill({
  severity,
  label,
  wrap = false,
}: {
  severity: Severity;
  label?: string;
  /** Long labels in narrow places: let the pill wrap rather than push the page wide. */
  wrap?: boolean;
}) {
  const meta = SEVERITY_META[severity];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${wrap ? "" : "whitespace-nowrap"}`}
      style={{ background: meta.wash, color: "var(--text-primary)" }}
    >
      <span aria-hidden style={{ color: meta.color, fontSize: "9px", lineHeight: 1 }}>
        {meta.glyph}
      </span>
      {label ?? meta.label}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap"
      style={{ background: "var(--wash-neutral)", color: "var(--text-secondary)" }}
    >
      {children}
    </span>
  );
}

/** BS 7858 clause reference, shown wherever a rule is being applied. */
export function ClauseRef({ clause }: { clause: string }) {
  return (
    <span
      className="tnum text-[10px] font-medium"
      style={{ color: "var(--text-muted)" }}
      title={`BS 7858:2019, clause ${clause}`}
    >
      {clause}
    </span>
  );
}
