"use client";

import { useMemo, useState } from "react";
import { CallTimeline, relative } from "@/components/duty/DutyShared";
import { DeviceAlertsCard } from "@/components/live/DeviceAlerts";
import { useNow } from "@/components/ui/useNow";
import type { ActionResult } from "@/lib/actions/types";
import { alertKind } from "@/lib/core/alerts";
import { DUTY_RULES, dutyStatus, type DutyStatus } from "@/lib/core/duty";
import { mapLink } from "@/lib/core/proof";
import { dayLabel, ukDate } from "@/lib/core/rota";
import type { MyLeave, MyOpenShift } from "@/lib/db/me";
import type { LiveRow } from "@/lib/db/queries";
import { formatTime } from "@/lib/format";
import {
  AvailabilityCalendar,
  MyLeaveSection,
  type CalendarDay,
  BookOnButton,
  CannotMakeItForm,
  CheckCallButtons,
  ConfirmButton,
  IncidentForm,
  OfferButton,
  RunningLateForm,
  WithdrawOfferButton,
} from "./MyForms";
import { OutboxPanel, useOutbox } from "./Outbox";

type Duty = LiveRow & { s: DutyStatus; start: Date; end: Date };

interface Props {
  rows: LiveRow[];
  alerts: { id: string; title: string; at: string }[];
  name: string;
  pin: string | null;
  controlPhone: string | null;
  vapidKey: string | null;
  openShifts: MyOpenShift[];
  availability: { said: Record<string, "available" | "unavailable">; days: CalendarDay[] };
  leave: MyLeave;
}

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;

/**
 * The officer's own portal: their duties and nothing else. The shift that is
 * on now — or the next one — is at the top with the one thing to do next:
 * confirm, book on with a selfie, or make the check call. Below it, open
 * shifts they could take, which days they are free, and what is coming and
 * done. Built for a phone, in a car park, at night.
 */
export function MyDuties({ rows, alerts, name, pin, controlPhone, vapidKey, openShifts, availability, leave }: Props) {
  const now = useNow(30_000);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const outbox = useOutbox();
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
  // An incident can be reported on the shift it happened on, up to twelve hours after.
  const justFinished = !current ? done.find((d) => now.getTime() - d.end.getTime() < 12 * 3_600_000) : undefined;
  const isNews = (t: string) => ["officer_decision", "officer_leave"].includes(alertKind(t));
  const action = alerts.filter((a) => !isNews(a.title));
  const news = alerts.filter((a) => isNews(a.title));

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">My duties</h1>
          <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
            {name.split(" ")[0]}
            {pin && ` · PIN ${pin}`} · {dayLabel(ukDate(now))} {formatTime(now)}
          </p>
        </div>
        {controlPhone && (
          <a href={tel(controlPhone)} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-4 text-[14px] font-semibold text-white" style={{ background: "var(--button-good)" }}>
            📞 Call Control
          </a>
        )}
      </header>

      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-[14px]" style={{ borderColor: notice.ok ? "var(--status-good)" : "var(--status-critical)", background: notice.ok ? "var(--wash-good)" : "var(--wash-critical)" }}>
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" style={{ color: "var(--text-secondary)" }}>
            ✕
          </button>
        </div>
      )}

      <OutboxPanel {...outbox} />

      <DeviceAlertsCard vapidKey={vapidKey} />

      {action.length > 0 && (
        <section aria-labelledby="alerts-h" className="rounded-lg border-2 px-4 py-3" style={{ borderColor: "var(--status-critical)", background: "var(--wash-critical)" }}>
          <h2 id="alerts-h" className="text-[14px] font-semibold" style={{ color: "var(--critical-text)" }}>
            Needs your action · {action.length}
          </h2>
          <ul className="mt-1 space-y-1.5">
            {action.map((a) => (
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

      {news.length > 0 && (
        <section aria-labelledby="news-h" className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--series-1)" }}>
          <h2 id="news-h" className="text-[14px] font-semibold" style={{ color: "var(--accent-text)" }}>
            From Control
          </h2>
          <ul className="mt-1 space-y-1.5">
            {news.map((a) => (
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

      {next ? (
        <NowCard d={next} now={now} name={name} pin={pin} onResult={setNotice} queuedBookOn={outbox.items.find((i) => i.kind === "book_on" && i.assignmentId === next.assignment.id && i.status === "waiting")?.madeAt ?? null} />
      ) : (
        <section className="rounded-lg border px-4 py-6 text-center text-[14px]" style={{ borderColor: "var(--hairline)", color: "var(--text-secondary)" }}>
          No duties in the next two weeks.
        </section>
      )}

      {justFinished && (
        <section className="space-y-2 rounded-lg border px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Something to report from {justFinished.post.name}, {justFinished.siteName}?
          </p>
          <IncidentForm assignmentId={justFinished.assignment.id} onResult={setNotice} />
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
                  <p className="text-[13px] font-medium" style={{ color: "var(--good-text)" }}>
                    ✓ Confirmed
                  </p>
                ) : d.s.chase.state === "cannot_attend" ? (
                  <p className="text-[13px]" style={{ color: "var(--critical-text)" }}>
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

      <section aria-labelledby="open-h">
        <h2 id="open-h" className="text-[15px] font-semibold">
          Shifts you could take · {openShifts.length}
        </h2>
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Nobody is on these yet. Offer, and Control will accept or decline — you get an alert either way.
        </p>
        {openShifts.length === 0 ? (
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            None in the next two weeks.
          </p>
        ) : (
          <ul className="mt-2 divide-y rounded-lg border" style={{ borderColor: "var(--hairline)" }}>
            {openShifts.slice(0, 12).map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold">
                    {o.postName} <span className="font-normal" style={{ color: "var(--text-secondary)" }}>· {o.siteName}</span>
                  </p>
                  <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                    {o.label}
                  </p>
                </div>
                {o.offered === "waiting" ? (
                  <div className="text-right">
                    <p className="text-[13px] font-medium" style={{ color: "var(--accent-text)" }}>
                      Offered — waiting for Control
                    </p>
                    <WithdrawOfferButton openShiftId={o.id} onResult={setNotice} />
                  </div>
                ) : o.offered === "declined" ? (
                  <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                    Control went with someone else
                  </p>
                ) : (
                  <OfferButton openShiftId={o.id} onResult={setNotice} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="free-h" className="space-y-2">
        <h2 id="free-h" className="text-[15px] font-semibold">
          When I’m free
        </h2>
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Tell Control which days you can work, and which you cannot. They ask the people who are free first.
        </p>
        <AvailabilityCalendar days={availability.days} said={availability.said} onResult={setNotice} />
      </section>

      <section aria-labelledby="leave-h" className="space-y-2">
        <h2 id="leave-h" className="text-[15px] font-semibold">
          My leave
        </h2>
        <MyLeaveSection leave={leave} onResult={setNotice} />
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
                    {d.bookOn ? `Booked on ${formatTime(d.bookOn.at)}${d.bookOn.proof ? " with a selfie" : ""}` : "No book-on recorded"}
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

/** Where and when: the site, its address and a map, the post, the times. */
function Where({ d, now }: { d: Duty; now: Date }) {
  const map = mapLink({ lat: d.site.lat, lng: d.site.lng, address: d.siteAddress });
  return (
    <div>
      <p className="text-[15px] font-semibold">
        {d.post.name} <span className="font-normal" style={{ color: "var(--text-secondary)" }}>· {d.siteName}</span>
      </p>
      {(d.siteAddress || map) && (
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          {d.siteAddress}
          {map && (
            <>
              {d.siteAddress ? " · " : ""}
              <a href={map} target="_blank" rel="noreferrer" className="underline">
                Map
              </a>
            </>
          )}
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
function NowCard({ d, now, name, pin, onResult, queuedBookOn }: { d: Duty; now: Date; name: string; pin: string | null; onResult: (r: ActionResult) => void; queuedBookOn: number | null }) {
  const s = d.s;
  const started = d.start <= now;
  const bookOnFrom = new Date(d.start.getTime() - DUTY_RULES.bookOnEarliestMinutes * 60_000);
  const calls = d.post.checkCallsRequired && d.post.mobileSignal;
  // Done steps are ticked; the one in progress is marked, red if something is overdue.
  const doneUpTo = d.bookOn ? 1 : s.chase.state === "confirmed" ? 0 : -1;
  const current = d.bookOn ? (calls ? 2 : 3) : doneUpTo + 1;
  const overdue = s.stage === "alert";
  const late = !d.bookOn && (s.stage === "late" || s.stage === "no_show");
  const officer = { name, pin };
  const place = { post: d.post.name, site: d.siteName };
  const canSayLate = !d.bookOn && !queuedBookOn && s.chase.state !== "cannot_attend" && d.start.getTime() - now.getTime() <= 3 * 3_600_000;

  return (
    <section aria-labelledby="now-h" className="space-y-4 rounded-xl border-2 p-4" style={{ borderColor: late || overdue ? "var(--status-critical)" : "var(--series-1)", background: "var(--surface-1)" }}>
      <div>
        <p id="now-h" className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: late || overdue ? "var(--critical-text)" : "var(--accent-text)" }}>
          {started ? "On duty now" : "Your next duty"}
        </p>
        <Where d={d} now={now} />
        {d.post.phone && (
          <p className="mt-1 text-[13px]">
            Post phone:{" "}
            <a href={tel(d.post.phone)} className="font-medium underline">
              {d.post.phone}
            </a>
          </p>
        )}
      </div>

      {d.post.instructions && (
        <details className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--hairline)" }} open={!started && !d.bookOn}>
          <summary className="cursor-pointer text-[14px] font-semibold select-none">Site instructions</summary>
          <p className="mt-2 text-[14px] whitespace-pre-line">{d.post.instructions}</p>
        </details>
      )}

      <ol aria-label="Your duty checks" className="grid grid-cols-4 gap-1">
        {STEPS.map((label, i) => (
          <li key={label} className="text-center" aria-current={i === current ? "step" : undefined}>
            <span
              className="mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold"
              style={
                i <= doneUpTo
                  ? { background: "var(--button-good)", color: "#fff" }
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
        <p className="rounded-lg px-3 py-2 text-[14px] font-medium" style={{ background: "var(--wash-critical)", color: "var(--critical-text)" }}>
          You were due on site at {formatTime(d.start)} — {s.attendance.minutesLate} min ago. Book on now, or ring Control.
          {d.runningLate && ` You said you would be there about ${formatTime(d.runningLate.eta)}.`}
        </p>
      )}
      {overdue && (
        <p className="rounded-lg px-3 py-2 text-[14px] font-medium" style={{ background: "var(--wash-critical)", color: "var(--critical-text)" }}>
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
        <p className="text-[14px]" style={{ color: "var(--critical-text)" }}>
          You told Control you can’t make it. They will take you off the shift and find cover.
        </p>
      )}
      {/* Booked on with no signal: saved on the phone, and the check calls carry on the same way. */}
      {!d.bookOn && queuedBookOn && (
        <div className="space-y-3">
          <p className="text-[13px]" style={{ color: "var(--good-text)" }}>
            ✓ Booked on at {formatTime(new Date(queuedBookOn))} — saved on this phone, sending when you have signal
          </p>
          {calls && (
            <>
              <p className="text-[14px]">
                Next check call due by <strong>{formatTime(new Date(queuedBookOn + 60 * 60_000))}</strong>
              </p>
              <CheckCallButtons assignmentId={d.assignment.id} overdue={false} officer={officer} place={place} onResult={onResult} />
            </>
          )}
        </div>
      )}
      {!d.bookOn && !queuedBookOn && s.chase.state !== "cannot_attend" && (started || s.chase.state === "confirmed") && (
        <div className="space-y-2">
          {now >= bookOnFrom ? (
            <>
              {!d.post.mobileSignal && (
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  There is no signal at this post — book on before you go in.
                </p>
              )}
              <BookOnButton assignmentId={d.assignment.id} late={late} officer={officer} place={place} onResult={onResult} />
            </>
          ) : (
            <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
              ✓ Confirmed. You can book on from <strong>{formatTime(bookOnFrom)}</strong>, when you are at the site.
            </p>
          )}
        </div>
      )}
      {canSayLate && (
        <div>
          {d.runningLate && !late && (
            <p className="mb-1 text-[13px]" style={{ color: "var(--serious-text)" }}>
              Control knows you will be there about {formatTime(d.runningLate.eta)}.
            </p>
          )}
          <RunningLateForm assignmentId={d.assignment.id} onResult={onResult} />
        </div>
      )}
      {d.bookOn && (
        <div className="space-y-3">
          <p className="text-[13px]" style={{ color: "var(--good-text)" }}>
            ✓ Booked on at {formatTime(d.bookOn.at)}
            {d.bookOn.proof ? " with your selfie" : ""}
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
              {s.schedule?.nextDue && <CheckCallButtons assignmentId={d.assignment.id} overdue={overdue} officer={officer} place={place} onResult={onResult} />}
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
      {started && <IncidentForm assignmentId={d.assignment.id} onResult={onResult} />}
    </section>
  );
}
