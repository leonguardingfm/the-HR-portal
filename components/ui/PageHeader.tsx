import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {description}
          </p>
        )}
      </div>
      {/* max-w-full so a wide slot can wrap: a shrink-0 box sizes to max-content,
          which at phone width pushed the page wider than the viewport (as in Card). */}
      {action && <div className="max-w-full min-w-0 shrink-0">{action}</div>}
    </header>
  );
}
