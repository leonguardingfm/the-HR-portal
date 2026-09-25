"use client";

import { useEffect } from "react";

/**
 * Keeps --shell-top-h equal to the height of the sticky top of the page — the
 * top bar and the alarm bar, which grows and shrinks as alarms come and go —
 * so anything else that sticks while scrolling stops just below it, rather
 * than behind it (26 September 2026).
 */
export function ShellTopHeight() {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-shell-top]");
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--shell-top-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return null;
}
