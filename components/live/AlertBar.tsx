"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { StatusPill } from "@/components/ui/StatusPill";
import { useNow } from "@/components/ui/useNow";
import { alertKind, startsIn } from "@/lib/core/alerts";
import type { PulseAlert } from "@/lib/db/pulse";
import { formatTime } from "@/lib/format";
import { alarmReady, soundAlarm, soundBeep } from "./alarm";
import { DeviceAlertsInline } from "./DeviceAlerts";
import { useLive } from "./Live";

/**
 * The alarm, on every page (Control, 25 September 2026).
 *
 * For Control: a red bar across the top whenever anything needs action now —
 * how many, the next shift nobody is on and how soon it starts, and the way to
 * each. A new alert gives a soft beep — not a siren, to keep the office calm —
 * flashes the tab, and beeps again every thirty seconds until somebody presses
 * Acknowledge; a newer alert starts it again.
 * With nothing to do it is one quiet line saying the screen is live.
 *
 * For an officer: their own alert, in red, with the siren and the phone's
 * vibration, until they act on it or say they have seen it.
 *
 * Acknowledging is per screen: it silences this desk, it does not close the
 * alert. The alert closes when the thing is put right.
 */

/** How often an unacknowledged alert sounds again: the officer's siren sooner, the office beep less often. */
const REPEAT_MS = { officer: 20_000, office: 30_000 } as const;
const ACK_KEY = "leon-alerts-acknowledged";

function readAck(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(ACK_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function writeAck(ids: Set<string>) {
  try {
    window.localStorage.setItem(ACK_KEY, JSON.stringify([...ids].slice(-500)));
  } catch {}
}

const LABELS: Partial<Record<ReturnType<typeof alertKind>, [string, string]>> = {
  hub_critical: ["critical email with no owner", "critical emails with no owner"],
  uncovered: ["uncovered shift", "uncovered shifts"],
  missed: ["missed check call", "missed check calls"],
  no_book_on: ["not booked on", "not booked on"],
  chase: ["chase-up to make", "chase-ups to make"],
  cannot_attend: ["cannot attend", "cannot attend"],
  problem: ["officer reporting a problem", "officers reporting a problem"],
  incident: ["incident", "incidents"],
  running_late: ["running late", "running late"],
  away_from_site: ["selfie away from the site", "selfies away from the site"],
  no_photo: ["book-on without a selfie", "book-ons without a selfie"],
};

export function AlertBar({ vapidKey }: { vapidKey: string | null }) {
  const { alerts, watches, officer, updatedAt, stale } = useLive();
  const now = useNow(1_000);
  const [ack, setAck] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const lastSound = useRef(0);
  const baseTitle = useRef<string | null>(null);

  useEffect(() => setAck(readAck()), []);

  const unacked = useMemo(() => alerts.filter((a) => !ack.has(a.id)), [alerts, ack]);
  // News — "Control has put you on…" — is shown, not sounded.
  const sounding = useMemo(() => unacked.filter((a) => a.severity !== "neutral"), [unacked]);
  const loud = sounding.some((a) => a.severity === "critical" || a.severity === "serious");
  const newest = sounding[0];

  // The siren: at once for a new alert, then every twenty seconds while any
  // is unacknowledged.
  useEffect(() => {
    if (!now || sounding.length === 0) {
      setNeedsTap(false);
      return;
    }
    if (now.getTime() - lastSound.current < (officer ? REPEAT_MS.officer : REPEAT_MS.office)) return;
    // Officers get the siren; staff screens a soft beep, to keep the office calm.
    const played = officer ? soundAlarm(loud) : soundBeep(loud);
    setNeedsTap(!played && !alarmReady());
    if (played) lastSound.current = now.getTime();
  }, [now, sounding.length, loud, officer]);

  // A new alert restarts the siren straight away.
  const newestId = newest?.id;
  useEffect(() => {
    if (newestId) lastSound.current = 0;
  }, [newestId]);

  // The tab flashes while anything is unacknowledged — seen from another tab.
  useEffect(() => {
    if (baseTitle.current === null) baseTitle.current = document.title;
    if (!now) return;
    document.title = sounding.length && now.getSeconds() % 2 === 0 ? `(${sounding.length}) ⚠ Needs action` : baseTitle.current ?? document.title;
  }, [now, sounding.length]);
  useEffect(() => () => void (baseTitle.current && (document.title = baseTitle.current)), []);

  const acknowledge = () => {
    const next = new Set([...ack, ...alerts.map((a) => a.id)]);
    setAck(next);
    writeAck(next);
  };

  if (!watches && !officer) return null;

  if (officer) {
    if (alerts.length === 0) return null;
    const first = alerts.find((a) => a.severity !== "neutral") ?? alerts[0];
    const urgent = first.severity !== "neutral";
    return (
      <div role="alert" className={`border-b px-4 py-3 ${urgent && sounding.length ? "alert-flash" : ""}`} style={{ background: urgent ? "var(--status-critical)" : "var(--series-1)", color: "#fff", borderColor: "transparent" }}>
        <div className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold">
            {urgent ? "⚠ " : ""}
            {first.title.split(". ")[0]}
          </p>
          {unacked.some((a) => a.id === first.id) ? (
            <button type="button" onClick={acknowledge} className="h-9 rounded-md bg-white px-3 text-[13px] font-semibold" style={{ color: urgent ? "var(--critical-text)" : "var(--accent-text)" }}>
              {urgent ? "I've seen it" : "OK"}
            </button>
          ) : (
            <Link href="/me" className="text-[13px] underline">
              Go to my duty
            </Link>
          )}
          {needsTap && <p className="w-full text-[12px]">Tap anywhere so the alarm can sound.</p>}
        </div>
      </div>
    );
  }

  // Control.
  if (alerts.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-1.5 text-[12px] sm:px-6 print:hidden" style={{ borderColor: "var(--hairline)", color: "var(--text-secondary)" }}>
        <span>
          <span style={{ color: stale ? "var(--serious-text)" : "var(--good-text)" }}>●</span> {stale ? "Reconnecting — this screen may be out of date" : "Live"}
          {updatedAt && !stale && ` · updated ${formatTime(updatedAt)}`} · No alerts
        </span>
        <DeviceAlertsInline vapidKey={vapidKey} />
      </div>
    );
  }

  const counts = new Map<string, number>();
  for (const a of alerts) {
    const k = alertKind(a.title);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const uncovered = alerts.filter((a) => alertKind(a.title) === "uncovered" && a.startsAt).sort((a, b) => a.startsAt!.localeCompare(b.startsAt!));
  const next = uncovered[0];

  return (
    <div className={`border-b print:hidden ${sounding.length ? "alert-flash" : ""}`} style={{ background: "var(--status-critical)", color: "#fff", borderColor: "transparent" }} role="alert" aria-live="assertive">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <p className="text-[14px] font-semibold">
          ⚠ {alerts.length} need{alerts.length === 1 ? "s" : ""} action now
        </p>
        <p className="min-w-0 flex-1 text-[13px]">
          {[...counts]
            .map(([k, n]) => {
              const l = LABELS[k as keyof typeof LABELS];
              return l ? `${n} ${n === 1 ? l[0] : l[1]}` : null;
            })
            .filter(Boolean)
            .join(" · ")}
          {next && now && (
            <>
              {" — next uncovered: "}
              <strong>{next.title.split(": ")[1]?.split(" — ")[0]}</strong>, {startsIn(new Date(next.startsAt!), now)}
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {next && (
            <Link href={next.href} className="inline-flex h-8 items-center rounded-md bg-white px-3 text-[12px] font-semibold" style={{ color: "var(--critical-text)" }}>
              Find cover
            </Link>
          )}
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex h-8 items-center rounded-md border border-white/60 px-3 text-[12px] font-medium">
            {open ? "Hide" : "Show all"}
          </button>
          {sounding.length > 0 && (
            <button type="button" onClick={acknowledge} className="inline-flex h-8 items-center rounded-md border border-white/60 px-3 text-[12px] font-medium">
              Acknowledge
            </button>
          )}
        </div>
      </div>
      {needsTap && <p className="px-4 pb-2 text-[12px] sm:px-6">Click anywhere on the page so the alarm can sound.</p>}
      {open && <AlertList alerts={alerts} now={now} />}
    </div>
  );
}

function AlertList({ alerts, now }: { alerts: PulseAlert[]; now: Date | null }) {
  return (
    <ul className="max-h-[50vh] divide-y overflow-y-auto border-t text-[13px]" style={{ background: "var(--page)", color: "var(--text-primary)", borderColor: "var(--hairline)" }}>
      {alerts.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6" style={{ borderColor: "var(--hairline)" }}>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{a.title}</p>
            <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Raised {formatTime(a.at)}
              {a.startsAt && now ? ` · ${startsIn(new Date(a.startsAt), now)}` : ""} · {a.takenBy ? `${a.takenBy} is on it` : "nobody has taken it yet"}
            </p>
          </div>
          <StatusPill severity={a.severity} label={a.severity === "critical" ? "Now" : a.severity === "serious" ? "Soon" : "Watch"} />
          <Link href={a.href} className="inline-flex h-7 items-center rounded-md border px-2.5 text-[12px] font-medium" style={{ borderColor: "var(--hairline)" }}>
            Open
          </Link>
        </li>
      ))}
    </ul>
  );
}
