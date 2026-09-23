import { Card } from "@/components/ui/Card";
import { ClauseRef, StatusPill } from "@/components/ui/StatusPill";
import {
  CONTROL_TEAMS,
  ONBOARDING_PHASES,
  ONBOARDING_STEPS,
  doneSteps,
  signatureChase,
  waitingOn,
  type OnboardingStepKey,
  type StepSpec,
} from "@/lib/core/onboarding";
import { formatDate, formatTime } from "@/lib/format";
import { RECRUITMENT_STAGE_ORDER, ROLE_LABELS } from "@/lib/labels";
import type { RecruitmentStage, Role } from "@/lib/types";
import {
  NextOfKinForm,
  NoteForm,
  OnlineChecksForm,
  PinForm,
  SiaLicenceForm,
  TickButton,
  UndoButton,
} from "./OnboardingForms";

export interface RecordedStep {
  step: OnboardingStepKey;
  doneAt: Date;
  doneBy: string | null;
  note: string | null;
}

/**
 * The post-offer checklist for one candidate, in three phases.
 *
 * The phase for the candidate's current stage is the one that can be worked;
 * earlier phases are a record, later ones a preview. Nothing here decides
 * anything — the rules are lib/core/onboarding.ts, checked again on the server.
 */
export function OnboardingChecklist({
  candidacyId,
  stage,
  role,
  recorded,
  onlineChecks,
  personName,
}: {
  candidacyId: string;
  stage: RecruitmentStage;
  role: Role;
  recorded: RecordedStep[];
  /** The screening file already shows the online checks (lib/core/screening.ts). */
  onlineChecks: boolean;
  personName: string;
}) {
  const done = doneSteps(
    recorded.map((r) => r.step),
    onlineChecks,
  );
  const byKey = new Map(recorded.map((r) => [r.step, r]));
  // The full order, so a deployed candidate shows every phase as done.
  const at = RECRUITMENT_STAGE_ORDER.indexOf(stage);
  const manual = ONBOARDING_STEPS.filter((s) => s.kind !== "automatic");
  const doneCount = manual.filter((s) => done.has(s.key)).length;
  const packSent = byKey.get("pack_issued")?.doneAt;
  const control = ONBOARDING_STEPS.find((s) => s.key === "control_notified")!;

  return (
    <Card
      title="Onboarding checklist"
      subtitle={`${doneCount} of ${manual.length} done. Each phase has to be finished before the candidate moves on.`}
      action={
        <div
          className="h-1.5 w-40 overflow-hidden rounded-full"
          style={{ background: "var(--gridline)" }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={manual.length}
          aria-valuenow={doneCount}
          aria-label="Onboarding progress"
        >
          <div className="h-full rounded-full" style={{ width: `${(doneCount / manual.length) * 100}%`, background: "var(--series-1)" }} />
        </div>
      }
    >
      <ol className="space-y-5">
        {ONBOARDING_PHASES.map((phase, n) => {
          const steps = ONBOARDING_STEPS.filter((s) => s.stage === phase.stage);
          const phaseAt = RECRUITMENT_STAGE_ORDER.indexOf(phase.stage);
          const current = phase.stage === stage;
          const past = at > phaseAt;
          const phaseDone = steps.filter((s) => done.has(s.key)).length;
          const chase = current && phase.stage === "welcome_pack" && packSent ? signatureChase(packSent) : null;

          return (
            <li key={phase.stage}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold">
                  <span className="tnum mr-1.5" style={{ color: "var(--text-muted)" }}>
                    {n + 1}.
                  </span>
                  {phase.title}
                </h3>
                {past ? (
                  <StatusPill severity="good" label="Done" />
                ) : current ? (
                  <StatusPill severity="warning" label={`${phaseDone} of ${steps.length} · in progress`} />
                ) : (
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Not started
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                {phase.target}
              </p>

              {chase && (
                <div
                  className="mt-2 flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-[12px]"
                  style={{ background: "var(--wash-neutral)" }}
                >
                  <StatusPill severity={chase.severity} label={`Pack out ${chase.daysOut} day${chase.daysOut === 1 ? "" : "s"}`} />
                  <span style={{ color: "var(--text-secondary)" }}>{chase.next}</span>
                </div>
              )}

              <ul
                className="mt-2 divide-y rounded-md border"
                style={{ borderColor: "var(--hairline)", opacity: !current && !past ? 0.6 : 1 }}
              >
                {steps.map((s) => (
                  <StepRow
                    key={s.key}
                    spec={s}
                    candidacyId={candidacyId}
                    role={role}
                    workable={current}
                    record={byKey.get(s.key)}
                    derived={done.has(s.key) && !byKey.has(s.key)}
                    blockedBy={waitingOn(s, done).map((w) => w.label)}
                    personName={personName}
                  />
                ))}
              </ul>
            </li>
          );
        })}

        <li className="flex items-start gap-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
          <Check done={done.has("control_notified")} />
          <div>
            <p className="font-medium" style={{ color: "var(--text-primary)" }}>
              {control.label}
            </p>
            <p className="mt-0.5">
              {byKey.get("control_notified")
                ? `Sent ${formatDate(byKey.get("control_notified")!.doneAt)} at ${formatTime(byKey.get("control_notified")!.doneAt)}${byKey.get("control_notified")!.note ? ` to ${byKey.get("control_notified")!.note}` : ""}.`
                : control.detail}
            </p>
          </div>
        </li>
      </ol>
    </Card>
  );
}

function Check({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-semibold"
      style={
        done
          ? { background: "var(--series-1)", color: "#fff" }
          : { boxShadow: "0 0 0 1.5px var(--baseline) inset" }
      }
    >
      {done ? "✓" : ""}
    </span>
  );
}

function StepRow({
  spec,
  candidacyId,
  role,
  workable,
  record,
  derived,
  blockedBy,
  personName,
}: {
  spec: StepSpec;
  candidacyId: string;
  role: Role;
  workable: boolean;
  record: RecordedStep | undefined;
  derived: boolean;
  blockedBy: string[];
  personName: string;
}) {
  const isDone = Boolean(record) || derived;
  // Nothing to do on a step whose prerequisite is still open: say so instead.
  const mine = spec.roles.includes(role) && blockedBy.length === 0;
  const undoable = workable && record && (spec.kind === "tick" || spec.kind === "note") && mine;

  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <Check done={isDone} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className="text-[12px] font-medium">
              {spec.label}
              {spec.clause && (
                <span className="ml-1.5">
                  <ClauseRef clause={spec.clause} />
                </span>
              )}
              {spec.retiring && (
                <span className="ml-1.5 text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>
                  retiring
                </span>
              )}
            </p>
            {!isDone && spec.detail && (
              <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                {spec.detail}
              </p>
            )}
            {isDone && (
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                {derived
                  ? "Confirmed from the screening file."
                  : `${record!.doneBy ?? "Portal"} · ${formatDate(record!.doneAt)} ${formatTime(record!.doneAt)}`}
                {undoable && (
                  <>
                    {" · "}
                    <UndoButton candidacyId={candidacyId} step={spec.key} />
                  </>
                )}
              </div>
            )}
            {record?.note && (
              <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                {record.note}
              </p>
            )}
          </div>

          {!isDone && workable && mine && spec.kind === "tick" && <TickButton candidacyId={candidacyId} step={spec.key} />}
          {!isDone && workable && blockedBy.length > 0 && (
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              After: {blockedBy.join(", ").toLowerCase()}
            </span>
          )}
          {!isDone && workable && !mine && blockedBy.length === 0 && (
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Waiting on the {spec.owner}
              {spec.roles.length > 0 ? ` (${spec.roles.map((r) => ROLE_LABELS[r]).join(" or ")})` : ""}
            </span>
          )}
        </div>

        {!isDone && workable && mine && spec.kind === "note" && (
          <NoteForm
            candidacyId={candidacyId}
            step={spec.key}
            placeholder="e.g. Static guarding at a logistics depot, lone working at night. Screening risk acceptable pending full screening."
          />
        )}
        {!isDone && workable && mine && spec.kind === "next_of_kin" && <NextOfKinForm candidacyId={candidacyId} />}
        {!isDone && workable && mine && spec.kind === "online_checks" && <OnlineChecksForm candidacyId={candidacyId} />}
        {!isDone && workable && mine && spec.kind === "sia_licence" && (
          <SiaLicenceForm candidacyId={candidacyId} defaultName={personName} />
        )}
        {!isDone && workable && mine && spec.kind === "pin" && (
          <PinForm candidacyId={candidacyId} teams={CONTROL_TEAMS.map((t) => ({ id: t.id, label: t.label }))} />
        )}
      </div>
    </li>
  );
}
