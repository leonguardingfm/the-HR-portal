import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { ClauseRef, StatusPill } from "@/components/ui/StatusPill";
import { requireSession } from "@/lib/auth/server";
import {
  ONBOARDING_PHASES,
  ONBOARDING_STEPS,
  doneSteps,
  outstandingFor,
  signatureChase,
  type OnboardingStepKey,
} from "@/lib/core/onboarding";
import { daysIn, stageSeverity } from "@/lib/core/recruitment";
import { getOnboardingBoard } from "@/lib/db/recruitment";
import { formatDays } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Onboarding: everyone from conditional offer to onboarding complete.
 *
 * One column per phase of the checklist, each card saying what is still to do
 * for that person. The checklist itself is worked on the candidate's own page;
 * this is the board that shows where the queue is.
 */
export default async function OnboardingPage() {
  await requireSession();
  const rows = await getOnboardingBoard();
  const now = new Date();

  const cards = rows.map((r) => {
    const done = doneSteps(r.steps.map((s) => s.step as OnboardingStepKey), r.onlineChecks);
    const inPhase = ONBOARDING_STEPS.filter((s) => s.stage === r.stage);
    const outstanding = outstandingFor(r.stage, done);
    const packSent = r.steps.find((s) => s.step === "pack_issued")?.doneAt;
    const days = daysIn(r.stageSince, now);
    return {
      ...r,
      days,
      severity: stageSeverity(r.stage, days),
      phaseDone: inPhase.length - outstanding.length,
      phaseTotal: inPhase.length,
      outstanding,
      chase: r.stage === "welcome_pack" && packSent ? signatureChase(packSent, now) : null,
    };
  });

  const byStage = (stage: string) => cards.filter((c) => c.stage === stage);
  const chaseDue = cards.filter((c) => c.chase && c.chase.severity !== "good").length;
  const late = cards.filter((c) => c.severity === "serious" || c.severity === "critical").length;
  const ready = byStage("onboarding_complete");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Onboarding"
        description="Everyone from conditional offer to onboarding complete, and what is left for each. Open a candidate to work their checklist."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="In onboarding" value={cards.length - ready.length} detail="Offer to signed documents" />
        <StatTile
          label="Over their stage target"
          value={late}
          detail="Longer in stage than our SLA"
          severity={late > 0 ? "serious" : "good"}
          hero={late > 0}
        />
        <StatTile
          label="Signature chase due"
          value={chaseDue}
          detail="Welcome pack out 2 days or more"
          severity={chaseDue > 0 ? "warning" : "good"}
        />
        <StatTile label="Ready for deployment" value={ready.length} detail="Onboarded; Control notified" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {ONBOARDING_PHASES.map((phase, n) => {
          const list = byStage(phase.stage);
          return (
            <section
              key={phase.stage}
              className="flex flex-col rounded-lg border"
              style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}
            >
              <header className="border-b px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-[13px] font-semibold">
                    <span className="tnum mr-1.5" style={{ color: "var(--text-muted)" }}>
                      {n + 1}.
                    </span>
                    {phase.title}
                  </h2>
                  <span className="tnum text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {list.length}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {phase.target}
                </p>
              </header>
              <ul className="flex-1 space-y-2 p-3">
                {list.length === 0 && (
                  <li className="px-1 py-4 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
                    Nobody at this stage.
                  </li>
                )}
                {list.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/candidates/${c.id}`}
                      className="block rounded-md border p-3 transition-colors hover:bg-[var(--wash)]"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium">{c.name}</p>
                        {c.severity === "neutral" ? null : (
                          <StatusPill severity={c.severity} label={formatDays(c.days)} />
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {c.client ?? "General pool"} · {c.ownerName ?? "unassigned"}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--gridline)" }} aria-hidden>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(c.phaseDone / c.phaseTotal) * 100}%`, background: "var(--series-1)" }}
                          />
                        </div>
                        <span className="tnum text-[11px]" style={{ color: "var(--text-secondary)" }}>
                          {c.phaseDone}/{c.phaseTotal}
                        </span>
                      </div>
                      {c.chase && (
                        <p className="mt-2">
                          <StatusPill severity={c.chase.severity} label={c.chase.next} />
                        </p>
                      )}
                      {c.outstanding.length > 0 ? (
                        <p className="mt-2 text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                          Next: {c.outstanding[0]!.label}
                          {c.outstanding.length > 1 ? ` · +${c.outstanding.length - 1} more` : ""}
                        </p>
                      ) : (
                        <p className="mt-2 text-[11px]" style={{ color: "var(--status-good)" }}>
                          ✓ Phase complete — ready to move on
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {ready.length > 0 && (
        <Card title="Ready for deployment" subtitle="Onboarding complete. Control has a task for each; deployment goes through the screening file's gate.">
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {ready.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px]">
                <Link href={`/candidates/${c.id}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
                <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {c.pin ? `PIN ${c.pin}` : "No PIN"} · {c.client ?? "General pool"} · onboarded{" "}
                  {c.days === 0 ? "today" : `${formatDays(c.days)} ago`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <details className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}>
        <summary className="cursor-pointer px-5 py-3.5 text-[13px] font-semibold select-none">
          The checklist, step by step
        </summary>
        <div className="space-y-4 border-t px-5 pt-4 pb-5" style={{ borderColor: "var(--hairline)" }}>
          {ONBOARDING_PHASES.map((phase, n) => (
            <div key={phase.stage}>
              <p className="text-[12px] font-semibold">
                {n + 1}. {phase.title}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {ONBOARDING_STEPS.filter((s) => s.stage === phase.stage).map((s) => (
                  <li key={s.key} className="text-[12px] leading-snug">
                    <span className="font-medium">{s.label}</span>
                    {s.clause && (
                      <span className="ml-1.5">
                        <ClauseRef clause={s.clause} />
                      </span>
                    )}
                    <span style={{ color: "var(--text-muted)" }}>
                      {" "}
                      — {s.owner}
                      {s.detail ? `. ${s.detail}` : "."}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Then, automatically: {ONBOARDING_STEPS.find((s) => s.key === "control_notified")!.detail}
          </p>
        </div>
      </details>

      <ModuleOutline
        subtitle="Still to come. PIN allocation and the Control notification are built — see the checklist above. Client PRN mapping follows once sites issue their own references."
        items={[
          {
            label: "SIA-badge name propagation",
            detail: "One verified spelling flows to the officer record, the Recruitment Sheet view and every export, instead of being retyped into each.",
            phase: 1,
          },
          {
            label: "SIA status monitoring",
            detail: "The Watch List is checked twice daily by hand today. The portal holds every licence number already, so it can run that check and raise an officer who has gone inactive as a task.",
            clause: "7.4c1",
            phase: 2,
          },
          {
            label: "Casper integration",
            detail: "Push the hire to Casper from the record already captured, rather than retyping it. Its API is confirmed.",
            phase: 2,
          },
          {
            label: "Google Maps placement",
            detail: "Add the officer's area to the map Control uses for deployment, once we agree what is plotted and who can see it.",
            phase: 3,
          },
        ]}
      />
    </div>
  );
}
