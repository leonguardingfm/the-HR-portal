import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { AdvanceButton, InterviewForm, WithdrawForm } from "@/components/recruitment/CandidateActions";
import { InterviewChips } from "@/components/recruitment/InterviewChips";
import { OnboardingChecklist } from "@/components/recruitment/OnboardingChecklist";
import { ApplicationPanel, ApplicationSummary, EditDetails, InterviewDiary, WelcomePackPanel, type ApplicationState, type PackState } from "@/components/recruitment/SelfService";
import { db } from "@/lib/db/client";
import { usersHolding } from "@/lib/db/push";
import { canAccessPath } from "@/components/layout/nav";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import {
  END_STAGES,
  INTERVIEW_ROLES,
  RECRUITMENT_PIPELINE,
  STAGE_INTERVIEW,
  canAdvance,
  canRecordInterview,
  daysIn,
  requiredInterviews,
  stageSeverity,
} from "@/lib/core/recruitment";
import { CONTROL_TEAMS, ONBOARDING_STAGES, doneSteps, type OnboardingStepKey } from "@/lib/core/onboarding";
import { offerBlockers, onlineChecksOnFile } from "@/lib/core/screening";
import { getCandidacy } from "@/lib/db/recruitment";
import { formatDate, formatDays, formatTime } from "@/lib/format";
import {
  INTERVIEW_STAGE_LABELS,
  RECRUITMENT_STAGE_LABELS,
  ROLE_LABELS,
  SOURCE_LABELS,
  VETTING_STATUS_LABELS,
} from "@/lib/labels";
import type { VettingStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const OUTCOME = {
  progress: { label: "Progress", severity: "good" },
  hold: { label: "On hold", severity: "warning" },
  reject: { label: "Reject", severity: "critical" },
} as const;

/**
 * One candidate.
 *
 * Where they are, what is stopping them moving on, the interviews held, and
 * everything Recruitment has done with them — the record that replaces the
 * Interview Sheet and the Recruitment Sheet.
 */
export default async function CandidatePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const c = await getCandidacy(id);
  if (!c) notFound();
  // The self-service: the application link, the emails sent, the interview diary.
  const [invite, pack, emails, bookings, interviewerIds, personRow] = await Promise.all([
    db.candidateInvite.findFirst({ where: { candidacyId: c.id, purpose: "application" }, orderBy: { createdAt: "desc" } }),
    db.candidateInvite.findFirst({ where: { candidacyId: c.id, purpose: "welcome_pack" }, orderBy: { createdAt: "desc" } }),
    db.emailMessage.findMany({ where: { candidacyId: c.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.interviewBooking.findMany({ where: { candidacyId: c.id }, orderBy: { startsAt: "desc" } }),
    usersHolding(["recruitment", "recruitment_manager", "top_management"]),
    db.person.findUnique({ where: { id: c.person.id }, select: { nationalInsurance: true, address: true, postcode: true } }),
  ]);
  const people = await db.user.findMany({ where: { id: { in: [...interviewerIds, ...bookings.map((b) => b.interviewerUserId).filter((x): x is string => !!x)] } }, select: { id: true, displayName: true } });
  const nameOf = new Map(people.map((u) => [u.id, u.displayName]));
  const appState: ApplicationState = {
    state: !invite ? "none" : invite.submittedAt ? "submitted" : invite.revokedAt ? "none" : invite.expiresAt < new Date() ? "expired" : invite.openedAt ? "opened" : "sent",
    sentAt: invite?.createdAt.toISOString() ?? null,
    openedAt: invite?.openedAt?.toISOString() ?? null,
    submittedAt: invite?.submittedAt?.toISOString() ?? null,
    expiresAt: invite?.expiresAt.toISOString() ?? null,
    reminders: invite?.reminders ?? 0,
    stepsDone: ((invite?.draft as { done?: string[] } | null)?.done ?? []).length,
  };
  const packState: PackState = {
    state: !pack ? "none" : pack.submittedAt ? "signed" : pack.revokedAt ? "none" : pack.expiresAt < new Date() ? "expired" : pack.openedAt ? "opened" : "sent",
    sentAt: pack?.createdAt.toISOString() ?? null,
    openedAt: pack?.openedAt?.toISOString() ?? null,
    signed: pack?.signedAt ? `as “${pack.signedName}”, ${formatDate(pack.signedAt)} ${formatTime(pack.signedAt)}` : null,
    expiresAt: pack?.expiresAt.toISOString() ?? null,
    reminders: pack?.reminders ?? 0,
  };

  const now = new Date();
  const days = daysIn(c.stageSince, now);
  const severity = stageSeverity(c.stage, days);
  const held = c.interviews.map((i) => ({ stage: i.stage, outcome: i.outcome }));
  const recorded = c.onboardingSteps.map((s) => ({
    step: s.step as OnboardingStepKey,
    doneAt: s.doneAt,
    doneBy: s.doneBy?.displayName ?? null,
    note: s.note,
  }));
  const advance = canAdvance({
    stage: c.stage,
    interviews: held,
    requiresAdditional: c.requiresAdditional,
    onboardingDone: doneSteps(
      recorded.map((r) => r.step),
      onlineChecksOnFile(c.screening),
    ),
    screeningBlockers: offerBlockers(c.screening),
  });
  const showChecklist = ONBOARDING_STAGES.includes(c.stage) || recorded.length > 0;
  const employment = c.person.employment;
  const licence = c.person.licences[0];
  const closed = END_STAGES.includes(c.stage);
  const waitingOn = STAGE_INTERVIEW[c.stage];
  const interviewPassed = waitingOn ? held.some((h) => h.stage === waitingOn && h.outcome === "progress") : false;

  const advanceDenied = deniedReason(session.activeRole, "candidacy.advance");
  const interviewDenied =
    advanceDenied ??
    (waitingOn && !canRecordInterview(session.activeRole, waitingOn)
      ? `The ${INTERVIEW_STAGE_LABELS[waitingOn].toLowerCase()} interview is held by the ${INTERVIEW_ROLES[waitingOn]
          .map((r) => ROLE_LABELS[r])
          .join(" or ")}. You are working as ${ROLE_LABELS[session.activeRole]}.`
      : null);

  // The steps this candidate actually goes through: the client interview only
  // where their client asks for one.
  const steps = RECRUITMENT_PIPELINE.filter((s) => s !== "additional_interview" || c.requiresAdditional);
  const at = steps.indexOf(c.stage);

  return (
    <div className="space-y-5">
      <nav className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/candidates" className="hover:underline">
          Candidates
        </Link>{" "}
        / {c.person.fullName}
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{c.person.fullName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>
              {RECRUITMENT_STAGE_LABELS[c.stage]}
            </span>
            {severity === "neutral" ? (
              <span>· {formatDays(days)} in stage</span>
            ) : (
              <StatusPill severity={severity} label={`${formatDays(days)} in stage`} />
            )}
            <span>· Owner: {c.ownerName ?? "unassigned"}</span>
          </p>
        </div>
      </header>

      {/* Stage tracker */}
      <Card>
        <div className="-mx-5 overflow-x-auto px-5 pt-5">
          {c.stage === "withdrawn" ? (
            <p className="text-[13px]">
              <strong>Withdrawn</strong>
              {c.withdrawnReason && (
                <span style={{ color: "var(--text-secondary)" }}> — {c.withdrawnReason}</span>
              )}
            </p>
          ) : (
            <ol className="flex min-w-max items-start">
              {steps.map((s, i) => {
                const done = at >= 0 && i < at;
                const current = i === at;
                return (
                  <li key={s} className="flex items-start">
                    <div className="flex w-[5.5rem] flex-col items-center text-center">
                      <span
                        aria-hidden
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold"
                        style={{
                          background: done ? "var(--series-1)" : current ? "var(--surface-1)" : "var(--wash-neutral)",
                          color: done ? "#fff" : current ? "var(--series-1)" : "var(--text-muted)",
                          boxShadow: current ? "0 0 0 2px var(--series-1) inset" : undefined,
                        }}
                      >
                        {done ? "✓" : i + 1}
                      </span>
                      <span
                        className="mt-1.5 text-[11px] leading-tight"
                        style={{
                          color: current ? "var(--text-primary)" : "var(--text-muted)",
                          fontWeight: current ? 600 : 400,
                        }}
                      >
                        {RECRUITMENT_STAGE_LABELS[s].replace(/ \(.*\)$/, "")}
                        {current && <span className="sr-only"> (current stage)</span>}
                      </span>
                    </div>
                    {i < steps.length - 1 && (
                      <span
                        aria-hidden
                        className="mt-3 h-0.5 w-4"
                        style={{ background: done ? "var(--series-1)" : "var(--gridline)" }}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <Card
            title="Next step"
            subtitle={
              closed
                ? c.stage === "withdrawn"
                  ? "This candidate has been withdrawn."
                  : "Recruitment's part is complete. Deployment is decided by the screening file's deployment gate."
                : advance.to
                  ? `Next: ${RECRUITMENT_STAGE_LABELS[advance.to]}`
                  : undefined
            }
          >
            {!closed && (
              <div className="space-y-5">
                {waitingOn && !interviewPassed && (
                  <div className="rounded-md border p-4" style={{ borderColor: "var(--hairline)" }}>
                    <p className="mb-3 text-[13px] font-medium">
                      Record the {INTERVIEW_STAGE_LABELS[waitingOn].toLowerCase()} interview
                    </p>
                    <InterviewForm
                      candidacyId={c.id}
                      stageLabel={INTERVIEW_STAGE_LABELS[waitingOn]}
                      denied={interviewDenied}
                    />
                  </div>
                )}
                <AdvanceButton
                  candidacyId={c.id}
                  toLabel={advance.to ? RECRUITMENT_STAGE_LABELS[advance.to] : null}
                  blockedBy={advance.permitted ? null : advance.reason}
                  denied={advanceDenied}
                />
                <WithdrawForm candidacyId={c.id} denied={deniedReason(session.activeRole, "candidacy.withdraw")} />
              </div>
            )}
          </Card>

          {c.stage !== "withdrawn" && (
            <ApplicationPanel
              candidacyId={c.id}
              app={appState}
              emails={emails.map((e) => ({ id: e.id, to: e.to, subject: e.subject, body: e.body, status: e.status, createdAt: e.createdAt.toISOString() }))}
              denied={deniedReason(session.activeRole, "candidate.invite")}
              hasEmail={!!c.person.email}
            />
          )}

          {c.stage !== "withdrawn" && (pack || ["conditional_offer", "welcome_pack"].includes(c.stage)) && (
            <WelcomePackPanel
              candidacyId={c.id}
              pack={packState}
              ready={
                !["conditional_offer", "welcome_pack"].includes(c.stage)
                  ? "The pack goes out at the conditional offer or welcome pack stage."
                  : c.onboardingSteps.some((x) => x.step === "offer_issued")
                    ? null
                    : "Tick “Conditional offer issued” on the onboarding checklist first — the pack follows the offer."
              }
              denied={deniedReason(session.activeRole, "candidate.invite")}
              hasEmail={!!c.person.email}
            />
          )}

          {invite?.submission && <ApplicationSummary d={invite.submission as never} signed={invite.signedAt ? `as “${invite.signedName}”, ${formatDate(invite.signedAt)} ${formatTime(invite.signedAt)}` : null} />}

          {showChecklist && (
            <OnboardingChecklist
              candidacyId={c.id}
              stage={c.stage}
              role={session.activeRole}
              recorded={recorded}
              onlineChecks={onlineChecksOnFile(c.screening)}
              personName={c.person.fullName}
            />
          )}

          <Card
            title="Interviews"
            subtitle={`Needed before any offer [7.3.4]: ${requiredInterviews(c.requiresAdditional)
              .map((s) => INTERVIEW_STAGE_LABELS[s].toLowerCase())
              .join(", ")}.`}
            action={<InterviewChips required={requiredInterviews(c.requiresAdditional)} held={held} />}
          >
            <div className="mb-4">
              <InterviewDiary
                candidacyId={c.id}
                bookings={bookings.map((b) => ({ id: b.id, stage: b.stage, startsAt: b.startsAt.toISOString(), minutes: b.minutes, place: b.place, interviewer: b.interviewerUserId ? (nameOf.get(b.interviewerUserId) ?? null) : null, status: b.status, cancelledReason: b.cancelledReason }))}
                interviewers={interviewerIds.map((id) => ({ id, name: nameOf.get(id) ?? "?" }))}
                denied={closed ? "closed" : deniedReason(session.activeRole, "interview.book")}
              />
            </div>
            {c.interviews.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                No interviews recorded yet.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                {c.interviews.map((i) => (
                  <li key={i.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13px] font-medium">{INTERVIEW_STAGE_LABELS[i.stage]} interview</p>
                      <StatusPill severity={OUTCOME[i.outcome].severity} label={OUTCOME[i.outcome].label} />
                    </div>
                    <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {formatDate(i.heldAt)} at {formatTime(i.heldAt)}
                      {i.interviewerName ? ` · ${i.interviewerName}` : ""}
                    </p>
                    {i.notes && (
                      <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        {i.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card
            title="Details"
            action={
              <EditDetails
                candidacyId={c.id}
                person={{
                  fullName: c.person.fullName,
                  email: c.person.email,
                  phone: c.person.phone,
                  dateOfBirth: c.person.dateOfBirth ? new Date(c.person.dateOfBirth).toISOString().slice(0, 10) : null,
                  nationalInsurance: personRow?.nationalInsurance ?? null,
                  address: personRow?.address ?? null,
                  postcode: personRow?.postcode ?? null,
                }}
                denied={deniedReason(session.activeRole, "candidacy.edit")}
              />
            }
          >
            <dl className="grid grid-cols-1 gap-3 text-[13px]">
              {[
                ["Email", c.person.email],
                ["Phone", c.person.phone],
                ["Date of birth", c.person.dateOfBirth ? formatDate(c.person.dateOfBirth) : null],
                ["Address", personRow?.address ? `${personRow.address}${personRow.postcode ? `, ${personRow.postcode}` : ""}` : null],
                ["Source", c.source ? SOURCE_LABELS[c.source] : null],
                [
                  "Requirement",
                  c.requirement
                    ? `${c.requirement.reference} · ${c.requirement.client.name} — ${c.requirement.site.name}`
                    : "General pool",
                ],
                ["In pipeline since", formatDate(c.person.firstContactAt)],
                ...(employment
                  ? [
                      [
                        "PIN",
                        `${employment.pin} · ${CONTROL_TEAMS.find((t) => t.id === employment.controlTeam)?.label ?? "no Control team"} · from ${formatDate(employment.startedAt)}`,
                      ],
                    ]
                  : []),
                ...(licence
                  ? [["SIA licence", `${licence.number} · "${licence.nameOnBadge}" · expires ${formatDate(licence.expiresAt)}`]]
                  : []),
                ...(c.person.nextOfKinName
                  ? [["Next of kin", `${c.person.nextOfKinName} · ${c.person.nextOfKinPhone ?? ""}`]]
                  : []),
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {k}
                  </dt>
                  <dd>{v ?? <span style={{ color: "var(--text-muted)" }}>Not recorded</span>}</dd>
                </div>
              ))}
              <div>
                <dt className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Vetting (BS 7858)
                </dt>
                <dd>
                  {c.vettingStatus && c.screeningFileId ? (
                    // Screening files are confidential to the vetting team and
                    // management [6.1]; everyone else sees the status only.
                    canAccessPath(session.activeRole, "/vetting") ? (
                      <Link
                        href={`/vetting/${c.screeningFileId}`}
                        className="underline-offset-2 hover:underline"
                        style={{ color: "var(--series-1)" }}
                      >
                        {VETTING_STATUS_LABELS[c.vettingStatus as VettingStatus]}
                      </Link>
                    ) : (
                      VETTING_STATUS_LABELS[c.vettingStatus as VettingStatus]
                    )
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>No screening file yet — Vetting opens one</span>
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="History" subtitle="Everything Recruitment has recorded, newest first.">
            {c.events.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                Nothing recorded yet.
              </p>
            ) : (
              <ol className="space-y-3">
                {c.events.map((e) => (
                  <li key={e.id} className="flex gap-3 text-[12px]">
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full"
                      style={{ background: "var(--series-1)" }}
                    />
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
    </div>
  );
}
