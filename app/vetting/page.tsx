import { Card } from "@/components/ui/Card";
import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClauseRef, StatusPill, Tag } from "@/components/ui/StatusPill";
import { VettingClockBoard } from "@/components/dashboard/VettingClockBoard";
import { evaluateGate1, evaluateGate2 } from "@/lib/bs7858";
import { evaluateDeploymentGate, reviewIndependence } from "@/lib/policy";
import { CHECK_STATUS_LABELS, RECRUITMENT_STAGE_ORDER } from "@/lib/labels";
import {
  candidateById,
  requiredInterviewsHeld,
  interviewsFor,
  screeningFiles,
} from "@/lib/mock/data";
import type { CheckGroup, CheckStatus, Severity } from "@/lib/types";

const GROUP_LABELS: Record<CheckGroup, string> = {
  consent: "Consent and authorisation",
  preliminary: "Preliminary checks",
  history: "Career and history",
  criminality: "Criminality",
  legal: "Legal (outside BS 7858 scope)",
  signoff: "Sign-off",
  exception: "Exceptions",
};

/**
 * When each group has to be complete. Everything except the career history is
 * done before the officer reaches a client site; the history verification is
 * the one piece of work the 12-week clock measures.
 */
const GROUP_TIMING: Record<CheckGroup, string> = {
  consent: "With the application",
  preliminary: "Before deployment",
  history: "Within 12 weeks of deployment",
  criminality: "Before deployment (our policy)",
  legal: "Before deployment",
  signoff: "Before deployment, then again at completion",
  exception: "As they arise",
};

function checkSeverity(status: CheckStatus): Severity {
  switch (status) {
    case "verified":
      return "good";
    case "received":
      return "warning";
    case "chased":
      return "serious";
    case "failed":
      return "critical";
    case "not_applicable":
      return "neutral";
    default:
      return "warning";
  }
}

/**
 * Screening file detail.
 *
 * Structured as the standard's own verification progress sheet (Annex A,
 * Form 2) — a checklist of named checks, each with its clause, status, owner
 * and request dates — so the file reads the same way as the paper record an
 * auditor will recognise.
 */
export default function VettingPage() {
  // The most urgent open file stands in for the detail view until Phase 1.
  const file = screeningFiles[0];
  const candidate = candidateById(file.candidateId);

  // Signed Welcome Pack documents are a recruitment-track fact, so it is read
  // off the candidate's stage rather than duplicated onto the screening file.
  const signedDocumentsComplete =
    candidate !== undefined &&
    RECRUITMENT_STAGE_ORDER.indexOf(candidate.stage) >=
      RECRUITMENT_STAGE_ORDER.indexOf("signed_docs_complete");

  const interviewHeld = requiredInterviewsHeld(file.candidateId);
  const heldInterviews = interviewsFor(file.candidateId);

  const gate1 = evaluateGate1(file, {
    riskEvaluationDocumented: true,
    finalInterviewHeld: interviewHeld,
  });
  const deployment = evaluateDeploymentGate(file, {
    riskEvaluationDocumented: true,
    finalInterviewHeld: interviewHeld,
    signedDocumentsComplete,
  });
  const gate2 = evaluateGate2(file);

  // Clause 6.1 asks for attention to the division of functions between
  // interviewing, screening and the decision to employ. Our arrangement
  // satisfies it: Farhan interviews, Anas and Talha control the files.
  const independence = reviewIndependence({
    controllerUserId: file.controller ?? null,
    interviewerUserIds: heldInterviews.map((i) => i.interviewer),
  });

  const groups = Object.keys(GROUP_LABELS) as CheckGroup[];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Vetting"
        description="BS 7858:2019 screening files. One file per individual, with conditionally employed files flagged separately from other employee files (clause 7.2). Anas and Talha alternate administrator and controller per file, so the same person never signs off their own work."
      />

      <VettingClockBoard />

      <div className="grid gap-5 xl:grid-cols-3">
        <Card
          title="Gate 1 — conditional offer"
          subtitle="The BS 7858 minimum. Blocks the conditional offer, the Welcome Pack and the employment contract."
        >
          <StatusPill severity={gate1.open ? "good" : "critical"} label={gate1.open ? "Open" : "Blocked"} />
          <p className="mt-3 text-[13px]">{gate1.reason}</p>
          {gate1.blockedBy.length > 0 && (
            <ul className="mt-2 space-y-1">
              {gate1.blockedBy.map((r) => (
                <li key={r} className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  · {r}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Requires every interview stage the client asks for{" "}
            <ClauseRef clause="7.3.4" />, a documented risk evaluation,
            satisfactory preliminary checks, and limited screening confirmed by
            the controller. <ClauseRef clause="7.5.1" />
          </p>
          {!independence.independent && independence.warning && (
            <p className="mt-2 text-[11px]" style={{ color: "var(--status-serious)" }}>
              ⚠ {independence.warning}
            </p>
          )}
        </Card>

        <Card
          title="Gate 2 — deployment to site"
          subtitle="Our own policy, stricter than the standard. This is the gate that decides whether an officer can be rostered."
        >
          <StatusPill
            severity={deployment.open ? "good" : "critical"}
            label={deployment.open ? "Open" : "Blocked"}
          />
          <p className="mt-3 text-[13px]">{deployment.reason}</p>
          {deployment.blockedBy.length > 0 && (
            <ul className="mt-2 space-y-1">
              {deployment.blockedBy.map((r) => (
                <li key={r} className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  · {r}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Adds the criminality element and right to work to Gate 1. The
            standard places <ClauseRef clause="7.7j" /> inside full screening,
            so it would permit deployment without it — we do not.
          </p>
        </Card>

        <Card
          title="Gate 3 — confirmed employment"
          subtitle="No offer of confirmed employment unless full screening has completed satisfactorily."
        >
          <StatusPill severity={gate2.open ? "good" : "serious"} label={gate2.open ? "Open" : "Blocked"} />
          <p className="mt-3 text-[13px]">{gate2.reason}</p>
          {gate2.blockedBy.length > 0 && (
            <ul className="mt-2 space-y-1">
              {gate2.blockedBy.map((r) => (
                <li key={r} className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  · {r}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            The five-year history verified with no unverified period over 31
            days, then reviewed by the controller. <ClauseRef clause="7.7" />
          </p>
        </Card>
      </div>

      <Card
        title={`Screening file — ${candidate?.fullName ?? file.candidateId}`}
        subtitle="Structured as the standard's verification progress sheet (Annex A, Form 2)."
        action={
          <div className="flex flex-wrap gap-1.5">
            <Tag>{file.screeningPeriodYears}-year period</Tag>
            <Tag>Administrator: {file.administrator}</Tag>
            <Tag>Controller: {file.controller ?? "Unassigned"}</Tag>
          </div>
        }
      >
        {groups.map((group) => {
          const checks = file.checks.filter((c) => c.group === group);
          if (checks.length === 0) return null;
          return (
            <div key={group} className="mb-4 last:mb-0">
              <h3 className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-[12px] font-semibold">
                {GROUP_LABELS[group]}
                <span className="font-normal" style={{ color: "var(--text-muted)" }}>
                  {GROUP_TIMING[group]}
                </span>
              </h3>
              <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                {checks.map((check) => (
                  <li key={check.id} className="flex flex-wrap items-start justify-between gap-3 py-2">
                    <div className="min-w-0 max-w-2xl">
                      <p className="text-[13px]">
                        {check.label} <ClauseRef clause={check.clause} />
                      </p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {check.firstRequestSentAt && "1st request sent"}
                        {check.secondRequestSentAt && " · 2nd request sent"}
                        {check.confirmedAt && " · confirmed"}
                        {!check.firstRequestSentAt && "Not yet requested"}
                        {check.owner && ` · ${check.owner}`}
                      </p>
                    </div>
                    <StatusPill
                      severity={checkSeverity(check.status)}
                      label={CHECK_STATUS_LABELS[check.status]}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Request dates are logged on every check, because the 1st and 2nd
          request columns are both what Form 2 asks for and the evidence needed
          to justify a deadline extension under clause 7.6.
        </p>
      </Card>

      <ModuleOutline
        note="Automation is explicitly recognised by the 2019 edition, but where any element of screening is automated the provisions of the standard still apply (clause 7.1) — so the portal chases, calculates and pre-fills freely, while the evidence trail and the human sign-offs stay intact."
        items={[
          {
            label: "One row per career-history period",
            detail: "Dates as stated and as confirmed, the verifier's organisation, how their contact detail was independently verified, 1st and 2nd request dates, confirmation, and the documentary-evidence fallback.",
            clause: "7.7",
            phase: 1,
          },
          {
            label: "Automatic gap calculation",
            detail: "Unverified days computed from the declared timeline, every gap over 31 days flagged, and statutory declaration eligibility derived rather than judged by eye.",
            clause: "7.7i",
            phase: 2,
          },
          {
            label: "Independent contact verification",
            detail: "A telephone number supplied by the candidate must not be relied upon; the number called has to be established independently, and how that was done is recorded.",
            clause: "7.5.2a",
            phase: 1,
          },
          {
            label: "Permission-to-contact flag per employer",
            detail: "A current employer must not be approached without the individual's prior written permission. The flag drives whether a reference request can be sent at all.",
            clause: "7.7b",
            phase: 1,
          },
          {
            label: "Controller review queue",
            detail: "Two reviews per file. The controller cannot be the administrator who built it, and no one may review their own file — enforced as a hard rule, not a policy note.",
            clause: "6.1, 7.5.2b",
            phase: 1,
          },
          {
            label: "Sanctions list sync",
            detail: "The HM Treasury consolidated list is published as a downloadable file, so screening can re-run daily — which also catches someone appearing on the list after they were cleared.",
            clause: "7.4e",
            phase: 3,
          },
          {
            label: "SIA register evidence",
            detail: "No public API, so expect a prompted manual lookup with the search result uploaded and retained, plus automatic diarising of the expiry.",
            clause: "7.4c1",
            phase: 2,
          },
          {
            label: "Retention and secure disposal",
            detail: "Twelve months for those unsuccessful at preliminary screening, seven years after employment ends for the listed records, with a controller-approved disposal step.",
            clause: "11.1, 11.3",
            phase: 2,
          },
        ]}
      />
    </div>
  );
}
