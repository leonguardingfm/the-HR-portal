import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Meter } from "@/components/ui/Meter";
import { ClauseRef, StatusPill, Tag } from "@/components/ui/StatusPill";
import {
  AssignControllerForm,
  CheckForm,
  HistoryFiguresForm,
  ReviewForm,
  SubmitReviewButton,
} from "@/components/vetting/ScreeningForms";
import { requireSession } from "@/lib/auth/server";
import { canDo } from "@/lib/auth/permissions";
import { clockState, evaluateGate1, evaluateGate2, weeksAllowed, type GateResult } from "@/lib/bs7858";
import {
  GROUP_LABELS,
  GROUP_TIMING,
  fullScreeningBlockers,
  isSignoff,
  limitedScreeningBlockers,
  nextMove,
} from "@/lib/core/screening";
import { deploymentContext } from "@/lib/core/recruitment";
import {
  EXCEPTION_CLAUSES,
  EXCEPTION_LABELS,
  OUTCOME_LABELS,
  RISK_TRIGGERS,
  STATE_LABELS,
  decisionProblem,
  extensionProblem,
  type DecisionOutcome,
  type ExceptionKind,
} from "@/lib/core/screening-exceptions";
import {
  DeclarationForm,
  DecisionForm,
  ExtensionForm,
  RepresentationForm,
  RiskFindingForm,
} from "@/components/vetting/ExceptionForms";
import { getControllers, getScreeningFile } from "@/lib/db/screening";
import { formatDate, formatDays, formatTime } from "@/lib/format";
import { CHECK_STATUS_LABELS, RECRUITMENT_STAGE_LABELS, VETTING_STATUS_LABELS } from "@/lib/labels";
import { CONTRACT_CONDITION, evaluateDeploymentGate } from "@/lib/policy";
import type { CheckGroup, CheckStatus, InterviewStage, RecruitmentStage, Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

const CHECK_SEVERITY: Record<CheckStatus, Severity> = {
  verified: "good",
  received: "warning",
  requested: "warning",
  chased: "serious",
  failed: "critical",
  not_applicable: "neutral",
  not_started: "neutral",
};

const DECISION_LABELS: Record<string, string> = {
  risk_acceptance: "Risk acceptance",
  extension: "Extension",
  statutory_declaration: "Statutory declaration",
  adverse_finding: "Adverse finding",
  representation: "Representation",
  final_signoff: "Final sign-off",
};

/**
 * One screening file, laid out as the standard's verification progress sheet
 * (Annex A, Form 2): who holds each seat, what stands between the candidate
 * and each gate, the clock, and every check with its clause and dates.
 */
export default async function ScreeningFilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const data = await getScreeningFile(id);
  if (!data) notFound();
  const { row: f, core, candidacy, names, events } = data;
  const now = new Date();
  const me = session.userId;
  const role = session.activeRole;

  const isAdmin = f.administratorUserId === me && canDo(role, "screening.check");
  const isController = f.controllerUserId === me && role === "vetting_controller";
  const underReview = f.status === "controller_review_1" || f.status === "controller_review_2";
  const editable =
    isAdmin && !underReview && !f.controllerReview2At && f.status !== "withdrawn" && f.status !== "unsuccessful";
  const paused = f.status === "adverse_finding" || f.status === "risk_acceptance_required";

  // Gate context from the Recruitment side, read rather than assumed.
  const stage = candidacy?.stage as RecruitmentStage | undefined;
  const { riskEvaluationDocumented, finalInterviewHeld, signedDocumentsComplete } = deploymentContext(
    candidacy && stage
      ? {
          stage,
          interviews: candidacy.interviews.map((i) => ({ stage: i.stage as InterviewStage, outcome: i.outcome })),
          onboardingSteps: candidacy.onboardingSteps,
          requiresAdditional: candidacy.requirement?.client.requiresAdditionalInterview ?? false,
        }
      : null,
  );

  const gate1 = evaluateGate1(core, { riskEvaluationDocumented, finalInterviewHeld });
  const deployment = evaluateDeploymentGate(core, { riskEvaluationDocumented, finalInterviewHeld, signedDocumentsComplete });
  const gate3 = evaluateGate2(core);
  const clock = clockState(core, now);

  const limited = !f.controllerReview1At;
  const blockers = limited ? limitedScreeningBlockers(core) : fullScreeningBlockers(core);

  const controllers = (await getControllers())
    .filter((u) => u.id !== f.administratorUserId && u.personId !== f.personId)
    .map((u) => ({ id: u.id, label: u.displayName }));
  const fileEnded = ["complete", "withdrawn", "unsuccessful"].includes(f.status);
  const canAssign =
    !fileEnded &&
    !f.controllerReview1At &&
    ((f.administratorUserId === me && canDo(role, "screening.assign")) || role === "top_management");
  const canTake = !fileEnded && !f.controllerUserId && role === "vetting_controller" && controllers.some((c) => c.id === me);

  const groups = [...new Set(f.checks.map((c) => c.group))] as CheckGroup[];

  // Exceptions: the open cases, who can act on each, and what may be raised.
  const openCases = f.exceptions.filter((e) => e.state !== "decided");
  const openKinds = openCases.map((e) => e.kind as ExceptionKind);
  const ended = ["complete", "withdrawn", "unsuccessful"].includes(f.status);
  const canRaise = f.administratorUserId === me && canDo(role, "screening.exception.raise") && !ended && !underReview;
  const canDecide = canDo(role, "screening.exception.decide");
  const extensionBlocked = extensionProblem({ file: core, openKinds, now });
  const declarationBlocked = f.decisions.some((d) => d.kind === "statutory_declaration" && d.outcome === "approved")
    ? "A statutory declaration has already been approved on this file. The standard allows one period (7.7i)."
    : openKinds.includes("statutory_declaration")
      ? "A statutory declaration request is already waiting for a decision."
      : null;
  const outcomeChoices = (kind: ExceptionKind): { value: DecisionOutcome; label: string; ends?: string }[] => {
    const ends =
      "Screening ends as unsuccessful. The application is withdrawn, and if they are employed, Control and the HR Manager are told.";
    switch (kind) {
      case "risk_finding":
        return [{ value: "accepted", label: "Accept the risk" }, { value: "declined", label: "Decline", ends }];
      case "adverse_finding":
        return [{ value: "accepted", label: "Accept — continue screening" }, { value: "declined", label: "Uphold — unsuccessful", ends }];
      case "extension":
        return [{ value: "approved", label: "Approve four weeks" }, { value: "refused", label: "Refuse" }];
      default:
        return [{ value: "approved", label: "Approve" }, { value: "refused", label: "Refuse" }];
    }
  };

  return (
    <div className="space-y-5">
      <nav className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/vetting" className="hover:underline">
          Vetting
        </Link>{" "}
        / {f.person.fullName}
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{f.person.fullName}</h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
              {VETTING_STATUS_LABELS[core.status]}
            </span>{" "}
            · {nextMove(core)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Tag>{f.screeningPeriodYears}-year period</Tag>
          {candidacy && stage && (
            <Link href={`/candidates/${candidacy.id}`}>
              <Tag>Recruitment: {RECRUITMENT_STAGE_LABELS[stage]} →</Tag>
            </Link>
          )}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Whose move */}
        <Card title={f.status === "unsuccessful" ? "Outcome" : "Review"} subtitle={f.status === "unsuccessful" ? "Screening ended unsuccessfully. The file is kept for 12 months (11.1, C14)." : limited ? "First review: limited screening, before the conditional offer (7.5.2b)." : "Second review: the completed file, before confirmed employment (7.7)."}>
          {f.status === "unsuccessful" || f.status === "withdrawn" ? (
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {f.status === "unsuccessful"
                ? `Unsuccessful.${f.retainUntil ? ` Kept until ${formatDate(f.retainUntil)}, then disposed of.` : ""}`
                : "Withdrawn with the application."}
            </p>
          ) : f.controllerReview2At ? (
            <p className="text-[13px]">
              Complete. Signed off by {names.get(f.controllerUserId ?? "") ?? "the controller"} on {formatDate(f.controllerReview2At)}.
            </p>
          ) : underReview ? (
            isController ? (
              <ReviewForm fileId={f.id} what={f.status === "controller_review_1" ? "limited screening" : "the completed file"} />
            ) : (
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                With {names.get(f.controllerUserId ?? "") ?? "the controller"} for review.
                {f.controllerUserId === me && role !== "vetting_controller" && " Switch to Screening Controller to review it."}
              </p>
            )
          ) : isAdmin ? (
            <div className="space-y-3">
              <SubmitReviewButton
                fileId={f.id}
                label={limited ? "Submit limited screening for review" : "Submit the completed file for review"}
                blockedBy={
                  paused
                    ? "Paused: a finding is waiting for Higher Management's decision."
                    : f.status === "time_expired"
                      ? "The screening period has run out (7.6)."
                      : !f.controllerUserId
                        ? "Assign a controller first."
                        : blockers.length
                          ? `Not ready yet: ${blockers.length} thing${blockers.length === 1 ? "" : "s"} outstanding.`
                          : null
                }
              />
              {blockers.length > 0 && (
                <ul className="space-y-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {blockers.map((b) => (
                    <li key={b}>· {b}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {nextMove(core)}.{" "}
              {f.administratorUserId === me && !canDo(role, "screening.check") && "Switch to Screening Administrator to work on it."}
            </p>
          )}
        </Card>

        <Card title="Who holds each seat" subtitle="Never the same person on one file, and never the subject (6.1, 7.5.2b).">
          <dl className="space-y-3 text-[13px]">
            <div>
              <dt className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Screening Administrator — builds the file
              </dt>
              <dd className="font-medium">
                {names.get(f.administratorUserId ?? "") ?? "—"}
                {f.administratorUserId === me && <span className="ml-1.5 text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>(you)</span>}
              </dd>
            </div>
            <div>
              <dt className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Screening Controller — reviews it
              </dt>
              <dd className="font-medium">
                {f.controllerUserId ? (
                  <>
                    {names.get(f.controllerUserId)}
                    {f.controllerUserId === me && <span className="ml-1.5 text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>(you)</span>}
                  </>
                ) : (
                  <span style={{ color: "var(--status-serious)" }}>Unassigned</span>
                )}
              </dd>
            </div>
          </dl>
          {canAssign && (
            <div className="mt-3">
              <AssignControllerForm fileId={f.id} controllers={controllers} />
            </div>
          )}
          {!canAssign && canTake && (
            <div className="mt-3">
              <AssignControllerForm fileId={f.id} controllers={[]} takeSelf={me} />
            </div>
          )}
        </Card>
      </div>

      {(openCases.length > 0 || canRaise) && (
        <Card
          title="Exceptions"
          subtitle="Findings and requests that Higher Management decides, with written grounds. Nothing here is ever approved or cleared automatically."
        >
          {openCases.length > 0 && (
            <ul className="mb-4 space-y-3">
              {openCases.map((e) => {
                const kind = e.kind as ExceptionKind;
                const blockedToMe = canDecide
                  ? decisionProblem({
                      state: e.state,
                      deciderUserId: me,
                      deciderPersonId: session.personId,
                      subjectPersonId: f.personId,
                      raisedById: e.raisedById,
                    })
                  : null;
                return (
                  <li key={e.id} className="rounded-md border p-3.5" style={{ borderColor: "var(--hairline)" }}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-[13px] font-medium">
                        {EXCEPTION_LABELS[kind]} <ClauseRef clause={EXCEPTION_CLAUSES[kind]} />
                      </p>
                      <StatusPill severity="warning" label={STATE_LABELS[e.state]} />
                    </div>
                    <p className="mt-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {e.trigger && `${RISK_TRIGGERS.find((t) => t.id === e.trigger)?.label ?? e.trigger}. `}
                      {e.amountGbp && `£${Number(e.amountGbp).toLocaleString("en-GB")}. `}
                      {e.periodFrom && e.periodTo && `Period ${formatDate(e.periodFrom)} to ${formatDate(e.periodTo)}. `}
                      {e.weeks && `${e.weeks} weeks. `}
                      {e.detail}
                    </p>
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Raised by {names.get(e.raisedById) ?? "—"} · {formatDate(e.raisedAt)}
                    </p>
                    {e.representation && (
                      <p className="mt-2 rounded-md px-2.5 py-2 text-[12px]" style={{ background: "var(--wash-neutral)" }}>
                        <span className="font-medium">Representation: </span>
                        {e.representation}
                      </p>
                    )}

                    {e.state === "awaiting_representation" &&
                      (f.administratorUserId === me && canDo(role, "screening.exception.raise") ? (
                        <RepresentationForm exceptionId={e.id} />
                      ) : (
                        <p className="mt-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                          The individual has been invited to make representation. The administrator records it; then it goes to Higher Management.
                        </p>
                      ))}
                    {e.state === "awaiting_decision" &&
                      (canDecide && !blockedToMe ? (
                        <DecisionForm exceptionId={e.id} outcomes={outcomeChoices(kind)} />
                      ) : (
                        <p className="mt-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                          With Higher Management to decide.{blockedToMe ? ` ${blockedToMe}` : ""}
                        </p>
                      ))}
                  </li>
                );
              })}
            </ul>
          )}
          {canRaise && (
            <div className="space-y-2">
              <RiskFindingForm fileId={f.id} triggers={RISK_TRIGGERS.map((t) => ({ id: t.id, label: t.label }))} />
              <ExtensionForm fileId={f.id} blockedBy={extensionBlocked} />
              <DeclarationForm fileId={f.id} blockedBy={declarationBlocked} />
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                A failed check opens an adverse finding by itself.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* The three gates */}
      <div className="grid gap-5 xl:grid-cols-3">
        {(
          [
            ["Gate 1 — conditional offer", "The BS 7858 minimum (7.5.1). Blocks the offer in Recruitment.", gate1],
            ["Deployment to site", "Our policy, stricter than the standard: adds criminality, right to work and signed documents.", deployment],
            ["Gate 3 — confirmed employment", "Full screening complete and reviewed (7.7).", gate3],
          ] as [string, string, GateResult][]
        ).map(([title, sub, g]) => (
          <Card key={title} title={title} subtitle={sub}>
            <StatusPill severity={g.open ? "good" : "critical"} label={g.open ? "Open" : "Blocked"} />
            {g.blockedBy.length > 0 && (
              <ul className="mt-2.5 space-y-1">
                {g.blockedBy.map((r) => (
                  <li key={r} className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    · {r}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      <Card
        title="Screening clock"
        subtitle={`${weeksAllowed(core.screeningPeriodYears)} weeks from the start of conditional employment${f.extensionWeeks ? `, plus a ${f.extensionWeeks}-week extension` : ""} (7.6).`}
      >
        {clock ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <Meter fraction={clock.fractionUsed} severity={clock.severity} label={`${Math.round(clock.fractionUsed * 100)}% of the allowed period used`} />
              <p className="mt-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                Conditional employment began <strong>{formatDate(f.conditionalEmploymentStart)}</strong>. If full screening is not complete by{" "}
                <strong>{formatDate(clock.ceaseDate)}</strong>, conditional employment must cease.
              </p>
            </div>
            <StatusPill severity={clock.severity} label={clock.expired ? "Expired" : `${formatDays(clock.daysRemaining)} left`} />
          </div>
        ) : (
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {f.controllerReview2At ? "Not needed — the file is complete." : "Not started. It starts when conditional employment does — when Recruitment allocates the PIN."}
          </p>
        )}
        {CONTRACT_CONDITION.conditionalEmploymentEndsIfIncomplete && !f.controllerReview2At && (
          <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            The contract makes confirmation depend on screening completing within this period <ClauseRef clause={CONTRACT_CONDITION.clause} />.
          </p>
        )}
      </Card>

      <Card
        title="Verification progress sheet"
        subtitle={editable ? "Annex A, Form 2. Update each check as it moves; request dates are stamped for you." : "Annex A, Form 2."}
      >
        {groups.map((group) => (
          <div key={group} className="mb-5 last:mb-0">
            <h3 className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-[12px] font-semibold">
              {GROUP_LABELS[group]}
              <span className="font-normal" style={{ color: "var(--text-muted)" }}>
                {GROUP_TIMING[group]}
              </span>
            </h3>
            <ul className="divide-y rounded-md border" style={{ borderColor: "var(--hairline)" }}>
              {f.checks
                .filter((c) => c.group === group)
                .map((c) => (
                  <li key={c.id} className="px-3 py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 max-w-2xl">
                        <p className="text-[13px]">
                          {c.label} <ClauseRef clause={c.clause} />
                        </p>
                        <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {[
                            c.firstRequestSentAt ? `1st request ${formatDate(c.firstRequestSentAt)}` : null,
                            c.secondRequestSentAt ? `2nd request ${formatDate(c.secondRequestSentAt)}` : null,
                            c.confirmedAt ? `confirmed ${formatDate(c.confirmedAt)}` : null,
                            c.ownerUserId ? names.get(c.ownerUserId) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Not yet requested"}
                        </p>
                        {c.notes && (
                          <p className="mt-1 text-[12px] leading-snug whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>
                            {c.notes}
                          </p>
                        )}
                      </div>
                      <StatusPill severity={CHECK_SEVERITY[c.status as CheckStatus]} label={CHECK_STATUS_LABELS[c.status as CheckStatus]} />
                    </div>
                    {editable && !isSignoff(c) && <CheckForm key={`${c.id}-${c.status}`} checkId={c.id} status={c.status} />}
                  </li>
                ))}
            </ul>
            {group === "history" && (
              <div className="mt-2.5 rounded-md px-3 py-2.5" style={{ background: "var(--wash-neutral)" }}>
                <p className="text-[12px]">
                  <strong className="tnum">{f.unverifiedDays}</strong> unverified days ·{" "}
                  <strong className="tnum">{f.gapsOver31Days}</strong> gap{f.gapsOver31Days === 1 ? "" : "s"} over 31 days{" "}
                  <ClauseRef clause="7.7" />
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Both must be zero before the completed file can be reviewed. Entered here until the per-employer history rows can calculate them.
                </p>
                {editable && (
                  <div className="mt-2">
                    <HistoryFiguresForm fileId={f.id} unverifiedDays={f.unverifiedDays} gapsOver31Days={f.gapsOver31Days} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Decisions" subtitle="Risk acceptances, extensions and statutory declarations, with their grounds.">
          {f.decisions.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              None recorded.
            </p>
          ) : (
            <ul className="space-y-3">
              {f.decisions.map((d) => (
                <li key={d.id} className="text-[12px]">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {DECISION_LABELS[d.kind] ?? d.kind}
                    {d.amountGbp ? ` · £${Number(d.amountGbp).toLocaleString("en-GB")}` : ""}
                    {d.outcome && (
                      <StatusPill
                        severity={d.outcome === "accepted" || d.outcome === "approved" ? "good" : "critical"}
                        label={OUTCOME_LABELS[d.outcome as DecisionOutcome]}
                      />
                    )}
                  </p>
                  <p style={{ color: "var(--text-secondary)" }}>{d.rationale}</p>
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {names.get(d.decidedById) ?? "—"} · {formatDate(d.decidedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="History" subtitle="Everything done on this file, newest first.">
          {events.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Nothing recorded on this file yet.
            </p>
          ) : (
            <ol className="space-y-2.5">
              {events.map((e) => (
                <li key={e.id} className="flex gap-3 text-[12px]">
                  <span aria-hidden className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full" style={{ background: "var(--series-1)" }} />
                  <div className="min-w-0">
                    <p>{e.detail ?? e.type}</p>
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {formatDate(e.at)} {formatTime(e.at)}
                      {e.actor ? ` · ${e.actor.displayName}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
