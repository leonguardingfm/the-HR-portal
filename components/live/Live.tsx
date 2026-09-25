"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Pulse, PulseAlert } from "@/lib/db/pulse";
import type { HubNoticeView } from "@/lib/db/hub-queries";
import { unlockAlarm } from "./alarm";

/**
 * Keeps every open screen current without anybody pressing reload.
 *
 * Every few seconds the screen asks the server's pulse whether anything has
 * changed; when it has, the page's data is fetched again and merged in — what
 * is being typed, what is open and where the page is scrolled all stay as they
 * were. While somebody is typing, the refresh waits until they stop, so a form
 * is never pulled out from under them.
 *
 * The alerts that come with the pulse feed the alarm bar straight away, typing
 * or not: an alarm does not wait for a form to be finished.
 */

interface LiveState {
  alerts: PulseAlert[];
  /** The Performance hub's notifications, newest first. */
  notices: HubNoticeView[];
  /** When the screen last had fresh data. */
  updatedAt: Date | null;
  /** The pulse could not be reached — the screen may be out of date. */
  stale: boolean;
  watches: boolean;
  officer: boolean;
  /** Ask the pulse now, not at the next tick. */
  poke: () => void;
}

const LiveContext = createContext<LiveState>({ alerts: [], notices: [], updatedAt: null, stale: false, watches: false, officer: false, poke: () => {} });

export const useLive = () => useContext(LiveContext);

/** Control asks every few seconds; a phone less often, and only while it is being looked at. */
const EVERY_MS = { watcher: 6_000, officer: 15_000, other: 20_000 } as const;
/** Lists that change with the clock alone are fetched again at least this often. */
const AT_LEAST_EVERY_MS = 5 * 60_000;

function typing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && !["button", "submit", "checkbox", "radio"].includes((el as HTMLInputElement).type)) || el.isContentEditable;
}

export function LiveProvider({ initial, watches, officer, hub = false, children }: { initial: Pulse; watches: boolean; officer: boolean; hub?: boolean; children: ReactNode }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState<PulseAlert[]>(initial.alerts);
  const [notices, setNotices] = useState<HubNoticeView[]>(initial.notices ?? []);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [stale, setStale] = useState(false);
  const version = useRef(initial.v);
  const pendingRefresh = useRef(false);
  const lastRefresh = useRef(Date.now());
  const inFlight = useRef(false);

  const refresh = useCallback(() => {
    if (typing()) {
      pendingRefresh.current = true;
      return;
    }
    pendingRefresh.current = false;
    lastRefresh.current = Date.now();
    router.refresh();
    setUpdatedAt(new Date());
  }, [router]);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // "Here" only while the screen is in front of them: a tab left open overnight is not someone on shift.
      const res = await fetch(document.visibilityState === "visible" ? "/api/pulse?here=1" : "/api/pulse", { cache: "no-store", credentials: "same-origin" });
      if (res.status === 401) {
        // Signed out elsewhere, or the session ran out: go and sign in.
        window.location.assign("/signin");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const p = (await res.json()) as Pulse;
      setStale(false);
      setAlerts(p.alerts);
      setNotices(p.notices ?? []);
      if (p.v !== version.current) {
        version.current = p.v;
        refresh();
      } else if (pendingRefresh.current || Date.now() - lastRefresh.current > AT_LEAST_EVERY_MS) {
        refresh();
      } else {
        setUpdatedAt(new Date());
      }
    } catch {
      setStale(true);
    } finally {
      inFlight.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    setUpdatedAt(new Date());
    // The hub's clocks count minutes, so anyone working a mailbox is asked as often as Control.
    const every = watches || hub ? EVERY_MS.watcher : officer ? EVERY_MS.officer : EVERY_MS.other;
    const id = setInterval(() => {
      // A phone in a pocket is not polled; it is told by a push instead.
      if (!watches && document.visibilityState !== "visible") return;
      void poll();
    }, every);
    const onVisible = () => document.visibilityState === "visible" && void poll();
    // A refresh put off while somebody typed happens as soon as they stop.
    const onBlur = () => pendingRefresh.current && setTimeout(() => !typing() && refresh(), 300);
    const onUnlock = () => unlockAlarm();
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("focusout", onBlur);
    window.addEventListener("pointerdown", onUnlock, { passive: true });
    window.addEventListener("keydown", onUnlock);
    window.addEventListener("online", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("focusout", onBlur);
      window.removeEventListener("pointerdown", onUnlock);
      window.removeEventListener("keydown", onUnlock);
      window.removeEventListener("online", onVisible);
    };
  }, [poll, refresh, watches, officer, hub]);

  // The service worker: alerts to this device, and a nudge to poll the moment
  // a push arrives while the portal is open.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    const onMessage = (e: MessageEvent) => e.data?.type === "leon-alert" && void poll();
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [poll]);

  return (
    <LiveContext.Provider value={{ alerts, notices, updatedAt, stale, watches, officer, poke: () => void poll() }}>{children}</LiveContext.Provider>
  );
}
