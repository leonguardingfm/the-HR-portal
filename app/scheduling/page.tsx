import Link from "next/link";
import { WeekGrid } from "@/components/scheduling/WeekGrid";
import { AsksList, ChangesList } from "@/components/scheduling/HistoryLists";
import { OfferList, type OfferRow } from "@/components/scheduling/OfferList";
import { PublishWeekForm } from "@/components/scheduling/RotaForms";
import { ActionButton } from "@/components/ui/ActionButton";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill } from "@/components/ui/StatusPill";
import { publishAssignment } from "@/lib/actions/operations";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import {
  OFF_REASON_LABELS,
  addDays,
  dayLabel,
  isDate,
  mondayOf,
  ukDate,
} from "@/lib/core/rota";
import { getOpenCoverNeeds, getRotaWeek, whyCannotTake, type RotaAsk } from "@/lib/db/rota";
import { db } from "@/lib/db/client";
import { formatDate, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Long lists stop here: at 300–400 officers a month is thousands of rows, and the grid is where they are read. */
const LIST_LIMIT = 40;

/** One call, however many shifts it offered: same officer, post, moment and answer. */
function calls(asks: RotaAsk[]) {
  const m = new Map<string, RotaAsk[]>();
  for (const a of asks) {
    const k = `${a.personId}|${a.postId}|${a.askedAt}|${a.answer}`;
    m.set(k, [...(m.get(k) ?? []), a]);
  }
  return [...m.values()].map((group) =>
    group.sort((a, b) => a.date.localeCompare(b.date)),
  );
}

/** How urgent a cover need is: started or within two hours is now; today is soon. */
function urgency(
  startsAt: Date,
  now: Date,
): { severity: "critical" | "serious" | "warning"; label: string } {
  const mins = Math.round((startsAt.getTime() - now.getTime()) / 60_000);
  if (mins <= 0)
    return {
      severity: "critical",
      label: `Started ${Math.abs(mins) < 60 ? `${Math.abs(mins)} min` : `${Math.floor(Math.abs(mins) / 60)}h`} ago`,
    };
  if (mins <= 120)
    return {
      severity: "critical",
      label: `Starts in ${mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`}`,
    };
  if (mins <= 24 * 60)
    return {
      severity: "serious",
      label: `Starts in ${Math.floor(mins / 60)}h`,
    };
  return {
    severity: "warning",
    label: `Starts in ${Math.round(mins / 1440)} days`,
  };
}

export default async function SchedulingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; cover?: string; span?: string; post?: string; day?: string }>;
}) {
  const session = await requireSession();
  const { week: asked, cover, span: spanParam, post: openPostId, day: openDay } = await searchParams;
  const now = new Date();
  const today = ukDate(now);
  const monday = mondayOf(asked && isDate(asked) ? asked : today);
  const span = spanParam === "4" ? 4 : 1;
  const [week, openNeeds, waiting] = await Promise.all([
    getRotaWeek(monday, span),
    getOpenCoverNeeds(now),
    // Officers who offered in their portal, still waiting for Control.
    db.shiftVolunteer.findMany({
      where: { state: "waiting", openShift: { assignmentId: null, cancelledAt: null, endsAt: { gt: now } } },
      orderBy: { at: "asc" },
      take: 60,
      include: {
        person: { select: { fullName: true, employment: { select: { pin: true } } } },
        openShift: { include: { post: { include: { site: true } } } },
      },
    }),
  ]);
  const offers: OfferRow[] = await Promise.all(
    waiting.map(async (v) => ({
      id: v.id,
      person: v.person.fullName,
      pin: v.person.employment?.pin ?? null,
      shift: `${v.openShift.post.name} at ${v.openShift.post.site.name}, ${dayLabel(ukDate(v.openShift.startsAt))} ${formatTime(v.openShift.startsAt)}–${formatTime(v.openShift.endsAt)}`,
      note: v.note,
      at: `Offered ${formatDate(v.at)} ${formatTime(v.at)}`,
      problem: await whyCannotTake(v.personId, v.openShift),
      href: `/scheduling?week=${mondayOf(ukDate(v.openShift.startsAt))}&post=${v.openShift.postId}&day=${ukDate(v.openShift.startsAt)}`,
    })),
  );
  const href = (m: string, s: number = span) =>
    `/scheduling?week=${m}${s > 1 ? `&span=${s}` : ""}`;

  const buildDenied = deniedReason(session.activeRole, "rota.build");
  const changeDenied = deniedReason(session.activeRole, "rota.change");
  const hoursDenied = deniedReason(session.activeRole, "officer.hours");
  const publishDenied = deniedReason(session.activeRole, "assignment.publish");

  // The rota is made first: the gaps are the open shifts nobody is on yet.
  const gaps = week.openShifts.filter((o) => new Date(o.endsAt) > now);
  const onRota = week.shifts.filter((s) => !s.cameOff).length;
  const drafts = week.shifts.filter((s) => s.state === "draft");
  const blocked = drafts.filter((s) => s.check && !s.check.allowed);
  const soon = gaps.filter((g) => g.date <= addDays(today, 1));
  const nothingYet = gaps.length === 0 && onRota === 0 && week.openShifts.length === 0;
  const asks = calls(week.asks);
  const said = (a: string) => week.asks.filter((x) => x.answer === a).length;
  const thisWeek = monday === mondayOf(today);
  const period = span === 1 ? "this week" : `these ${span} weeks`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Scheduling"
        description="Create the rota in bulk, then assign officers by who is free. A yes goes on as a draft; publishing runs the deployability check on every shift."
        action={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <nav
              aria-label="How much to show"
              className="inline-flex rounded-md border p-0.5"
              style={{ borderColor: "var(--hairline)" }}
            >
              {[1, 4].map((s) => (
                <Link
                  key={s}
                  href={href(monday, s)}
                  aria-current={span === s ? "page" : undefined}
                  className="inline-flex h-7 items-center rounded px-3 text-[12px] font-medium"
                  style={
                    span === s
                      ? {
                          background: "var(--text-primary)",
                          color: "var(--page)",
                        }
                      : { color: "var(--text-secondary)" }
                  }
                >
                  {s === 1 ? "1 week" : "4 weeks"}
                </Link>
              ))}
            </nav>
            <nav aria-label="Week" className="flex flex-wrap items-center gap-1.5">
              <Link
                href={href(addDays(monday, -7 * span))}
                className="inline-flex h-8 items-center rounded-md border px-3 text-[12px]"
                style={{
                  borderColor: "var(--hairline)",
                  background: "var(--surface-1)",
                }}
              >
                ‹ Previous
              </Link>
              {!thisWeek && (
                <Link
                  href={href(mondayOf(today))}
                  className="inline-flex h-8 items-center rounded-md border px-3 text-[12px]"
                  style={{
                    borderColor: "var(--hairline)",
                    background: "var(--surface-1)",
                  }}
                >
                  This week
                </Link>
              )}
              <Link
                href={href(addDays(monday, 7 * span))}
                className="inline-flex h-8 items-center rounded-md border px-3 text-[12px]"
                style={{
                  borderColor: "var(--hairline)",
                  background: "var(--surface-1)",
                }}
              >
                Next ›
              </Link>
            </nav>
          </div>
        }
      />

      {openNeeds.length > 0 && (
        <section
          aria-labelledby="cover-now-h"
          className="rounded-lg border-2 print:hidden"
          style={{
            borderColor: "var(--status-critical)",
            background: "var(--wash-critical)",
          }}
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-2">
            <h2
              id="cover-now-h"
              className="text-[14px] font-semibold"
              style={{ color: "var(--status-critical)" }}
            >
              Cover needed now · {openNeeds.length}
            </h2>
            <p
              className="text-[12px]"
              style={{ color: "var(--text-secondary)" }}
            >
              An officer came off. Ring round, and a yes goes on the rota at
              once.
            </p>
          </header>
          <ul
            className="divide-y px-5 pb-3"
            style={{ borderColor: "var(--hairline)" }}
          >
            {openNeeds.map((n) => {
              const u = urgency(new Date(n.startsAt), now);
              return (
                <li
                  key={n.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">
                      {n.postName}{" "}
                      <span
                        className="font-normal"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        · {n.siteName}
                      </span>
                    </p>
                    <p
                      className="text-[12px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {dayLabel(n.date)} {n.start}–{n.end} · {n.fromName} off,{" "}
                      {OFF_REASON_LABELS[n.reason].toLowerCase()}
                      {n.note && ` — “${n.note}”`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill severity={u.severity} label={u.label} />
                    <Link
                      href={`${href(mondayOf(n.date))}&cover=${n.id}`}
                      className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-semibold text-white"
                      style={{ background: "var(--status-critical)" }}
                    >
                      Find cover
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {offers.length > 0 && (
        <Card
          className="print:hidden"
          title={`Officers offering for shifts · ${offers.length}`}
          subtitle="Offered in their portal. Accept to put them on it, exactly as a yes on the phone; decline and they are told. Oldest first."
        >
          <OfferList rows={offers} denied={buildDenied} />
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 print:hidden">
        <StatTile
          label="Open shifts to fill"
          value={gaps.length}
          detail={
            nothingYet
              ? "No shifts created yet"
              : soon.length
                ? `${soon.length} by tomorrow`
                : `of ${gaps.length + onRota} shifts on the rota`
          }
          severity={soon.length ? "critical" : gaps.length ? "warning" : nothingYet ? "neutral" : "good"}
          hero={gaps.length > 0}
        />
        <StatTile
          label="Drafts to publish"
          value={drafts.length}
          detail={
            blocked.length
              ? `${blocked.length} blocked by the deployability check`
              : "Officers have not seen these yet"
          }
          severity={
            blocked.length ? "critical" : drafts.length ? "warning" : "neutral"
          }
        />
        <StatTile
          label="Shifts on the rota"
          value={
            week.shifts.filter((s) => s.state !== "draft" && !s.cameOff).length
          }
          detail={`Published, ${period}`}
        />
        <StatTile
          label="Officers asked"
          value={week.asks.length}
          detail={
            week.asks.length
              ? `${said("yes")} yes · ${said("no")} no · ${said("no_answer")} no answer`
              : `Nobody asked about ${period} yet`
          }
        />
      </div>

      <Card
        title={`${span === 1 ? "Week of" : "4 weeks:"} ${dayLabel(monday)} – ${dayLabel(addDays(monday, 7 * span - 1))} ${addDays(monday, 7 * span - 1).slice(0, 4)}`}
        subtitle="Create the shifts first, then put officers on them. Every colour is a stage — the key is below. Click any box to fill it, change it or find cover."
      >
        <WeekGrid
          week={week}
          today={today}
          now={now.toISOString()}
          buildDenied={buildDenied}
          changeDenied={changeDenied}
          hoursDenied={hoursDenied}
          openCover={cover ?? null}
          openPost={openPostId && openDay && isDate(openDay) ? { postId: openPostId, date: openDay } : null}
        />
      </Card>

      <Card
        className="print:hidden"
        title="Publish"
        subtitle="Every draft goes through the same check as a single shift, judged at the end of the shift. A blocked officer stays as a draft and does not hold up the rest."
        action={
          <PublishWeekForm
            monday={monday}
            weeks={span}
            count={drafts.length}
            denied={publishDenied}
          />
        }
      >
        {drafts.length === 0 ? (
          <p
            className="py-4 text-center text-[13px]"
            style={{ color: "var(--text-secondary)" }}
          >
            No drafts in {period}.
          </p>
        ) : (
          <>
            {drafts.length > blocked.length && (
              <p
                className="mb-2 text-[13px]"
                style={{ color: "var(--text-secondary)" }}
              >
                <strong style={{ color: "var(--status-good)" }}>
                  {drafts.length - blocked.length} ready to publish.
                </strong>{" "}
                {blocked.length > 0
                  ? `${blocked.length} blocked, listed below — they stay as drafts when the rest are published.`
                  : "None blocked."}
              </p>
            )}
            <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
              {/* Blocked first; with hundreds of drafts, those are the ones that need reading. */}
              {[...blocked, ...drafts.filter((d) => !blocked.includes(d))]
                .slice(0, LIST_LIMIT)
                .map((s) => {
                  const post = week.posts.find((p) => p.id === s.postId)!;
                  return (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-start justify-between gap-2 py-2.5"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium">
                          {s.personName} — {post.name}
                        </p>
                        <p
                          className="text-[12px]"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {post.siteName} · {dayLabel(s.date)} · {s.start}–
                          {s.end}
                        </p>
                        {s.check && !s.check.allowed && (
                          <p
                            className="text-[12px]"
                            style={{ color: "var(--status-critical)" }}
                          >
                            {s.check.blockers.join(" · ")}
                          </p>
                        )}
                        {s.check?.allowed && s.check.warnings.length > 0 && (
                          <p
                            className="text-[12px]"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {s.check.warnings.join(" · ")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-start gap-2">
                        <StatusPill
                          severity={s.check?.allowed ? "good" : "critical"}
                          label={
                            s.check?.allowed ? "Can be published" : "Blocked"
                          }
                        />
                        <ActionButton
                          action={publishAssignment.bind(null, s.id)}
                          label="Publish"
                          variant="quiet"
                          denied={publishDenied}
                        />
                      </div>
                    </li>
                  );
                })}
            </ul>
            {drafts.length > LIST_LIMIT && (
              <p
                className="pt-2 text-[12px]"
                style={{ color: "var(--text-muted)" }}
              >
                And {drafts.length - LIST_LIMIT} more ready drafts — the button
                above publishes them all.
              </p>
            )}
          </>
        )}
      </Card>

      <Card
        className="print:hidden"
        title="Who was asked"
        subtitle={`The ring-round for ${period}, newest first — the no answers included, and the offers officers made in their portal.`}
      >
        <AsksList calls={asks} period={period} />
      </Card>

      {week.changes.length > 0 && (
        <Card
          className="print:hidden"
          title="Shift changes"
          subtitle={`Every amendment to a published shift ${period}, with its reason and its author, newest first. Nothing is overwritten.`}
        >
          <ChangesList changes={week.changes} />
        </Card>
      )}

      <Card
        className="print:hidden"
        title="Hours for payroll"
        subtitle="Every shift between two dates as a spreadsheet: scheduled hours, when the officer booked on, and the hours from then to the end. Up to two months at a time."
      >
        <form action="/scheduling/hours" method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-[12px] font-medium">
            From
            <input type="date" name="from" required defaultValue={monday} className="mt-1 block h-9 rounded-md border px-2.5 text-[13px]" style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }} />
          </label>
          <label className="text-[12px] font-medium">
            To
            <input type="date" name="to" required defaultValue={addDays(monday, 7 * span - 1)} className="mt-1 block h-9 rounded-md border px-2.5 text-[13px]" style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }} />
          </label>
          <button type="submit" className="h-9 rounded-md px-3 text-[12px] font-semibold text-white" style={{ background: "var(--series-1)" }}>
            Download spreadsheet
          </button>
        </form>
        <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
          Until officers book off at the end of a shift, hours run to the scheduled end. A shift with no book-on is marked, not paid by default.
        </p>
      </Card>

      <p className="text-[12px] print:hidden" style={{ color: "var(--text-muted)" }}>
        A double-booking cannot be written at all: the database refuses two overlapping shifts for one officer, whatever screen or job tries. Eleven hours&apos; rest between shifts, weekly hours and sites an officer is kept off are enforced on every path.
      </p>
    </div>
  );
}
