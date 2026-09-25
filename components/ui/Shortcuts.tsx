"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keyboard shortcuts for a desk worked all day (Control, 26 September 2026).
 * A key either runs a handler given here, or clicks the visible control marked
 * data-shortcut="<key>" — so a shortcut does exactly what the button does,
 * with the same checks. Never while typing, never with Ctrl/⌘/Alt held, and
 * never behind an open drawer. "?" lists them.
 */
export type ShortcutKey = { keys: string; what: string };

const typing = (el: EventTarget | null) => el instanceof HTMLElement && !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
const visible = (el: HTMLElement) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

/** Clicks the visible, enabled control for a key. True when there was one. */
export function pressShortcut(key: string, within: ParentNode = document) {
  const el = [...within.querySelectorAll<HTMLElement>(`[data-shortcut="${CSS.escape(key)}"]`)].find((x) => visible(x) && !(x as HTMLButtonElement).disabled);
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.focus();
  else el.click();
  return true;
}

export function Shortcuts({ list, handlers = {} }: { list: ShortcutKey[]; handlers?: Record<string, () => void> }) {
  const [help, setHelp] = useState(false);
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || typing(e.target)) return;
      // Enter on a focused link or button is that link or button's.
      if (e.key === "Enter" && e.target instanceof HTMLElement && e.target.closest("a, button, summary, [role='button'], [role='menuitem'], [role='menuitemradio']")) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelp((h) => !h);
        return;
      }
      const run = ref.current[e.key];
      if (run) {
        e.preventDefault();
        run();
      } else if (pressShortcut(e.key)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button type="button" onClick={() => setHelp(true)} className="hidden h-8 rounded-md border px-2.5 text-[11px] md:inline-block" style={{ borderColor: "var(--hairline)", color: "var(--text-secondary)" }} aria-label="Keyboard shortcuts">
        Shortcuts <kbd className="ml-0.5 rounded border px-1 font-mono text-[10px]" style={{ borderColor: "var(--hairline)" }}>?</kbd>
      </button>
      {help && <ShortcutHelp list={list} onClose={() => setHelp(false)} />}
    </>
  );
}

function ShortcutHelp({ list, onClose }: { list: ShortcutKey[]; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => (e.key === "Escape" || e.key === "?") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0" style={{ background: "rgb(0 0 0 / 0.3)" }} />
      <div className="relative w-full max-w-sm rounded-lg border p-5 shadow-xl" style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}>
        <div className="mb-3 flex items-center justify-between">
          <h2 id="shortcuts-title" className="text-[15px] font-semibold">
            Keyboard shortcuts
          </h2>
          <button ref={close} type="button" onClick={onClose} className="h-8 rounded-md border px-3 text-[12px]" style={{ borderColor: "var(--hairline)" }}>
            Close
          </button>
        </div>
        <dl className="space-y-1.5 text-[13px]">
          {list.map((s) => (
            <div key={s.keys} className="flex items-baseline justify-between gap-4">
              <dt className="shrink-0">
                {s.keys.split(" ").map((k, i) => (
                  <kbd key={i} className="mr-1 inline-block min-w-[1.6rem] rounded border px-1.5 py-0.5 text-center font-mono text-[11px]" style={{ borderColor: "var(--hairline)", background: "var(--wash)" }}>
                    {k}
                  </kbd>
                ))}
              </dt>
              <dd className="text-right" style={{ color: "var(--text-secondary)" }}>
                {s.what}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
          They do nothing while you are typing in a box.
        </p>
      </div>
    </div>
  );
}
