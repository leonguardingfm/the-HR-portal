import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill } from "@/components/ui/StatusPill";
import { VettingClockBoard } from "@/components/dashboard/VettingClockBoard";
import { OpenFileForm } from "@/components/vetting/ScreeningForms";
import { SweepButton } from "@/components/vetting/ExceptionForms";
import { requireSession } from "@/lib/auth/server";
import { canDo } from "@/lib/auth/permissions";
import { clockState } from "@/lib/bs7858";
import { fileProgress, nextMove, offerBlockers } from "@/lib/core/screening";
import { EXCEPTION_LABELS, STATE_LABELS, type ExceptionKind } from "@/lib/core/screening-exceptions";
import { getCandidatesNeedingFile, getClockRows, getControllers, getScreeningFiles } from "@/lib/db/screening";
import { formatDays } from "@/lib/format";
import { RECRUITMENT_STAGE_LABELS, VETTING_STATUS_LABELS } from "@/lib/labels";
import type { RecruitmentStage, Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

const REVIEW = ["controller_review_1", "controller_review_2"];

/**
 * Vetting: every screening file, the controller review queue, the clock, and
 * the candidates who still need a file opened.
 *
 * One file per individual [7.2]. The Screening Administrator builds it and a
 * different Screening Controller reviews it, never the same person on one
 * file [6.1, 7.5.2b] — the page shows whose move it is on each.
 */
export default async function VettingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireSession();
  const { view } = await searchParams;
  const [files, needing, controllers, clockRows] = await Promise.all([
    getScreeningFiles(),
    getCandidatesNeedingFile(),
    getControllers(),
    getClockRows(),
  ]);
  const now = new Date();
  const me = session.userId;

  const ENDED = ["complete", "withdrawn", "unsuccessful"];
  const open = files.filter((f) => !ENDED.includes(f.row.status));
  const awaitingReview = files.filter((f) => REVIEW.includes(f.row.status));
  const mineToReview = awaitingReview.filter((f) => f.row.controllerUserId === me);
  const clocks = clockRows.map((r) =>
    clockState({
      conditionalEmploymentStart: r.conditionalEmploymentStart.toISOString(),
      screeningPeriodYears: r.screeningPeriodYears as 5 | 10,
      extensionWeeks: r.extensionWeeks as 0 | 4,
    }),
  );
  const clockRisk = clocks.filter((c) => c && (c.severity === "serious" || c.severity === "critical")).length;
  const canOpen = canDo(session.activeRole, "screening.open");
  const canDecide = canDo(session.activeRole, "screening.exception.decide");
  const canSweep = canDo(session.activeRole, "screening.sweep");
  // Every open case, and which of them are waiting on a decision this person
  // may make (Higher Management, on a case somebody else raised).
  const cases = files.flatMap((f) => f.row.exceptions.map((e) => ({ ...e, file: f })));
  const awaitingDecision = cases.filter((c) => c.state === "awaiting_decision");
  const mineToDecide = canDecide ? awaitingDecision.filter((c) => c.raisedById !== me && c.file.row.personId !== session.personId) : [];

  const listed = [
    ...(view === "mine"
      ? files.filter((f) => f.row.administratorUserId === me || f.row.controllerUserId === me)
      : view === "review"
        ? awaitingReview
        : files),
  ]
    // The work first; ended files are a record and sit at the bottom.
    .sort((a, b) => Number(ENDED.includes(a.row.status)) - Number(ENDED.includes(b.row.status)));

  const tabs = [
    { id: undefined, label: "All files", n: files.length },
    { id: "mine", label: "Mine", n: files.filter((f) => f.row.administratorUserId === me || f.row.controllerUserId === me).length },
    { id: "review", label: "Awaiting review", n: awaitingReview.length },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Vetting"
        description="BS 7858:2019 screening files. One file per individual. The Screening Administrator builds it and a different Screening Controller reviews it — never the same person on one file."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open files" value={open.length} detail={`${files.length} on record`} href="/vetting" />
        <StatTile
          label={mineToReview.length > 0 ? "Awaiting your review" : "Awaiting controller review"}
          value={mineToReview.length > 0 ? mineToReview.length : awaitingReview.length}
          detail="Submitted by the administrator"
          severity={awaitingReview.length > 0 ? "warning" : "good"}
          hero={mineToReview.length > 0}
          href="/vetting?view=review"
        />
        <StatTile
          label="Clock at risk"
          value={clockRisk}
          detail="75% or more of the period used"
          severity={clockRisk > 0 ? "serious" : "good"}
        />
        {canDecide ? (
          <StatTile
            label="Awaiting your decision"
            value={mineToDecide.length}
            detail="Findings and requests, with representation in"
            severity={mineToDecide.length > 0 ? "warning" : "good"}
            hero={mineToDecide.length > 0}
          />
        ) : (
          <StatTile
            label="Candidates without a file"
            value={needing.length}
            detail="Application in, nothing opened"
            severity={needing.length > 0 ? "warning" : "good"}
          />
        )}
      </div>

      {cases.length > 0 && (
        <Card
          title="Exceptions"
          subtitle="Open findings and requests. Findings pause the file; every one is decided by Higher Management with written grounds."
        >
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {cases.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0">
                <div className="min-w-0">
                  <Link href={`/vetting/${c.file.row.id}`} className="text-[13px] font-medium hover:underline">
                    {c.file.name}
                  </Link>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {EXCEPTION_LABELS[c.kind as ExceptionKind]}
                  </p>
                </div>
                <StatusPill
                  severity={c.state === "awaiting_decision" ? "warning" : "neutral"}
                  label={
                    mineToDecide.some((m) => m.id === c.id) ? "Yours to decide" : STATE_LABELS[c.state]
                  }
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {needing.length > 0 && (
        <Card
          title="Candidates waiting for a file"
          subtitle="An application is in and no screening file is open. A conditional offer is blocked until one is opened, the preliminary checks are done and the controller has reviewed limited screening."
        >
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {needing.map((c) => {
              const eligible = controllers
                .filter((u) => u.id !== me && u.personId !== c.personId)
                .map((u) => ({ id: u.id, label: u.displayName }));
              return (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
                  <div className="min-w-0">
                    <Link href={`/candidates/${c.id}`} className="text-[13px] font-medium hover:underline">
                      {c.person.fullName}
                    </Link>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {RECRUITMENT_STAGE_LABELS[c.stage as RecruitmentStage]} · {c.requirement?.client.name ?? "General pool"}
                    </p>
                  </div>
                  {canOpen ? (
                    <OpenFileForm candidacyId={c.id} controllers={eligible} />
                  ) : (
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Opened by a Screening Administrator
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card
        title="Screening files"
        subtitle="Whose move it is on each file, and whether it still blocks the conditional offer."
        action={
          <nav aria-label="View" className="flex gap-1">
            {tabs.map((t) => (
              <Link
                key={t.label}
                href={t.id ? `/vetting?view=${t.id}` : "/vetting"}
                aria-current={view === t.id ? "true" : undefined}
                className="rounded-md px-2.5 py-1 text-[12px]"
                style={{
                  background: view === t.id ? "var(--wash)" : "transparent",
                  fontWeight: view === t.id ? 600 : 400,
                  color: view === t.id ? "var(--text-primary)" : "var(--text-secondary)",
                }}
              >
                {t.label} <span className="tnum" style={{ color: "var(--text-muted)" }}>{t.n}</span>
              </Link>
            ))}
          </nav>
        }
      >
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                {["Subject", "Status", "Next", "Progress", "Administrator", "Controller", "Offer gate", "Clock"].map((h) => (
                  <th key={h} className="border-b px-5 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listed.map((f) => {
                const p = fileProgress(f.core);
                const blockers = offerBlockers(f.core);
                const clock = clockState(f.core, now);
                const yourMove =
                  (REVIEW.includes(f.row.status) && f.row.controllerUserId === me) ||
                  (!REVIEW.includes(f.row.status) && f.row.status !== "complete" && f.row.administratorUserId === me);
                return (
                  <tr key={f.row.id} className="group align-top hover:bg-[var(--wash)]">
                    <td className="border-b px-5 py-2.5">
                      <Link href={`/vetting/${f.row.id}`} className="font-medium underline-offset-2 group-hover:underline">
                        {f.name}
                      </Link>
                      {f.candidacy && (
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {RECRUITMENT_STAGE_LABELS[f.candidacy.stage as RecruitmentStage]}
                        </p>
                      )}
                    </td>
                    <td className="border-b px-5 py-2.5">{VETTING_STATUS_LABELS[f.core.status]}</td>
                    <td className="border-b px-5 py-2.5" style={{ color: "var(--text-secondary)" }}>
                      {yourMove && (
                        <span className="mr-1 font-semibold" style={{ color: "var(--series-1)" }}>
                          Yours ·
                        </span>
                      )}
                      {nextMove(f.core)}
                    </td>
                    <td className="border-b px-5 py-2.5">
                      <span className="tnum">
                        {p.done}/{p.total}
                      </span>
                      <div className="mt-1 h-1 w-16 overflow-hidden rounded-full" style={{ background: "var(--gridline)" }} aria-hidden>
                        <div className="h-full rounded-full" style={{ width: `${(p.done / p.total) * 100}%`, background: "var(--series-1)" }} />
                      </div>
                    </td>
                    <td className="border-b px-5 py-2.5">{f.administratorName ?? "—"}</td>
                    <td className="border-b px-5 py-2.5">
                      {f.controllerName ?? <span style={{ color: "var(--status-serious)" }}>Unassigned</span>}
                    </td>
                    <td className="border-b px-5 py-2.5">
                      <StatusPill severity={blockers.length ? "neutral" : "good"} label={blockers.length ? "Blocked" : "Clear"} />
                    </td>
                    <td className="border-b px-5 py-2.5">
                      {clock ? (
                        <StatusPill
                          severity={clock.severity as Severity}
                          label={clock.expired ? "Expired" : `${formatDays(clock.daysRemaining)} left`}
                        />
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>{f.row.status === "complete" ? "Done" : "Not started"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {listed.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                    Nothing here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {canSweep && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-5 py-3" style={{ borderColor: "var(--hairline)", background: "var(--surface-1)" }}>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            The clock check runs daily (<code>npm run sweep:clocks</code>): any file out of time is marked Time expired, and Control and the HR Manager get tasks (7.6).
          </p>
          <SweepButton />
        </div>
      )}

      <VettingClockBoard files={clockRows} />

      <ModuleOutline
        subtitle="Still to come. Files, checks, history periods with gap calculation, references by email, controller reviews, the clock, the offer gate and retention are built."
        note="Automation is explicitly recognised by the 2019 edition, but where any element of screening is automated the provisions of the standard still apply (clause 7.1) — so the portal chases, calculates and pre-fills freely, while the evidence trail and the human sign-offs stay intact."
        items={[
          {
            label: "Sanctions list sync",
            detail: "The HM Treasury consolidated list is published as a downloadable file, so screening can re-run daily — which also catches someone appearing on the list after they were cleared.",
            clause: "7.4e",
            phase: 3,
          },
          {
            label: "SIA register lookup prompt",
            detail: "No public API, so a prompted manual lookup with the search result uploaded to the file. Licence expiry is already diarised and alerted.",
            clause: "7.4c1",
            phase: 2,
          },
        ]}
      />
    </div>
  );
}
