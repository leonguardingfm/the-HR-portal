"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { QUEUE_EVENT, flushQueue, forget, queued, type QueueItem } from "@/lib/offline/queue";

const time = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/**
 * What is waiting on this phone to go to Control, and sending it: as soon as
 * the page opens, when signal returns, when the phone is picked up again, and
 * every thirty seconds while anything is waiting.
 */
export function useOutbox() {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [online, setOnline] = useState(true);
  const load = useCallback(() => void queued().then(setItems).catch(() => setItems([])), []);
  const flush = useCallback(() => {
    void flushQueue()
      .then((sent) => {
        if (sent) router.refresh();
      })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    load();
    flush();
    setOnline(navigator.onLine);
    const up = () => {
      setOnline(true);
      flush();
    };
    const down = () => setOnline(false);
    const seen = () => document.visibilityState === "visible" && flush();
    // The service worker sent something in the background.
    const fromWorker = (e: MessageEvent) => e.data?.type === "leon-queue-sent" && (load(), router.refresh());
    window.addEventListener(QUEUE_EVENT, load);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    document.addEventListener("visibilitychange", seen);
    navigator.serviceWorker?.addEventListener("message", fromWorker);
    return () => {
      window.removeEventListener(QUEUE_EVENT, load);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      document.removeEventListener("visibilitychange", seen);
      navigator.serviceWorker?.removeEventListener("message", fromWorker);
    };
  }, [load, flush, router]);

  const waiting = items.some((i) => i.status === "waiting");
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(flush, 30_000);
    return () => clearInterval(t);
  }, [waiting, flush]);

  return { items, online, flush };
}

/** The outbox, at the top of the officer's page whenever anything is in it. */
export function OutboxPanel({ items, online, flush }: ReturnType<typeof useOutbox>) {
  if (!items.length && online) return null;
  const waiting = items.filter((i) => i.status === "waiting");
  const refused = items.filter((i) => i.status === "refused");
  return (
    <section role="status" className="space-y-2 rounded-lg border p-3" style={{ borderColor: waiting.length || !online ? "var(--status-warning)" : "var(--status-critical)", background: waiting.length || !online ? "var(--wash-warning)" : "var(--wash-critical)", borderLeftWidth: 4 }}>
      {!online && <p className="text-[14px] font-semibold">📵 No signal. You can still book on and make check calls — they are kept on this phone and sent when signal returns.</p>}
      {waiting.length > 0 && (
        <>
          <p className="text-[14px] font-semibold">
            {waiting.length} waiting to send to Control{online ? " — sending now" : ""}
          </p>
          <ul className="space-y-1 text-[13px]">
            {waiting.map((i) => (
              <li key={i.id}>
                ⏳ {i.label}, made at {time(i.madeAt)}
              </li>
            ))}
          </ul>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            They count from when you made them. Keep the portal open if you can; it sends them the moment you have signal.
          </p>
          {online && (
            <button type="button" onClick={flush} className="text-[13px] underline underline-offset-2">
              Try sending now
            </button>
          )}
        </>
      )}
      {refused.map((i) => (
        <div key={i.id} className="rounded-md border p-2 text-[13px]" style={{ borderColor: "var(--status-critical)", background: "var(--surface-1)" }}>
          <p>
            <strong>Not accepted:</strong> {i.label}, made at {time(i.madeAt)} — {i.message} <strong>Ring Control.</strong>
          </p>
          <button type="button" onClick={() => void forget(i.id)} className="mt-1 text-[12px] underline underline-offset-2" style={{ color: "var(--text-secondary)" }}>
            I have rung Control — remove this
          </button>
        </div>
      ))}
    </section>
  );
}
