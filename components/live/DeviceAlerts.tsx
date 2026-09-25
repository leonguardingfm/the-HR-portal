"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeDevice, testAlert, unsubscribeDevice } from "@/lib/actions/alerts";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Alerts on this phone or computer: whether they are on, and the button that
 * turns them on. Once on, an alert arrives as a notification that buzzes the
 * phone or sits on the desk's screen, with the portal closed.
 *
 * iPhones only deliver them to the portal once it is on the home screen, so
 * on an iPhone in the browser this says how to do that instead.
 */

type DeviceState = "checking" | "unsupported" | "ios_install" | "blocked" | "off" | "on";

function toKey(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function useDeviceAlerts(vapidKey: string | null) {
  const [state, setState] = useState<DeviceState>("checking");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const check = useCallback(async () => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState(ios && !standalone ? "ios_install" : "unsupported");
      return;
    }
    if (!vapidKey) return setState("unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    setState(sub ? "on" : "off");
  }, [vapidKey]);

  useEffect(() => {
    void check();
  }, [check]);

  const turnOn = useCallback(async () => {
    if (!vapidKey) return;
    setBusy(true);
    setResult(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        setResult({ ok: false, message: "Alerts were not allowed. Allow notifications for this site in the browser's settings, then try again." });
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(vapidKey) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await subscribeDevice({ endpoint: json.endpoint, keys: json.keys }, navigator.userAgent);
      setResult(r);
      setState(r.ok ? "on" : "off");
    } catch {
      setResult({ ok: false, message: "This browser could not turn alerts on. Try again, or use Chrome, Edge, Firefox or Safari." });
    } finally {
      setBusy(false);
    }
  }, [vapidKey]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        setResult(await unsubscribeDevice(sub.endpoint));
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }, []);

  const test = useCallback(async () => {
    setBusy(true);
    try {
      setResult(await testAlert());
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, result, turnOn, turnOff, test, clear: () => setResult(null) };
}

const button = "inline-flex h-8 items-center rounded-md border px-3 text-[12px] font-medium disabled:opacity-60";

/** A compact line for a desk: status and the one button. */
export function DeviceAlertsInline({ vapidKey }: { vapidKey: string | null }) {
  const d = useDeviceAlerts(vapidKey);
  if (d.state === "checking" || d.state === "unsupported") return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[12px]">
      {d.state === "on" ? (
        <>
          <span style={{ color: "var(--good-text)" }}>● Desktop alerts on</span>
          <button type="button" onClick={d.test} disabled={d.busy} className={button} style={{ borderColor: "var(--hairline)" }}>
            Test
          </button>
        </>
      ) : d.state === "blocked" ? (
        <span style={{ color: "var(--text-secondary)" }}>Desktop alerts are blocked in this browser&apos;s settings</span>
      ) : d.state === "ios_install" ? null : (
        <button type="button" onClick={d.turnOn} disabled={d.busy} className={button} style={{ borderColor: "var(--hairline)", background: "var(--surface-1)" }}>
          {d.busy ? "Turning on…" : "Turn on desktop alerts"}
        </button>
      )}
      {d.result && (
        <span role="status" style={{ color: d.result.ok ? "var(--good-text)" : "var(--critical-text)" }}>
          {d.result.message}
        </span>
      )}
    </span>
  );
}

/** The officer's card: big, plain, and explains why it matters. */
export function DeviceAlertsCard({ vapidKey }: { vapidKey: string | null }) {
  const d = useDeviceAlerts(vapidKey);
  if (d.state === "checking" || d.state === "unsupported") return null;
  if (d.state === "on") {
    return (
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-[13px]" style={{ borderColor: "var(--hairline)" }}>
        <span style={{ color: "var(--good-text)" }}>● Alerts are on for this phone</span>
        <span className="flex gap-2">
          <button type="button" onClick={d.test} disabled={d.busy} className={button} style={{ borderColor: "var(--hairline)" }}>
            Send a test
          </button>
          <button type="button" onClick={d.turnOff} disabled={d.busy} className={button} style={{ borderColor: "var(--hairline)", color: "var(--text-secondary)" }}>
            Turn off
          </button>
        </span>
        {d.result && (
          <p role="status" className="w-full text-[12px]" style={{ color: d.result.ok ? "var(--good-text)" : "var(--critical-text)" }}>
            {d.result.message}
          </p>
        )}
      </section>
    );
  }
  return (
    <section className="space-y-2 rounded-lg border-2 px-4 py-3" style={{ borderColor: "var(--series-1)", background: "var(--surface-1)" }}>
      <h2 className="text-[15px] font-semibold">Turn on alerts for this phone</h2>
      <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
        So your phone buzzes when a shift needs confirming, you have not booked on, or a check call is due — even with the portal closed.
      </p>
      {d.state === "ios_install" ? (
        <p className="text-[13px]">
          On an iPhone: tap <strong>Share</strong> <span aria-hidden>⎋</span>, then <strong>Add to Home Screen</strong>. Open the portal from the new icon and turn alerts on there.
        </p>
      ) : d.state === "blocked" ? (
        <p className="text-[13px]" style={{ color: "var(--critical-text)" }}>
          Alerts are blocked for this site. Open your browser&apos;s settings, allow notifications for the portal, then come back.
        </p>
      ) : (
        <button type="button" onClick={d.turnOn} disabled={d.busy} className="h-12 w-full rounded-lg px-4 text-[15px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--series-1)" }}>
          {d.busy ? "Turning on…" : "Turn on alerts"}
        </button>
      )}
      {d.result && (
        <p role="status" className="text-[13px]" style={{ color: d.result.ok ? "var(--good-text)" : "var(--critical-text)" }}>
          {d.result.message}
        </p>
      )}
    </section>
  );
}
