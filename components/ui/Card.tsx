import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  subtitle?: string;
  /** Right-aligned slot in the header — a legend, a filter, a link. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, subtitle, action, children, className = "" }: CardProps) {
  return (
    <section
      className={`rounded-lg border ${className}`}
      style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}
    >
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className="px-5 pb-5">{children}</div>
    </section>
  );
}
