"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A panel from the right: over the roster, closed with Escape or a click outside. */
export function Drawer({
  title,
  subtitle,
  urgent = false,
  wide = false,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  urgent?: boolean;
  /** Room for a calendar of two months side by side. */
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  // Straight into the first box, and back where you were on closing.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    body.current?.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])")?.focus();
    return () => before?.focus?.();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end print:hidden" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0" style={{ background: "rgb(0 0 0 / 0.3)" }} />
      <div className={`relative flex h-full w-full flex-col border-l shadow-xl ${wide ? "max-w-[46rem]" : "max-w-[32rem]"}`} style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}>
        <header
          className="flex items-start justify-between gap-3 border-b px-5 pt-4 pb-3"
          style={{ borderColor: "var(--hairline)", background: urgent ? "var(--status-critical)" : undefined, color: urgent ? "#fff" : undefined }}
        >
          <div className="min-w-0">
            <h2 id="drawer-title" className="text-[15px] font-semibold tracking-tight">
              {title}
            </h2>
            <p className="text-[12px]" style={{ color: urgent ? "#fff" : "var(--text-secondary)" }}>
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 shrink-0 rounded-md border px-3 text-[12px]"
            style={{ borderColor: urgent ? "rgb(255 255 255 / 0.6)" : "var(--hairline)", color: urgent ? "#fff" : undefined }}
          >
            Close
          </button>
        </header>
        <div ref={body} className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

