import Link from "next/link";
import { SEVERITY_META } from "@/lib/labels";
import type { Severity } from "@/lib/types";

interface StatTileProps {
  label: string;
  value: number | string;
  /** Secondary line — what the number is made of, not a restatement of it. */
  detail?: string;
  severity?: Severity;
  href?: string;
  /** Exactly one tile per view may be the hero. */
  hero?: boolean;
}

export function StatTile({
  label,
  value,
  detail,
  severity = "neutral",
  href,
  hero = false,
}: StatTileProps) {
  const meta = SEVERITY_META[severity];
  const showStatus = severity !== "neutral";

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] leading-tight" style={{ color: "var(--text-secondary)" }}>
          {label}
        </p>
        {showStatus && (
          <span aria-hidden style={{ color: meta.color, fontSize: "9px", lineHeight: "16px" }}>
            {meta.glyph}
          </span>
        )}
      </div>
      {/* Proportional figures deliberately — tabular-nums looks loose at size. */}
      <p
        className={`mt-2 font-semibold tracking-tight ${hero ? "text-5xl" : "text-2xl"}`}
        style={{ color: showStatus ? meta.color : "var(--text-primary)" }}
      >
        {value}
      </p>
      {detail && (
        <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
          {detail}
        </p>
      )}
      {showStatus && (
        <p className="mt-2 text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
          {meta.label}
        </p>
      )}
    </>
  );

  const className = `block rounded-lg border p-4 transition-colors ${
    href ? "hover:border-[color:var(--baseline)]" : ""
  }`;
  const style = {
    background: "var(--surface-1)",
    borderColor: showStatus ? meta.color : "var(--hairline)",
    borderLeftWidth: showStatus ? 3 : 1,
  };

  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {body}
      </Link>
    );
  }
  return (
    <div className={className} style={style}>
      {body}
    </div>
  );
}
