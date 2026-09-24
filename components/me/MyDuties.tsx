"use client";

import { useMemo, useState } from "react";
import { CallTimeline, relative } from "@/components/duty/DutyShared";
import { useNow } from "@/components/ui/useNow";
import type { ActionResult } from "@/lib/actions/types";
import { DUTY_RULES, dutyStatus, type DutyStatus } from "@/lib/core/duty";
import { dayLabel, ukDate } from "@/lib/core/rota";
import type { LiveRow } from "@/lib/db/queries";
import { formatTime } from "@/lib/format";
import { BookOnButton, CannotMakeItForm, CheckCallButtons, ConfirmButton } from "./MyForms";

type Duty = LiveRow & { s: DutyStatus; start: Date; end: Date };

/**
 * The officer's own portal: their duties and nothing else. The shift that is
 * on now — or the next one — is at the top with the one thing to do next:
 * confirm, book on, or make the check call. Below it, what is coming and what
 * is done. Built for a phone, in a car park, at night.
 */
export function MyDuties({ rows, alerts, name, pin }: { rows: LiveRow[]; alerts: { id: string; title: string; at: string }[]; name: string; pin: string | null }) {
  const now = useNow(30_000);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const duties = useMemo<Duty[]>(
    () => (now ? rows.map((r) => ({ ...r, s: dutyStatus(r, now), start: new Date(r.assignment.startsAt), end: new Date(r.assignment.endsAt) })) : []),
    [rows, now],
  );
  if (!now) {
    return <p className="py-8 text-center text-[14px]" style={{ color: "var(--text-muted)" }}>Loading your duties…</p>;
  }

  const live = duties.filter((d) => d.state !== "cancelled");
  const current = live.find((d) => d.start <= now && now < d.end);
  const upcoming = live.filter((d) => d.start > now).sort((a, b) => a.start.getTime() - b.start.getTime());
  const next = current ?? upcoming[0];
  const later = upcoming.filter((d) => d !== next);
  const done = live.filter((d) => d.end <= now).sort((a, b) => b.start.getTime() - a.start.getTime());
  const off = duties.filter((d) => d.state === "cancelled" && d.end > now);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">My duties</h1>
        <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
          {name.split(" ")[0]}
          {pin && ` · PIN ${pin}`} · {dayLabel(ukDate(now))} {formatTime(now)}
        </p>
      </header>

      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-[14px]" style={{ borderColor: notice.ok ? "var(--status-good)" : "var(--status-critical)", background: notice.ok ? "var(--wash-good)" : "var(--wash-critical)" }}>
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" style={{ color: "var(--text-secondary)" }}>
            ✕
          </button>
        </div>
      )}

      {alerts.length > 0 && (
        <section aria-labelledby="alerts-h" className="rounded-lg border-2 px-4 py-3" style={{ borderColor: "var(--status-critical)", background: "var(--wash-critical)" }}>
          <h2 id="alerts-h" className="text-[14px] font-semibold" style={{ color: "var(--status-critical)" }}>
            Needs your action · {alerts.length}
          </h2>
          <ul className="mt-1 space-y-1.5">
            {alerts.map((a) => (
              <li key={a.id} className="text-[14px]">
                {a.title}
                <span className="ml-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  · {formatTime(a.at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {next ? <NowCard d={next} now={now} onResult={setNotice} /> : (
        <section className="rounded-lg border px-4 py-6 text-center text-[14px]" style={{ borderColor: "var(--hairline)", color: "var(--text-secondary)" }}>
          No duties in the next two weeks.
        </section>
      )}

      {off.length > 0 && (
        <section className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
          <h2 className="text-[14px] font-semibold">Off these shifts</h2>
          <ul className="mt-1 space-y-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {off.map((d) => (
              <li key={d.assignment.id}>
                {dayLabel(ukDate(d.start))} {formatTime(d.start)}–{formatTime(d.end)} · {d.post.name}, {d.siteName} — you are not on this shift any more.
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="upcoming-h">
        <h2 id="upcoming-h" className="text-[15px] font-semibold">
          Coming up · {later.length}
        </h2>
        {later.length === 0 ? (
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            Nothing else in the next two weeks.
          </p>
        ) : (
          <ul className="mt-2 divide-y rounded-lg border" style={{ borderColor: "var(--hairline)" }}>
            {later.map((d) => (
              <li key={d.assignment.id} className="space-y-2 px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
                <Where d={d} now={now} />
                {d.s.chase.state === "confirmed" ? (
                  <p className="text-[13px] font-medium" style={{ color: "var(--status-good)" }}>
                    ✓ Confirmed
                  </p>
                ) : d.s.chase.state === "cannot_attend" ? (
                  <p className="text-[13px]" style={{ color: "var(--status-critical)" }}>
                    You told Control you can’t make it.
                  </p>
                ) : (
                  <ConfirmButton assignmentId={d.assignment.id} onResult={setNotice} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="done-h">
        <h2 id="done-h" className="text-[15px] font-semibold">
          Completed · {done.length}
        </h2>
        {done.length === 0 ? (
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            None in the last week.
          </p>
        ) : (
          <ul className="mt-2 divide-y rounded-lg border" style={{ borderColor: "var(--hairline)" }}>
            {done.map((d) => {
              const made = d.calls.length;
              return (
                <li key={d.assignment.id} className="px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
                  <Where d={d} now={now} />
                  <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                    {d.bookOn ? `Booked on ${formatTime(d.bookOn.at)}` : "No book-on recorded"}
                    {d.post.checkCallsRequired && d.post.mobileSignal ? ` · ${made} check call${made === 1 ? "" : "s"}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Where and when: the site, its address, the post, the times. */
function Where({ d, now }: { d: Duty; now: Date }) {
  return (
    <div>
      <p className="text-[15px] font-semibold">
        {d.post.name} <span className="font-normal" style={{ color: "var(--text-secondary)" }}>· {d.siteName}</span>
      </p>
      {d.siteAddress && (
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          {d.siteAddress}
        </p>
      )}
      <p className="tnum text-[13px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
        {dayLabel(ukDate(d.start))} · {formatTime(d.start)}–{formatTime(d.end)}
        {now < d.start ? ` · starts ${relative(d.start, now)}` : now < d.end ? ` · ends ${relative(d.end, now)}` : ""}
      </p>
    </div>
  );
}

const STEPS = ["Confirmed", "Booked on", "Check calls", "Duty ends"];

/** The shift on now, or next: where it is in the flow, and the one thing to do. */
function NowCard({ d, now, onResult }: { d: Duty; now: Date; onResult: (r: ActionResult) => void }) {
  const s = d.s;
  const started = d.start <= now;
  const bookOnFrom = new Date(d.start.getTime() - DUTY_RULES.bookOnEarliestMinutes * 60_000);
  const calls = d.post.checkCallsRequired && d.post.mobileSignal;
  // Done steps are ticked; the one in progress is marked, red if something is overdue.
  const doneUpTo = d.bookOn ? 1 : s.chase.state === "confirmed" ? 0 : -1;
  const current = d.bookOn ? (calls ? 2 : 3) : doneUpTo + 1;
  const overdue = s.stage === "alert";
  const late = !d.bookOn && (s.stage === "late" || s.stage === "no_show");

  return (
    <section aria-labelledby="now-h" className="space-y-4 rounded-xl border-2 p-4" style={{ borderColor: late || overdue ? "var(--status-critical)" : "var(--series-1)", background: "var(--surface-1)" }}>
      <div>
        <p id="now-h" className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: late || overdue ? "var(--status-critical)" : "var(--series-1)" }}>
          {started ? "On duty now" : "Your next duty"}
        </p>
        <Where d={d} now={now} />
      </div>

      <ol aria-label="Your duty checks" className="grid grid-cols-4 gap-1">
        {STEPS.map((label, i) => (
          <li key={label} className="text-center" aria-current={i === current ? "step" : undefined}>
            <span
              className="mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold"
              style={
                i <= doneUpTo
                  ? { background: "var(--status-good)", color: "#fff" }
                  : i === current
                    ? { background: late || overdue ? "var(--status-critical)" : "var(--series-1)", color: "#fff" }
                    : { background: "var(--wash-neutral)", color: "var(--text-secondary)" }
              }
            >
              {i <= doneUpTo ? "✓" : i + 1}
            </span>
            <span className="mt-1 block text-[11px]" style={{ color: "var(--text-secondary)" }}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {late && (
        <p className="rounded-lg px-3 py-2 text-[14px] font-medium" style={{ background: "var(--wash-critical)", color: "var(--status-critical)" }}>
          You were due on site at {formatTime(d.start)} — {s.attendance.minutesLate} min ago. Book on now, or ring Control.
        </p>
      )}
      {overdue && (
        <p className="rounded-lg px-3 py-2 text-[14px] font-medium" style={{ background: "var(--wash-critical)", color: "var(--status-critical)" }}>
          Your check call is overdue — {s.call.minutesOver} min. Make it now. Control has been alerted.
        </p>
      )}

      {/* The one thing to do next. */}
      {!d.bookOn && !started && s.chase.state !== "confirmed" && s.chase.state !== "cannot_attend" && (
        <div className="space-y-2">
          <p className="text-[14px]">Please confirm you know about this shift and will be there.</p>
          <ConfirmButton assignmentId={d.assignment.id} onResult={onResult} />
          <CannotMakeItForm assignmentId={d.assignment.id} onResult={onResult} />
        </div>
      )}
      {!d.bookOn && s.chase.state === "cannot_attend" && (
        <p className="text-[14px]" style={{ color: "var(--status-critical)" }}>
          You told Control you can’t make it. They will take you off the shift and find cover.
        </p>
      )}
      {!d.bookOn && s.chase.state !== "cannot_attend" && (started || s.chase.state === "confirmed") && (
        <div className="space-y-2">
          {now >= bookOnFrom ? (
            <>
              {!d.post.mobileSignal && (
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  There is no signal at this post — book on before you go in.
                </p>
              )}
              <BookOnButton assignmentId={d.assignment.id} late={late} onResult={onResult} />
            </>
          ) : (
            <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
              ✓ Confirmed. You can book on from <strong>{formatTime(bookOnFrom)}</strong>, when you are at the site.
            </p>
          )}
        </div>
      )}
      {d.bookOn && (
        <div className="space-y-3">
          <p className="text-[13px]" style={{ color: "var(--status-good)" }}>
            ✓ Booked on at {formatTime(d.bookOn.at)}
          </p>
          {calls ? (
            <>
              <p className="text-[14px]">
                {s.schedule?.nextDue ? (
                  <>
                    Next check call due by <strong>{formatTime(s.schedule.nextDue)}</strong> ({relative(s.schedule.nextDue, now)})
                  </>
                ) : (
                  "No more check calls before your shift ends."
                )}
              </p>
              {s.schedule?.nextDue && <CheckCallButtons assignmentId={d.assignment.id} overdue={overdue} onResult={onResult} />}
              {s.schedule && (
                <div>
                  <p className="mb-1 text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    Your check calls
                  </p>
                  <CallTimeline slots={s.schedule.slots} now={now} />
                </div>
              )}
            </>
          ) : !d.post.mobileSignal ? (
            <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
              No signal at this post: the client holds contact with you on the site phone. If anything happens, use the site phone.
            </p>
          ) : (
            <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
              No check calls needed this shift ({d.post.checkCallWhy?.toLowerCase() ?? "not required"}).
            </p>
          )}
        </div>
      )}
    </section>
  );
}
