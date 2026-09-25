"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLive } from "@/components/live/Live";
import { soundBeep } from "@/components/live/alarm";
import { saveSound } from "@/lib/actions/settings";
import type { HubNoticeView } from "@/lib/db/hub-queries";

/**
 * The Performance hub's notifications (Control, 25 September 2026): a stack
 * in the top-right corner that never takes the focus, never blocks typing and
 * fades by itself — critical ones stay longest. The bell keeps the last few
 * hours. Whether they sound is the person's own setting (My settings), and the
 * bell's switch changes the same setting.
 */

const LEVEL = {
  critical: { icon: "‼", colour: "var(--status-critical)", wash: "var(--wash-critical)", label: "Critical", stay: 45_000 },
  warning: { icon: "⚠", colour: "var(--status-warning)", wash: "var(--wash-warning)", label: "Warning", stay: 15_000 },
  info: { icon: "●", colour: "var(--series-1)", wash: "var(--surface-1)", label: "New", stay: 9_000 },
} as const;

const SEEN_KEY = "hub-notices-seen";
const OPENED_KEY = "hub-notices-opened";

const read = (k: string) => {
  try {
    return window.sessionStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    window.sessionStorage.setItem(k, v);
  } catch {}
};

export function HubToasts({ soundOn = true }: { soundOn?: boolean }) {
  const { notices } = useLive();
  const [toasts, setToasts] = useState<HubNoticeView[]>([]);
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(soundOn);
  const [opened, setOpened] = useState(0);
  const seen = useRef<number | null>(null);
  // Just below the top bar and the Control alarm bar, never over their buttons.
  const [top, setTop] = useState(64);
  useEffect(() => {
    const place = () => {
      const bar = document.querySelector("[data-shell-top]");
      if (bar) setTop(Math.max(8, Math.round(bar.getBoundingClientRect().bottom) + 8));
    };
    place();
    const bar = document.querySelector("[data-shell-top]");
    const ro = bar && "ResizeObserver" in window ? new ResizeObserver(place) : null;
    if (bar && ro) ro.observe(bar);
    window.addEventListener("resize", place);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", place);
    };
  }, []);

  useEffect(() => {
    setOpened(Number(read(OPENED_KEY) ?? 0));
  }, []);
  useEffect(() => setSound(soundOn), [soundOn]);

  useEffect(() => {
    const newest = notices[0]?.seq ?? 0;
    // First look: what is already there is history, not news.
    if (seen.current === null) {
      const stored = Number(read(SEEN_KEY) ?? NaN);
      seen.current = Number.isFinite(stored) ? stored : newest;
    }
    const fresh = notices.filter((n) => n.seq > (seen.current ?? 0)).reverse();
    if (!fresh.length) return;
    seen.current = newest;
    write(SEEN_KEY, String(newest));
    setToasts((t) => [...fresh.slice(-4).reverse(), ...t].slice(0, 5));
    const loudest = fresh.some((n) => n.level === "critical") ? "critical" : fresh.some((n) => n.level === "warning") ? "warning" : "info";
    if (sound && loudest !== "info") soundBeep(loudest === "critical");
    for (const n of fresh) setTimeout(() => setToasts((t) => t.filter((x) => x.seq !== n.seq)), LEVEL[n.level].stay);
  }, [notices, sound]);

  const unread = notices.filter((n) => n.seq > opened).length;
  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    void saveSound(next);
  };

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            const newest = notices[0]?.seq ?? 0;
            setOpened(newest);
            write(OPENED_KEY, String(newest));
          }}
          aria-label={`Hub notifications${unread ? `, ${unread} new` : ""}`}
          aria-expanded={open}
          className="relative flex h-7 w-8 items-center justify-center rounded border text-[13px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}
        >
          <span aria-hidden>🔔</span>
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-semibold text-white" style={{ background: "var(--status-critical)" }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
        {open && (
          <div className="absolute right-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border shadow-lg" style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}>
            <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--hairline)" }}>
              <p className="text-[12px] font-semibold">Hub notifications</p>
              <label className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={sound} onChange={toggleSound} className="h-3.5 w-3.5" />
                Sound
              </label>
            </div>
            <ul className="max-h-[60vh] divide-y overflow-y-auto" style={{ borderColor: "var(--hairline)" }}>
              {notices.length === 0 && (
                <li className="px-3 py-4 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Nothing in the last three hours.
                </li>
              )}
              {notices.map((n) => (
                <li key={n.seq} style={{ borderColor: "var(--hairline)" }}>
                  <Link href={n.href} onClick={() => setOpen(false)} className="flex gap-2 px-3 py-2 text-[12px] hover:bg-[var(--wash)]">
                    <span aria-hidden style={{ color: LEVEL[n.level].colour }}>
                      {LEVEL[n.level].icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="sr-only">{LEVEL[n.level].label}: </span>
                      {n.text}
                      <span className="block text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {new Date(n.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* The stack: never in the way of what is being typed. */}
      <div className="pointer-events-none fixed right-3 z-40 flex w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col gap-2 print:hidden" style={{ top }}>
        {toasts.map((n) => {
          const l = LEVEL[n.level];
          return (
            <div
              key={n.seq}
              role={n.level === "critical" ? "alert" : "status"}
              className="pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12px] shadow-md"
              style={{ background: `linear-gradient(${l.wash}, ${l.wash}), var(--surface-1)`, borderColor: l.colour, borderLeftWidth: 4 }}
            >
              <span aria-hidden className="mt-0.5 font-bold" style={{ color: l.colour }}>
                {l.icon}
              </span>
              <Link href={n.href} tabIndex={-1} className="min-w-0 flex-1 leading-snug" style={{ color: "var(--text-primary)" }}>
                {/* The words say what it is, not only the colour — once. */}
                {!n.text.startsWith(l.label) && <span className="font-semibold">{l.label}: </span>}
                {n.text}
              </Link>
              <button type="button" tabIndex={-1} onClick={() => setToasts((t) => t.filter((x) => x.seq !== n.seq))} aria-label="Dismiss" className="-mt-0.5 px-1 text-[14px] leading-none" style={{ color: "var(--text-muted)" }}>
                ×
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
